// Web server: serves the demo UI and streams the diet as Server-Sent Events.
//
//   GET /                     → the dollar-meter demo UI
//   GET /api/candidates       → list of eval-set candidates
//   GET /api/run?candidate=…  → SSE stream of diet events (live real-dollar run)
//        &replay=1            → reuse cached responses (rehearsal, no payment)
//        &pace=1              → add dramatic pacing between events

import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { CANDIDATES, candidateById, GROUND_TRUTH_WEIGHTS } from "./candidates.js";
import { SERVICES } from "./services.js";
import { runDiet, PASS_THRESHOLD } from "./diet.js";
import { grader } from "./grade.js";
import { GATE_THRESHOLD } from "./zero.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, "..", "public")));

// Purchase-authorization upstream. Reached only after Pomerium authorizes the
// request at the proxy (:8000/pomerium-authz/*) and logs it. Returns the spend
// decision the agent's gate acts on.
app.get("/pomerium-authz/check", (req, res) => {
  const amount = Number(req.query.amount || 0);
  res.json({
    ok: true,
    service: req.query.svc,
    amount,
    elevated: amount > GATE_THRESHOLD,
    authorizedBy: "pomerium",
  });
});

app.get("/api/candidates", (_req, res) => {
  res.json({
    candidates: CANDIDATES.map((c) => ({ id: c.id, name: c.name, company: c.company_name })),
    services: SERVICES.map((s) => ({ id: s.id, name: s.name, price: s.price, category: s.category })),
    config: { passThreshold: PASS_THRESHOLD, gateThreshold: GATE_THRESHOLD, grader, rubric: GROUND_TRUTH_WEIGHTS },
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.get("/api/run", async (req, res) => {
  const candidate = candidateById(req.query.candidate || "rauch");
  if (!candidate) return res.status(404).json({ error: "unknown candidate" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const pace = req.query.pace === "1";
  // Serialize emits through a queue so pacing delays are honored in order.
  let chain = Promise.resolve();
  const send = (e) => {
    chain = chain.then(async () => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
      if (pace) {
        if (e.type === "drop") await sleep(1400);
        else if (e.type === "trial") await sleep(400);
        else if (e.type === "call:done") await sleep(300);
        else if (e.type === "baseline") await sleep(900);
      }
    });
    return chain;
  };

  try {
    await runDiet(candidate, send, { replay: req.query.replay === "1", threshold: req.query.threshold });
    await chain;
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: String(err) })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
  res.end();
});

app.listen(PORT, () => {
  console.log(`\n  Enrichment Diet — http://localhost:${PORT}`);
  console.log(`  grader: ${grader.backend} (${grader.model}) · PASS ≥ ${PASS_THRESHOLD} · gate > $${GATE_THRESHOLD}\n`);
});
