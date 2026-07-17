# Enrichment Diet

**An autonomous agent that builds a recruiting candidate profile by *buying* data from live services it discovers on Zero — then diets itself down to the few services that actually matter, cutting cost 60–75% with no human in the loop.**

Built at the Loop Engineering Hackathon (tokens&, July 2026). Sponsors used: **Zero.xyz** (marketplace + wallet + micropayments), **Akash** (open-model grading inference), **Pomerium** (identity-aware proxy in front of every purchase). Domain: recruiting (Metaview / Fillmore track).

---

## The problem

Agents that enrich people-data hit every paid API they can find "just in case." Nobody knows which calls actually mattered, so teams pay for data they never needed and every profile costs more than it should. Agent spend is now a board-level line item — and it's mostly waste.

## The idea

Enrichment Diet does the opposite of "call more." It builds a correct profile with **all** the services, then keeps asking *"can it still pass without this one?"* — dropping any service whose removal doesn't drop the score. You end up knowing exactly which few services are load-bearing, and every future profile is cheaper and steadier.

Because the cost is real micropayments through Zero, the savings aren't estimated tokens — they're **actual dollars falling on screen**.

## The loop (plan → act → observe → self-correct)

```
solve-with-all → score vs. ground truth → drop-one-and-retry → keep only score-critical → converge
```

1. **Acquire.** Discover ~6 enrichment services on Zero (GitHub, company firmographics, news, funding, social, person-enrich) and call each **once**, paying real USDC. Cache every response.
2. **Grade.** Assemble a candidate profile and score it 0–100 against hand-built ground truth. Grading runs on **Akash** (open Llama-3.3-70B) — it reads the *unstructured* signal too (a news headline "Vercel CEO Guillermo Rauch raised $300M" recovers title + funding that no structured field provides).
3. **Diet.** Greedily drop the most expensive service whose removal keeps the score ≥ PASS. Repeat until nothing can be removed without failing. Each subset is re-graded on Akash — many cheap inference trials.
4. **Result.** Converges on the ~2–3 load-bearing services. The dollar meter falls, the PASS light stays green.

**Key finding: the load-bearing set differs per candidate.** For Guillermo Rauch (Vercel) the $0.25 funding call is waste and gets dropped (75% cheaper). For Paul Copplestone (Supabase) that same funding call is the *only* source of industry data, so the diet keeps it. The tool tells you which paid calls matter for *this* enrichment — and it isn't always the same.

---

## Sponsor roles (all three are real, on the critical path)

| Sponsor | Role | Where to see it |
|---|---|---|
| **Zero.xyz** | Service marketplace + wallet + per-call micropayments. Every service was discovered via `zero search` and called via `zero fetch` with real x402 USDC settlement on Base. | The falling dollar meter; tx hashes in the agent log; `logs/audit.jsonl` |
| **Akash** | Open-model inference (AkashML, `meta-llama/Llama-3.3-70B-Instruct`) grades the profile against ground truth across every diet trial — the inference-heavy part. | `grader: akash` badge; `src/grade.js` |
| **Pomerium** | Identity-aware proxy in front of the agent runtime. Every purchase is authorized + logged by Pomerium before the agent can spend; lockdown mode 403-blocks over-threshold calls at the proxy. | The governance/audit panel; `pomerium/config.yaml`; `logs/pomerium.log` |
| **Metaview** (domain) | Recruiting use case — candidate profiles are exactly the sourcing signal Metaview/Fillmore work on. | The candidate set (engineering leaders) |

---

## Results (real, measured — Akash grader, PASS ≥ 90)

| Candidate | Company | Diet | Cost | Cut | Survivors |
|---|---|---|---|---|---|
| Zeno Rocha | Resend | 6 → 3 | $0.43 → $0.14 | **67%** | GitHub · PDL Company · News |
| Guillermo Rauch | Vercel | 5 → 2 | $0.41 → $0.10 | **75%** | GitHub · PDL Company |
| David Cramer | Sentry | 5 → 3 | $0.41 → $0.14 | **66%** | GitHub · PDL Company · News |
| Paul Copplestone | Supabase | 6 → 3 | $0.43 → $0.35 | 19% | GitHub · PDL Company · Funding |
| Amjad Masad | Replit | 6 → 3 | $0.43 → $0.35 | 19% | GitHub · PDL Company · Funding |

Convergence varies slightly run-to-run because the Akash LLM does real semantic grading — that variance *is* the agent reasoning. Every run lands PASS-green.

---

## The services (locked working set)

All x402 (the current runner's MPP/tempo settlement was unreliable, so the whole set is x402):

| Service | Category | $/call |
|---|---|---|
| 2s.io GitHub Profile | identity / developer | 0.001 |
| PDL Company Enrich | firmographics | 0.100 |
| Serper Google News | real-time news | 0.040 |
| Interzoid Deal Intelligence | funding / valuation | 0.250 |
| AnyAPI Social Finder | social profiles | 0.021 |
| PDL Person Enrich | person / role | 0.020 |

---

## Architecture

```
Browser ──▶ Pomerium IAP (:8000) ──▶ Node app (:3000)
                  │                        │
                  │ authorizes + logs      ├─ src/diet.js    minimization loop
                  │ every purchase         ├─ src/zero.js    `zero fetch` + gate (→ Pomerium)
                  ▼                        ├─ src/grade.js   Akash grading (+ local fallback)
           logs/pomerium.log              ├─ src/services.js  service configs (build/extract)
                                          └─ public/index.html  live dollar-meter UI (SSE)
      Zero CLI ──▶ x402 services on Base (real USDC)
      Akash  ──▶ api.akashml.com (Llama-3.3-70B)
```

- **Cost model:** each service is paid **once** per candidate (real USDC) and cached; the diet then explores subsets by re-grading the cache on Akash. Payments are real and settle once; the many grading trials are cheap inference.
- **Resilience:** if Akash is unreachable, grading falls back to a deterministic local grader (same convergence). If Pomerium is down, the gate falls back to in-process policy. The app never hard-fails on a flaky dependency.

---

## Run it

```bash
# 1. Node deps
npm install

# 2. Config — put your keys in .env (see .env for the shape)
#    AKASH_API_KEY=...        (from akashml.com → Settings → API Keys)
#    Zero CLI must be authenticated + funded:  zero auth whoami

# 3. Start Pomerium (identity-aware proxy) in front of the app
pomerium -config pomerium/config.yaml &

# 4. Start the app
npm start                       # serves on :3000, proxied by Pomerium on :8000

# 5. Open the demo THROUGH Pomerium
open http://localhost:8000
```

CLI (no UI):

```bash
npm run diet -- rauch           # run the diet for one candidate, printed trace
REPLAY=1 npm run diet -- rauch  # replay cached responses (no payment)
HARD_DENY=1 npm run diet -- rauch  # lockdown: Pomerium 403-blocks the expensive call
```

UI toggles: **cinematic pacing** (dramatic timing) · **replay (no payment)** (reuse cache).

---

## What makes it a real loop-engineering agent

- **Autonomous, acts on live web data, no human in the loop** — it discovers and pays for services it has never seen, live.
- **Plans / acts / observes / self-corrects** — the minimization loop *is* this cycle.
- **Original, real-world value** — "which paid calls actually matter" is an unsolved, board-level cost problem.
- **Real dollars, not estimated tokens** — every number is a settled USDC micropayment on Base.
