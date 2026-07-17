# Demo + Submission Guide

## Preflight (run before recording)

```bash
cd enrichment-diet
pomerium -config pomerium/config.yaml &     # IAP on :8000  (run pomerium/setup.sh first if config.yaml missing)
PORT=3000 npm start &                         # app on :3000, proxied by Pomerium
open http://localhost:8000                     # ALWAYS open via :8000 (through Pomerium)
```

- The app starts in **demo mode** (replays cached *real* transactions — real tx hashes, real amounts; no new spend). "Switch to live spend" on the home screen flips to fresh payments.
- Best hero candidate: **Zeno Rocha / Resend** (67–77% cut). Backups: **David Cramer / Sentry** (66%), Masad/Copplestone (19%, "the funding call survives" story).
- **Guillermo Rauch is the live-run candidate:** his cache was spent down during build, so if you get wallet credits (Zero booth / `zero wallet fund`), switch to live spend and run Rauch — fresh USDC payments settle on camera and his cache rebuilds automatically.

## 3-minute demo script

**(0:00–0:25) The problem.** "Agents that enrich people-data hit every paid API they can find, just in case. Nobody knows which calls actually mattered, so teams pay for data they never needed. Agent spend is now a board-level line item — and it's mostly waste. Enrichment Diet does the opposite of 'call more.'"

**(0:25–1:10) Acquire — real dollars.** Pick Rauch, hit **Run diet**. "It discovered six enrichment services on Zero and is calling each one now — real USDC settling on Base. Watch the agent log: each payment has a transaction hash. This isn't estimated tokens, it's real money." Point at the meter: **$0.41**, PASS light green, score ~97.

**(1:10–1:35) Governance — Pomerium.** Point at the audit panel. "Every purchase went through a real Pomerium proxy that authorized and logged it — that's the audit trail. The $0.25 funding call tripped the policy and is flagged GATE→ELEVATED." (Optional: "In lockdown, Pomerium 403-blocks it outright — here's that run" → show `pomerium-lockdown` screenshot.)

**(1:35–2:30) The diet — Akash.** "Now the loop: it drops the most expensive service and re-grades — grading runs on an open Llama-3.3-70B on Akash, and it reads the news snippets to recover facts no structured field has. Watch it drop the $0.25 funding call — PASS holds. Then AnyAPI. Then it tries the rest and they're all load-bearing." Meter falls to **$0.10**, PASS still green.

**(2:30–3:00) The payoff.** "Five services down to two. **75% cheaper**, profile still passes at 92. And it's per-candidate — for a different person the funding call is the *only* source of industry data, so the diet keeps it. This is the standard step every team should run before shipping a data-enrichment agent: find the few paid calls that matter, kill the rest."

## Devpost copy

- **Title:** Enrichment Diet
- **Tagline:** An autonomous agent that buys data from live Zero services to build a recruiting profile — then diets itself down to the few services that matter, cutting cost 60–75% with real dollars, no human in the loop.
- **Tracks to select:** Zero.xyz · Akash · Pomerium · Metaview (Fillmore, domain)
- **Built with:** Zero CLI (x402 micropayments), AkashML (Llama-3.3-70B), Pomerium (identity-aware proxy), Node.js, Express, SSE, Envoy.
- **Description:** use README.md (problem, loop, sponsor roles, results table, architecture).
- **Key demo moment:** the dollar meter falling $0.41 → $0.10 as services diet from 5 to 2, PASS light staying green — every number a settled USDC micropayment on Base.

## Push to GitHub (do at submission)

```bash
cd enrichment-diet
# create an empty public repo on github.com first, then:
git remote add origin https://github.com/<you>/enrichment-diet.git
git push -u origin main
```

The repo is already committed and clean — `.env` (keys), `logs/`, `node_modules/`, and the real `pomerium/config.yaml` (local secrets) are gitignored. Collaborators run `pomerium/setup.sh` to regenerate the config.

## Submission checklist

- [ ] Public GitHub repo pushed
- [ ] 3-minute demo recording uploaded
- [ ] Devpost submission with all team members added
- [ ] Tracks selected: Zero, Akash, Pomerium, Metaview
- [ ] Submitted by **4:30 PM**
