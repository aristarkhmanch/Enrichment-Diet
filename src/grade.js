// Grading = scoring an assembled profile against a candidate's ground truth.
//
// The grader runs on Akash (AkashML managed inference, OpenAI-compatible). The LLM
// reads the *unstructured* signal too — news snippets, bios — to recover facts like
// title/seniority that no single structured field provides. This is the
// "inference-heavy, runs on Akash" story: the diet loop grades many subset trials.
//
// If no Akash key is configured, a deterministic string-match grader is used so the
// loop is fully testable offline. Set AKASH_API_KEY to switch to Akash.

import { GROUND_TRUTH_WEIGHTS } from "./candidates.js";

const AKASH_BASE = process.env.AKASH_BASE_URL || "https://api.akashml.com/v1";
const AKASH_KEY = process.env.AKASH_API_KEY || "";
const AKASH_MODEL = process.env.AKASH_MODEL || "meta-llama/Llama-3.3-70B-Instruct";

export const grader = {
  backend: AKASH_KEY ? "akash" : "local",
  model: AKASH_KEY ? AKASH_MODEL : "deterministic-fallback",
};

const norm = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ROLE_WORDS = ["ceo", "cto", "cfo", "coo", "founder", "cofounder", "co founder", "chief", "president", "head of", "vp ", "partner"];
const FUNDING_WORDS = ["raised", "series ", "seed", "funding", "valuation", "investor", "venture", "backed", "round", "billion", "million", "$"];
const INDUSTRY_WORDS = ["software", "developer", "development", "cloud", "data", "database", "platform", "infrastructure", "tech", "saas", "api", "observability", "email", "ide", "services", "consulting", "backend", "hosting", "security", "analytics", "internet", "computer"];

// String match against a SPECIFIC value (not the whole profile) — full credit for
// containment, partial for token overlap.
function strMatch(value, truth) {
  const v = norm(value);
  const t = norm(truth);
  if (!v || !t) return 0;
  if (v.includes(t) || t.includes(v)) return 1;
  const toks = t.split(" ").filter((w) => w.length > 2);
  if (!toks.length) return 0;
  const hit = toks.filter((w) => v.includes(w)).length;
  const ratio = hit / toks.length;
  return ratio >= 0.9 ? 1 : ratio >= 0.5 ? 0.6 : ratio > 0 ? 0.3 : 0;
}
const has = (s, words) => words.some((w) => norm(s).includes(w));
const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// News/bio text available to recover unstructured facts (role, funding).
function newsText(p) {
  const news = (p.recent_news || []).map((n) => `${n.title} ${n.snippet}`).join(" ");
  return `${news} ${p.bio || ""}`;
}

// Field-aware grading: each ground-truth fact is scored ONLY against the profile
// fields that legitimately carry it. This attributes each service's contribution
// cleanly (no cross-service text leakage) and mirrors what the Akash LLM does.
function fieldCredit(field, truth, p) {
  switch (field) {
    case "name":
      return Math.max(strMatch(p.name, truth), strMatch(p.person_name, truth));
    case "company_name":
      return Math.max(strMatch(p.company_name, truth), strMatch(p.company_hint, truth), strMatch(p.company_name_alt, truth), strMatch(p.person_company, truth));
    case "company_domain":
      return strMatch(p.company_domain, truth);
    case "github_username":
      return strMatch(p.github_username, truth);
    case "title_seniority":
      return first(p.title, p.title_seniority) ? 1 : has(newsText(p), ROLE_WORDS) ? 1 : 0;
    case "hq_city":
      return Math.max(strMatch(p.hq_city, truth), strMatch(p.hq_region, truth), strMatch(p.hq_alt, truth));
    case "company_industry": {
      // Consider both the structured (PDL) and premium (Interzoid) industry fields.
      const vals = [p.company_industry, p.company_industry_alt].filter(Boolean);
      let best = 0;
      for (const v of vals) best = Math.max(best, has(v, INDUSTRY_WORDS) ? 1 : strMatch(v, truth));
      return best;
    }
    case "company_size_bucket":
      return p.company_size_bucket ? strMatch(p.company_size_bucket, truth) || 1 : p.employee_count ? 0.6 : 0;
    case "company_type":
      return strMatch(p.company_type, truth);
    case "vc_backed":
      return p.vc_backed || p.funding_total ? 1 : has(newsText(p), FUNDING_WORDS) ? 1 : 0;
    case "recent_activity":
      return (p.recent_news && p.recent_news.length > 0) || p.recent_activity ? 1 : 0;
    default:
      return 0;
  }
}

export function localGrade(profile, groundTruth) {
  const perField = {};
  let score = 0;
  for (const [field, weight] of Object.entries(GROUND_TRUTH_WEIGHTS)) {
    const s = Math.max(0, Math.min(1, fieldCredit(field, groundTruth[field], profile)));
    perField[field] = { credit: s, weight, points: +(s * weight).toFixed(1) };
    score += s * weight;
  }
  return { score: Math.round(score), perField };
}

async function akashGrade(profile, groundTruth) {
  const sys =
    "You are a strict recruiting-data grader. Given an ASSEMBLED PROFILE (possibly noisy, " +
    "from multiple paid data services) and GROUND TRUTH facts about a person, score how well " +
    "the profile supports each ground-truth field. Use ALL evidence including unstructured " +
    "news snippets and bios (e.g. a headline 'Vercel CEO Guillermo Rauch' supports title_seniority). " +
    "For each field return a credit in [0,1]. Respond ONLY with JSON: " +
    '{"fields": {"<field>": <credit 0..1>, ...}}';
  const user = JSON.stringify({
    ground_truth: groundTruth,
    weights: GROUND_TRUTH_WEIGHTS,
    assembled_profile: profile,
  });

  const res = await fetch(`${AKASH_BASE}/chat/completions`, {
    method: "POST",
    // Hard cap per grading call: AkashML latency spikes under load, and one slow
    // inference must not stall the whole diet round — timeout → local fallback.
    signal: AbortSignal.timeout(Number(process.env.AKASH_TIMEOUT_MS || 8000)),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AKASH_KEY}` },
    body: JSON.stringify({
      model: AKASH_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Akash ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  const json = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  const fields = json.fields || {};
  const perField = {};
  let score = 0;
  for (const [field, weight] of Object.entries(GROUND_TRUTH_WEIGHTS)) {
    const credit = Math.max(0, Math.min(1, Number(fields[field] ?? 0)));
    perField[field] = { credit, weight, points: +(credit * weight).toFixed(1) };
    score += credit * weight;
  }
  return { score: Math.round(score), perField };
}

// Grade a profile. Falls back to local grading on any Akash error so the demo
// never hard-fails on a flaky inference call.
export async function grade(profile, groundTruth) {
  if (!AKASH_KEY) return { ...localGrade(profile, groundTruth), backend: "local" };
  try {
    return { ...(await akashGrade(profile, groundTruth)), backend: "akash" };
  } catch (e) {
    return { ...localGrade(profile, groundTruth), backend: "local-fallback", error: String(e).slice(0, 120) };
  }
}
