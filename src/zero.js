// Thin wrapper around the Zero CLI (`zero fetch`) plus the governance gate.
//
// Every paid service call flows through gate() first (the Pomerium-style policy +
// audit trail), then shells out to `zero fetch ... --json` and parses the envelope.

import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIT_LOG = join(__dirname, "..", "logs", "audit.jsonl");
// Cache lives in data/ (committed) so a hosted deployment can replay the
// recorded real transactions without a funded Zero wallet.
const CACHE_DIR = join(__dirname, "..", "data", "cache");

// REPLAY=1 reuses cached responses (no payment) — for dev iteration and rehearsal.
export const REPLAY = process.env.REPLAY === "1";
try { mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
const cachePath = (candId, svcId) => join(CACHE_DIR, `${candId}__${svcId}.json`);

// Resolve the `zero` runner once (per the zero skill's resolution order).
const ZERO = process.env.ZERO_RUNNER || "zero";

// --- Governance gate (Pomerium-style policy + audit) --------------------------
// Policy: calls at or below GATE_THRESHOLD auto-allow; above it they are "gated"
// (flagged for elevated approval). In autonomous mode the policy agent approves
// gated calls but every decision is written to the immutable audit trail.
export const GATE_THRESHOLD = Number(process.env.GATE_THRESHOLD ?? 0.1);
export const HARD_DENY = process.env.HARD_DENY === "1"; // deny gated calls outright

let auditSeq = 0;
function audit(record) {
  const entry = { seq: ++auditSeq, ts: new Date().toISOString(), ...record };
  try {
    appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n");
  } catch {}
  return entry;
}

const POMERIUM_URL = process.env.POMERIUM_URL || "http://localhost:8000";

// Ask the real Pomerium proxy to authorize this purchase. Over-threshold calls in
// lockdown are routed to the deny route (Pomerium returns 403). Pomerium logs every
// decision. Falls back to in-process policy if Pomerium is unreachable.
async function pomeriumAuthorize({ service, price }) {
  const elevated = price > GATE_THRESHOLD;
  const lockdown = HARD_DENY && elevated;
  const path = lockdown ? "/pomerium-authz/denied" : "/pomerium-authz/check";
  const url = `${POMERIUM_URL}${path}?svc=${encodeURIComponent(service.id)}&amount=${price}`;
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2500) });
    return { reached: true, status: r.status, allowed: r.status < 400, elevated, reqId: r.headers.get("x-request-id") || undefined, via: "pomerium" };
  } catch {
    return { reached: false, status: 0, allowed: !lockdown, elevated, via: "in-process" };
  }
}

export async function gate({ service, candidate, price }) {
  const p = await pomeriumAuthorize({ service, price });
  const gated = p.elevated;
  const decision = !p.allowed ? "deny" : gated ? "allow-elevated" : "allow";
  const rec = audit({
    kind: "gate",
    service: service.id,
    serviceName: service.name,
    candidate: candidate.id,
    price,
    threshold: GATE_THRESHOLD,
    gated,
    decision,
    authorizedVia: p.via,
    pomeriumStatus: p.status,
    pomeriumRequestId: p.reqId,
    policy: gated
      ? `price $${price} > $${GATE_THRESHOLD} → elevated; Pomerium ${p.reached ? "HTTP " + p.status : "unreachable → in-process"}`
      : `price $${price} ≤ $${GATE_THRESHOLD} → auto-allow (Pomerium ${p.reached ? "HTTP " + p.status : "n/a"})`,
  });
  return { gated, decision, allowed: p.allowed, via: p.via, status: p.status, reqId: p.reqId, audit: rec };
}

function runZero(args, timeoutMs = 90000) {
  return new Promise((resolve) => {
    execFile(ZERO, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

// Call one service for one candidate. Returns a normalized result.
// opts.replay (per-call) overrides the module-level REPLAY default.
export async function callService(service, candidate, { maxPay, replay } = {}) {
  const useReplay = replay ?? REPLAY;
  const req = service.build(candidate);
  const cap = service.slug;
  const rawMaxPay = maxPay ?? Math.max(0.02, service.price * 1.5);
  const maxPayStr = Math.min(Math.max(rawMaxPay, 0.001), 1).toFixed(4);

  // 1) Governance gate — real Pomerium authorizes the purchase
  const g = await gate({ service, candidate, price: service.price });
  if (!g.allowed) {
    audit({ kind: "call", service: service.id, candidate: candidate.id, blocked: true, via: g.via, status: g.status });
    return { ok: false, blocked: true, gated: true, cost: 0, latencyMs: 0, service: service.id, serviceName: service.name, decision: "deny", via: g.via, pomeriumStatus: g.status, extracted: {}, error: "blocked by Pomerium policy" };
  }

  // 2) Replay from cache if requested and available (no payment)
  const cp = cachePath(candidate.id, service.id);
  let env = null;
  let latencyMs = 0;
  if (useReplay && existsSync(cp)) {
    try {
      const cached = JSON.parse(readFileSync(cp, "utf8"));
      env = cached.env;
      latencyMs = cached.latencyMs || 0;
    } catch {
      env = null;
    }
  }

  // 3) Live call via `zero fetch` (real payment) if not replayed
  if (!env) {
    const args = ["fetch", req.url, "--capability", cap, "--max-pay", maxPayStr, "--json"];
    if (req.method) args.push("-X", req.method);
    if (req.body !== undefined) args.push("-d", JSON.stringify(req.body));
    const t0 = Date.now();
    const { stdout } = await runZero(args);
    latencyMs = Date.now() - t0;
    try {
      env = JSON.parse(lastJsonLine(stdout));
    } catch {
      env = null;
    }
    if (env) {
      // Never clobber a good cached response with a failure (e.g. an unfunded
      // live run) — demo/replay mode depends on the last good data. Failures
      // are cached only when no good response exists yet.
      let existingOk = false;
      try { existingOk = JSON.parse(readFileSync(cp, "utf8")).env?.ok === true; } catch {}
      if (env.ok || !existingOk) {
        try { writeFileSync(cp, JSON.stringify({ env, latencyMs, savedAt: new Date().toISOString() })); } catch {}
      }
    }
  }

  const ok = !!env?.ok;
  const cost = ok ? Number(env?.payment?.amount ?? service.price) : 0;
  const extracted = ok ? safeExtract(service, env.body) : {};

  audit({
    kind: "call",
    service: service.id,
    serviceName: service.name,
    candidate: candidate.id,
    ok,
    gated: g.gated,
    decision: g.decision,
    authorizedVia: g.via,
    pomeriumStatus: g.status,
    cost,
    latencyMs,
    runId: env?.runId,
    txHash: env?.payment?.txHash,
    status: env?.status,
  });

  return {
    ok,
    gated: g.gated,
    decision: g.decision,
    via: g.via,
    pomeriumStatus: g.status,
    pomeriumReqId: g.reqId,
    cost,
    latencyMs,
    runId: env?.runId,
    txHash: env?.payment?.txHash,
    service: service.id,
    serviceName: service.name,
    price: service.price,
    extracted,
    raw: env?.body,
  };
}

function safeExtract(service, body) {
  try {
    return service.extract(body) || {};
  } catch {
    return {};
  }
}

function lastJsonLine(s) {
  const lines = s.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (l.startsWith("{")) return l;
  }
  return s;
}

export function readAuditThreshold() {
  return { GATE_THRESHOLD, HARD_DENY };
}
