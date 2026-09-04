# Specialist marketing agents

Version 1.0 includes a deliberately small specialist-agent layer in **Ask Your
Marketing Data**. It improves analysis by applying different scopes and data
boundaries while retaining Crush's deterministic evidence model.

## Architecture

`lib/specialist-agents.ts` defines the five typed agents, their responsibilities,
supported context, boundaries, system instructions, shared Zod output schema,
registry, and deterministic router. `lib/specialist-analysis.ts` executes the
selected route against the same prepared Google Ads and optional GA4 context the
existing AI endpoint already uses.

The shared structured output contains:

- agent identity, summary, findings, and a deduplicated evidence list;
- recommendations tied either to supplied evidence or to a named hypothesis;
- limitations, confidence, and explicitly labeled hypotheses; and
- source-agent IDs on findings and recommendations so synthesis remains
  traceable.

Measured findings cannot pass the schema without evidence. Limitation findings
cannot carry evidence as if the unavailable fact had been measured. Every
finding or recommendation evidence item must also exist in the response's
top-level evidence list, and the grounding validator rejects evidence not in the
allowed Crush context.

## Responsibilities and routing

- **PPC Analyst** handles Google Ads, paid-media efficiency, spend, CTR, CPC,
  CPA, ROAS, campaigns, keywords, search terms, budgets, and bidding context.
- **Analytics Analyst** handles available GA4 users, sessions, engagement, key
  events, traffic, and valid period comparisons. It does not equate Google Ads
  conversions with GA4 key events.
- **CRO Analyst** handles supported landing-page and funnel outcomes. Without
  page content, step-level funnel data, or experiments, possible explanations
  are labeled hypotheses with a validation plan.
- **SEO Analyst** handles available GA4 Organic Search context. It explicitly
  reports that Crush does not have Search Console or crawler evidence and does
  not claim rankings, queries, indexation, backlinks, or technical findings.
- **Marketing Strategist / CMO** synthesizes validated specialist outputs and
  prioritizes their actions without introducing new facts.

`Auto` routing uses deterministic, testable domain signals. One clear domain
selects one specialist. Multiple domains, a broad strategy question, or an
explicit strategist selection uses the bounded synthesis workflow. An explicit
non-strategist UI selection always uses that specialist, which makes scope and
missing-data behavior easy to inspect.

## Multi-agent workflow

The workflow has exactly two stages and no recursion:

1. Selected specialists independently produce structured findings from the
   prepared Crush context.
2. The strategist deduplicates their evidence, carries forward limitations and
   hypotheses, and ranks at most three supported actions.

For the broad next-week-priorities example, all four channel specialists run.
With the bundled sample, PPC contributes three measured priorities. Analytics,
CRO, and SEO contribute honest limitations because GA4, page-level evidence,
Search Console, and crawler data are unavailable. The strategist exposes all
four contributor outputs and does not convert those limitations into facts.

## Grounding and safety

The PPC specialist reuses the deterministic answer packets and calculations
from Ask Your Marketing Data. Analytics, CRO, and SEO compute only
from loaded GA4 rows when present. A one-period snapshot is never described as
a measured increase or decline. Specialist metadata and structured analyses are
validated in the server route before being returned to the browser. The OpenAI
key remains server-only, and the pre-existing non-chat AI insight path continues
to use OpenAI structured output and deterministic candidate validation.

## Experimental areas

Implemented:

- **Structured outputs:** shared TypeScript/Zod schema plus runtime validation.
- **Multi-agent workflows:** bounded specialists-to-strategist synthesis.

Deliberately deferred:

- **Tool calling:** all useful V1 data is already loaded and deterministically
  prepared before analysis. Model-invoked tools would add latency and another
  trust boundary without adding evidence.
- **RAG:** the current questions concern structured account metrics, not a large
  document corpus. Retrieval would not improve the evidence available today.
- **MCP:** there is no external MCP data source required for this workflow. The
  existing Google Ads and GA4 server adapters already provide the available
  context directly.
- **Agent memory:** recent bounded conversation history remains sufficient for
  follow-ups. Persistent memory could make period and account context stale and
  would require storage, retention, and user-control decisions outside Version
  1.0.

Run `npm run verify:specialists` for deterministic coverage of registry shape,
routing, distinct scope instructions, structured output behavior, synthesis,
missing-data limitations, hypothesis labeling, and altered-evidence rejection.
