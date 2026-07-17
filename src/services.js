// The locked working set of Zero enrichment services.
// Every one is an x402 service confirmed live during de-risking (MPP/tempo services
// fail on the current runner, so the whole set is x402).
//
// Each service knows how to:
//   - build()   : turn a candidate into a concrete { url, method, body } HTTP call
//   - extract() : normalise the raw response body into shared profile fields
//
// `slug` is the stable Zero capability id used for `zero fetch --capability <slug>`.
// `price` is the observed real-dollar cost per call (USDC).

const qs = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

export const SERVICES = [
  {
    id: "github",
    name: "2s.io GitHub Profile",
    category: "identity / developer",
    slug: "2s-io-github-user-profile-lookup-fd28b348",
    price: 0.001,
    build: (c) => ({
      url: `https://2s.io/api/github/user?${qs({ username: c.github_username })}`,
      method: "GET",
    }),
    extract: (b) => {
      const u = b?.data?.items?.[0] || {};
      return {
        name: u.name,
        github_username: u.login,
        company_hint: u.company,
        github_location: u.location, // freeform ("SF", "Bay Area") — informational, not graded as hq
        github_followers: u.followers,
        bio: u.bio,
      };
    },
  },
  {
    id: "pdl_company",
    name: "PDL Company Enrich",
    category: "firmographics",
    slug: "pdl-company-enrich-0f2efa9c",
    price: 0.1,
    build: (c) => ({
      url: "https://stable-people-data-git-ben-test-agentcash-dfcfa3-merit-systems.vercel.app/api/pdl/company/enrich",
      method: "POST",
      body: { website: c.company_domain },
    }),
    extract: (b) => {
      const d = b?.data || b || {};
      return {
        company_name: d.display_name || d.name,
        company_domain: d.website,
        company_industry: d.industry_v2 || d.industry,
        company_size_bucket: d.size,
        employee_count: d.employee_count,
        hq_city: d.location?.locality,
        hq_region: d.location?.region,
        company_type: d.type,
        founded_year: d.founded,
        social_profiles: d.profiles,
      };
    },
  },
  {
    id: "serper_news",
    name: "Serper Google News",
    category: "real-time news",
    slug: "stableenrich-news-98b31da4",
    price: 0.04,
    build: (c) => ({
      url: "https://stableenrich.dev/api/serper/news",
      method: "POST",
      body: { q: `${c.name} ${c.company_name}`, num: 4 },
    }),
    extract: (b) => {
      const news = (b?.news || []).slice(0, 4).map((n) => ({
        title: n.title,
        snippet: n.snippet,
        source: n.source,
        date: n.date,
      }));
      return { recent_news: news, recent_activity: news.length > 0 };
    },
  },
  {
    id: "interzoid_funding",
    name: "Interzoid Deal Intelligence",
    category: "funding / valuation",
    slug: "interzoid-private-company-deal-intelligence-api-f95617d0",
    price: 0.25,
    build: (c) => ({
      url: `https://api.interzoid.com/getprivatecompanydealintel?${qs({ lookup: c.company_name })}`,
      method: "GET",
    }),
    extract: (b) => {
      const d = b || {};
      return {
        company_name_alt: d.CompanyName,
        funding_total: d.TotalFundingRaised,
        valuation: d.LatestValuation,
        funding_rounds: d.FundingRounds,
        investors: d.KeyInvestors,
        vc_backed: d.TotalFundingRaised ? true : undefined,
        company_industry_alt: d.Industry,
        hq_alt: d.Headquarters,
        founded_alt: d.FoundedYear,
      };
    },
  },
  {
    id: "anyapi_social",
    name: "AnyAPI Social Finder",
    category: "social profiles",
    slug: "anyapi-social-finder-25dfd848",
    price: 0.021,
    build: (c) => ({
      url: "https://api.getanyapi.com/v1/run/social.finder",
      method: "POST",
      body: { name: c.name, limit: 3 },
    }),
    extract: (b) => {
      const items = (b?.output?.data?.items || []).filter((i) => i.socialProfileUrl);
      return { social_found: items.map((i) => ({ network: i.social, url: i.socialProfileUrl })) };
    },
  },
  {
    id: "pdl_person",
    name: "PDL Person Enrich",
    category: "person / role",
    slug: "pdl-person-enrich-e8ccbe47",
    price: 0.02,
    build: (c) => ({
      url: "https://stable-people-data-git-pdl-signoz-usage-alarms-merit-systems.vercel.app/api/pdl/person/enrich",
      method: "POST",
      body: { name: c.name, company: c.company_domain },
    }),
    extract: (b) => {
      const d = b?.data || b || {};
      if (d.success === false || !d.full_name) return {}; // 404 / no match contributes nothing
      return {
        person_name: d.full_name,
        title: d.job_title,
        title_seniority: d.job_title_levels?.join(", ") || d.job_title,
        person_company: d.job_company_name,
        linkedin: d.linkedin_url,
      };
    },
  },
];

export const serviceById = (id) => SERVICES.find((s) => s.id === id);
