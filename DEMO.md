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

## 3-minute demo script (Aristarkh's voice)

**(0:00 — hook, home screen visible)**
"Hi, I'm Aristarkh. I work at a startup, and we're hiring a developer. It's always the same workflow: you meet someone at a hackathon, you exchange LinkedIns, and you ask an AI agent — is this person a good fit for us?

And on max effort, the agent buys *everything*. Every people-data API it can find, just in case. Nobody knows which of those paid calls actually mattered. You only need specific data for the specific task — the rest is waste.

Enrichment Diet collects only the data that matters. And it figures out *which* data that is — autonomously."

**(0:40 — type, on screen)**
"I type the candidate: **Zeno Rocha**. I set my quality bar — 90 and up is good for me. If you want to know who decides what 'good' means — *(unfold 'How scoring works')* — here's the rubric: eleven facts with weights, graded by an open Llama model. And I hit run."

**(1:00 — acquire phase, dashboard)**
"Right now a real agent is buying data from live services it discovered on **Zero** — real USDC micropayments; you can see the transaction hashes. The grading runs on **Meta Llama on Akash**. Left side: the services it's paying. Right side: what it's thinking.

First it builds the full profile with everything: six services, 43 cents — quality 93, passes my bar."

**(1:35 — the diet)**
"Now the good part. The agent asks: can I still pass *without* this one? Watch — it drops the 25-cent funding API, quality holds. Drops the social finder — holds. It tries to drop GitHub — quality crashes, so GitHub stays.

It converges on the three services that actually matter. **43 cents down to 14. Sixty-seven percent cheaper. Same result.**"

**(2:10 — the economics)**
"You pay full price a few times to calibrate — then every next candidate runs on the optimized set. *(point at banner)* At 500 candidates a month, that's **$71 instead of $216**. The agent optimized its own spending. No babysitting."

**(2:30 — governance)**
"And because an agent with a wallet is scary: every purchase went through **Pomerium** — a real identity-aware proxy in front of the agent. It authorized and logged each payment, and it flagged the expensive one. In lockdown mode it blocks it outright with a 403."

**(2:50 — close)**
"Zero for the marketplace and the wallet. Akash for the grading. Pomerium for control. Enrichment Diet — buy only the data that matters. Thanks!"

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
