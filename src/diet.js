// The Enrichment Diet: solve-with-all → drop-one-and-retry → keep only the
// services whose removal would drop the score below PASS. Converges on the few
// load-bearing services.
//
// Cost model: each service is PAID ONCE per candidate (real USDC via Zero) and its
// response cached. The diet then explores subsets by re-assembling + re-grading the
// cache on Akash — so payments are real and settled once, while the many grading
// trials are cheap inference. The "active cost" meter = sum of prices of the
// services still in the set.

import { SERVICES } from "./services.js";
import { callService } from "./zero.js";
import { grade, grader } from "./grade.js";

export const PASS_THRESHOLD = Number(process.env.PASS_THRESHOLD ?? 90);

// Cross-run grade cache for replay mode (data is immutable there); keyed by
// candidate + grader backend + service subset. Only successful Akash grades are
// stored so a degraded fallback grade never sticks.
const GLOBAL_GRADE_MEMO = new Map();

function assemble(cacheEntries) {
  // Merge extracted fields from a set of service results into one profile.
  // Earlier (more authoritative) services win on conflict; news/funding blobs
  // are additive context for the grader.
  const profile = {};
  for (const e of cacheEntries) {
    for (const [k, v] of Object.entries(e.extracted || {})) {
      if (v === undefined || v === null || v === "") continue;
      if (profile[k] === undefined) profile[k] = v;
    }
  }
  return profile;
}

const totalCost = (svcIds, priceOf) => +svcIds.reduce((s, id) => s + (priceOf[id] || 0), 0).toFixed(4);

// Run the full diet for one candidate. `emit` receives streaming events.
// opts: { replay, threshold } — threshold overrides PASS_THRESHOLD for this run
// (the user sets their own quality bar from the UI).
export async function runDiet(candidate, emit = () => {}, opts = {}) {
  const replay = opts.replay;
  const threshold = Number(opts.threshold) >= 50 && Number(opts.threshold) <= 100 ? Number(opts.threshold) : PASS_THRESHOLD;
  emit({ type: "start", candidate: { id: candidate.id, name: candidate.name, company: candidate.company_name }, threshold, grader });

  // --- Phase 1: solve-with-all (pay each service once, cache) ---------------
  // Calls run concurrently so one slow service doesn't serialize the rest;
  // events still stream per-service as each settles.
  emit({ type: "phase", phase: "acquire", note: "Calling every service once (real USDC via Zero)" });
  const cache = {};
  const priceOf = {};
  for (const svc of SERVICES) priceOf[svc.id] = svc.price;
  SERVICES.forEach((svc) => emit({ type: "call:start", service: svc.id, name: svc.name, price: svc.price, category: svc.category }));
  await Promise.all(
    SERVICES.map(async (svc) => {
      const r = await callService(svc, candidate, { replay });
      cache[svc.id] = r;
      emit({
        type: "call:done",
        service: svc.id,
        name: svc.name,
        ok: r.ok,
        blocked: r.blocked,
        cost: r.cost,
        latencyMs: r.latencyMs,
        gated: r.gated,
        decision: r.decision,
        via: r.via,
        pomeriumStatus: r.pomeriumStatus,
        txHash: r.txHash,
        runId: r.runId,
        fields: Object.keys(r.extracted || {}).length,
      });
    })
  );

  // Memoize grades by service-set so repeated subsets aren't re-graded.
  // In replay mode the underlying data never changes, so grades are ALSO cached
  // across runs (module-level) — a rehearsal run makes the demo run instant and
  // immune to inference-latency spikes. Live runs always grade fresh.
  const gradeMemo = new Map();
  const globalKey = (key) => `${candidate.id}|${grader.backend}|${key}`;
  const evaluate = async (svcIds) => {
    const key = [...svcIds].sort().join(",");
    if (gradeMemo.has(key)) return gradeMemo.get(key);
    if (replay && GLOBAL_GRADE_MEMO.has(globalKey(key))) return GLOBAL_GRADE_MEMO.get(globalKey(key));
    const profile = assemble(svcIds.map((id) => cache[id]));
    const g = await grade(profile, candidate.groundTruth);
    const out = { ...g, profile, cost: totalCost(svcIds, priceOf), services: [...svcIds] };
    gradeMemo.set(key, out);
    if (replay && g.backend === "akash") GLOBAL_GRADE_MEMO.set(globalKey(key), out);
    return out;
  };

  // Baseline: all services that returned anything usable.
  let active = SERVICES.filter((s) => cache[s.id]?.ok).map((s) => s.id);
  const baseline = await evaluate(active);
  emit({
    type: "baseline",
    services: active,
    score: baseline.score,
    cost: baseline.cost,
    pass: baseline.score >= threshold,
    perField: baseline.perField,
  });

  // --- Phase 2: minimization (drop-one-and-retry, greedy most-expensive) ----
  emit({ type: "phase", phase: "diet", note: "Dropping services whose removal keeps PASS — most expensive first" });
  const history = [{ step: 0, action: "baseline", services: [...active], score: baseline.score, cost: baseline.cost }];
  let step = 0;
  let currentScore = baseline.score;

  while (true) {
    // Try removing each still-active service (grades run concurrently on Akash).
    const candidates = active.filter((id) => active.length > 1);
    const evaluated = await Promise.all(
      candidates.map(async (id) => ({ id, t: await evaluate(active.filter((x) => x !== id)) }))
    );
    const trials = [];
    for (const { id, t } of evaluated) {
      const removable = t.score >= threshold;
      emit({
        type: "trial",
        step: step + 1,
        drop: id,
        dropName: SERVICES.find((s) => s.id === id)?.name,
        candidateSet: active.filter((x) => x !== id),
        score: t.score,
        cost: t.cost,
        removable,
      });
      if (removable) trials.push({ id, price: priceOf[id], score: t.score, cost: t.cost });
    }

    if (trials.length === 0) {
      emit({ type: "converged", note: "No service can be removed without failing PASS" });
      break;
    }

    // Greedy: drop the most expensive removable service (max real-dollar saving).
    trials.sort((a, b) => b.price - a.price || a.score - b.score);
    const dropped = trials[0];
    active = active.filter((x) => x !== dropped.id);
    step++;
    currentScore = dropped.score;
    const svc = SERVICES.find((s) => s.id === dropped.id);
    history.push({ step, action: "drop", dropped: dropped.id, services: [...active], score: dropped.score, cost: dropped.cost });
    emit({
      type: "drop",
      step,
      dropped: dropped.id,
      droppedName: svc?.name,
      saved: svc?.price,
      services: [...active],
      score: dropped.score,
      cost: totalCost(active, priceOf),
      pass: dropped.score >= threshold,
    });
  }

  const final = await evaluate(active);
  const result = {
    candidate: candidate.id,
    baselineServices: baseline.services,
    baselineCost: baseline.cost,
    baselineScore: baseline.score,
    finalServices: active,
    finalNames: active.map((id) => SERVICES.find((s) => s.id === id)?.name),
    finalCost: final.cost,
    finalScore: final.score,
    saved: +(baseline.cost - final.cost).toFixed(4),
    savedPct: baseline.cost > 0 ? Math.round((1 - final.cost / baseline.cost) * 100) : 0,
    pass: final.score >= threshold,
    history,
    grader,
  };
  emit({ type: "result", ...result });
  return result;
}
