# Enrichment Diet — Devpost "About the project"

*(paste into the Devpost story field — Markdown with LaTeX)*

---

## Inspiration

I work at a startup and we're hiring a developer. The workflow is always the same: meet someone at a hackathon, exchange LinkedIns, then ask an AI agent to gather information — is this person a good fit? And on max effort, the agent buys *everything*: every people-data API it can find, "just in case." Nobody ever knows which of those paid calls actually mattered.

My belief: **you only need specific data for the specific task.** So I flipped the usual agent instinct — instead of "call more," build an agent that discovers which paid calls are load-bearing and kills the rest. Agent spend is becoming a board-level line item; most of it is waste you can measure in real dollars.

## What it does

Enrichment Diet builds a recruiting candidate profile by **buying data from live services it discovers on Zero** (real USDC micropayments, x402 on Base), grades the profile against an 11-fact rubric with an **open Llama-3.3-70B on Akash**, then runs a drop-one-and-retry loop: solve with everything, then keep asking *"can it still pass without this one?"* Formally, it searches for

$$S^* = \arg\min_{S \subseteq S_0} \sum_{s \in S} p_s \quad \text{s.t.} \quad \mathrm{score}(S) \ge \tau$$

— the cheapest subset of services that still clears your quality bar $\tau$. On camera: six services shrink to three, cost falls **$0.43 → $0.14 (−67%)** while the PASS light stays green. You calibrate at full price on a few candidates, then run every future candidate on the surviving set — at 500 candidates/month that's **$71 instead of $216**. Every purchase is authorized and logged by a **real Pomerium identity-aware proxy**; in lockdown mode it 403-blocks over-budget calls at the proxy.

## How I built it

Solo, in one day, engineering the loop with Claude Code. De-risked externals first: searched Zero's registry live (17 email finders, 28 company enrichers…) and locked the six services that actually responded *and settled payment*. Each service is paid once per candidate and cached; the diet explores subsets by re-grading cached data on Akash — payments stay real and settle once, while the many grading trials are cheap open-model inference. Node.js + SSE stream the run into a chat-first UI: type a name, set your bar, watch the dollar meter fall.

## Challenges I ran into

1. **Marketplace reality.** Several services had broken payment flows (one email finder failed its x402 handshake; MPP/tempo settlement wasn't supported by the runner; one API 502'd after payment). Locking a working set with real test calls *before* building saved the day.
2. **Grading is the hard part.** A naive keyword grader leaked credit between services ("SF" ≠ "San Francisco", a news headline secretly carrying the job title). The fix: field-aware grading, and letting the Llama on Akash read the *unstructured* text — a headline like "Vercel CEO raised $300M" legitimately proves title and funding.
3. **My agent spent my entire budget.** The $5 Zero wallet went to zero during testing — including one unfunded live run that overwrote good cached data with payment failures. I shipped cache protection and kept the lesson: an agent with a wallet needs exactly the spend governance this project demonstrates.

## What I learned

Real-dollar feedback changes how you design agents — savings aren't estimated tokens, they're settled transactions with hashes. And the load-bearing set **differs per candidate**: for one founder the $0.25 funding API is pure waste; for another it's the only source of industry data. You can't configure the minimal set — you have to *discover* it. That's the product.

## What's next

Escalation mode (start with the cheap set, add services only when the score falls short), user-defined rubrics typed straight into the chat, and publishing the surviving trio as its own service back onto Zero — the diet's output becomes a product other agents can buy.
