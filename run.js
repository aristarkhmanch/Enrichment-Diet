// CLI: run the diet for one candidate and print a readable trace.
//   node run.js [candidateId]        (default: rauch)

import { candidateById, CANDIDATES } from "./src/candidates.js";
import { runDiet } from "./src/diet.js";

const id = process.argv[2] || "rocha";
const candidate = candidateById(id);
if (!candidate) {
  console.error(`Unknown candidate '${id}'. Options: ${CANDIDATES.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const money = (n) => `$${Number(n).toFixed(3)}`;

runDiet(candidate, (e) => {
  switch (e.type) {
    case "start":
      console.log(`\n=== ENRICHMENT DIET — ${e.candidate.name} @ ${e.candidate.company} ===`);
      console.log(`grader: ${e.grader.backend} (${e.grader.model}) · PASS ≥ ${e.threshold}\n`);
      break;
    case "phase":
      console.log(`\n[${e.phase.toUpperCase()}] ${e.note}`);
      break;
    case "call:start":
      process.stdout.write(`  → ${e.name} (${money(e.price)}) ... `);
      break;
    case "call:done":
      console.log(
        `${e.ok ? "ok" : "FAIL"} ${e.ok ? money(e.cost) : ""} ${e.latencyMs}ms ${e.gated ? "[GATED→" + e.decision + "]" : ""} ${e.fields} fields`
      );
      break;
    case "baseline":
      console.log(`\n  BASELINE: ${e.services.length} services · score ${e.score} · ${money(e.cost)} · ${e.pass ? "PASS" : "FAIL"}`);
      break;
    case "trial":
      console.log(`    trial drop ${e.dropName}: score ${e.score} · ${money(e.cost)} · ${e.removable ? "removable" : "keep (load-bearing)"}`);
      break;
    case "drop":
      console.log(`  ✂  DROP ${e.droppedName} (saved ${money(e.saved)}) → ${e.services.length} left · score ${e.score} · ${money(e.cost)} · ${e.pass ? "PASS" : "FAIL"}`);
      break;
    case "converged":
      console.log(`\n  ⚑ ${e.note}`);
      break;
    case "result":
      console.log(`\n=== RESULT ===`);
      console.log(`  ${e.baselineServices.length} services ${money(e.baselineCost)} (score ${e.baselineScore})  →  ${e.finalServices.length} services ${money(e.finalCost)} (score ${e.finalScore})`);
      console.log(`  survivors: ${e.finalNames.join(", ")}`);
      console.log(`  saved ${money(e.saved)} / call  ·  ${e.savedPct}% cheaper  ·  PASS ${e.pass ? "GREEN ✓" : "RED ✗"}\n`);
      break;
  }
}).catch((err) => {
  console.error("diet failed:", err);
  process.exit(1);
});
