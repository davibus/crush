import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { prepareCampaignPerformanceAnalysis } from "../lib/campaign-performance-analyzer.ts";
import type {
  GoogleAdsDailyMetric,
  GoogleAdsSampleData,
} from "../lib/google-ads.ts";
import {
  executeSpecialistWorkflow,
  validateSpecialistAnalysisGrounding,
} from "../lib/specialist-analysis.ts";
import {
  getSpecialistAgent,
  listSpecialistAgents,
  routeSpecialistQuestion,
  SPECIALIST_AGENT_IDS,
  specialistAnalysisSchema,
  type SpecialistAgentId,
} from "../lib/specialist-agents.ts";
import { buildSeoRankTracking } from "../lib/seo-rank-tracking.ts";
import { SEARCH_CONSOLE_SOURCE, SEARCH_CONSOLE_SOURCE_LABEL, type SearchConsoleDataState } from "../lib/search-console.ts";

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8")) as T;
}

const campaignData = await loadJson<GoogleAdsSampleData>(
  "../data/google-ads-sample.json",
);
const dailyData = await loadJson<{ dailyMetrics: GoogleAdsDailyMetric[] }>(
  "../data/google-ads-daily.json",
);
const geographyData = await loadJson<{ locations: Parameters<typeof prepareCampaignPerformanceAnalysis>[0]["geographies"] }>(
  "../data/google-ads-geography.json",
);
const keywordData = await loadJson<{ keywords: Parameters<typeof prepareCampaignPerformanceAnalysis>[0]["keywords"] }>(
  "../data/google-ads-keywords.json",
);
const searchTermData = await loadJson<{ searchTerms: Parameters<typeof prepareCampaignPerformanceAnalysis>[0]["searchTerms"] }>(
  "../data/google-ads-search-terms.json",
);
const conversionData = await loadJson<{ conversions: Parameters<typeof prepareCampaignPerformanceAnalysis>[0]["conversions"] }>(
  "../data/google-ads-conversions.json",
);
const analysis = prepareCampaignPerformanceAnalysis({
  campaignData,
  geographies: geographyData.locations,
  keywords: keywordData.keywords,
  searchTerms: searchTermData.searchTerms,
  conversions: conversionData.conversions,
});
const context = {
  analysis,
  dailyMetrics: dailyData.dailyMetrics,
  ga4: { status: "unconfigured" as const },
  searchConsole: { status: "unconfigured" as const },
  rankTracking: buildSeoRankTracking({ status: "unconfigured" }),
};

const agents = listSpecialistAgents();
assert.equal(agents.length, 5);
assert.deepEqual(agents.map((agent) => agent.id), SPECIALIST_AGENT_IDS);
for (const id of SPECIALIST_AGENT_IDS) {
  const agent = getSpecialistAgent(id);
  assert.ok(agent, `Missing specialist ${id}.`);
  assert.ok(agent.description.length > 20);
  assert.ok(agent.systemInstructions.length > 50);
  assert.ok(agent.responsibilities.length > 0);
  assert.ok(agent.supportedContext.length > 0);
  assert.ok(agent.boundaries.length > 0);
  assert.equal(agent.outputSchema, specialistAnalysisSchema);
}

const routingExamples: ReadonlyArray<[string, SpecialistAgentId]> = [
  ["Why did CPA increase?", "ppc-analyst"],
  ["Why did sessions decline compared with the previous period?", "analytics-analyst"],
  ["How can we improve the landing-page conversion rate?", "cro-analyst"],
  ["Why did organic traffic fall?", "seo-analyst"],
  ["What are the top three marketing priorities for next week?", "marketing-strategist"],
];
for (const [question, expected] of routingExamples) {
  assert.equal(
    routeSpecialistQuestion(question).primaryAgentId,
    expected,
    `Unexpected specialist for: ${question}`,
  );
}

const crossChannel = routeSpecialistQuestion(
  "How do paid campaign CPA and GA4 sessions relate?",
);
assert.equal(crossChannel.primaryAgentId, "marketing-strategist");
assert.equal(crossChannel.workflow, "specialists_to_strategist");
assert.deepEqual(crossChannel.contributingAgentIds, ["ppc-analyst", "analytics-analyst"]);

const ppc = executeSpecialistWorkflow(context, {
  question: "Why did CPA increase?",
});
assert.equal(ppc.response.specialist?.id, "ppc-analyst");
assert.equal(ppc.response.workflow, "single_specialist");
assert.equal(ppc.response.status, "unsupported");
assert.match(ppc.response.answer, /historical information/i);

const analytics = executeSpecialistWorkflow(context, {
  question: "Why did sessions decline compared with the previous period?",
});
assert.equal(analytics.response.specialist?.id, "analytics-analyst");
assert.equal(analytics.response.status, "insufficient_data");
assert.match(analytics.response.limitations.join(" "), /prior-period GA4/i);

const cro = executeSpecialistWorkflow(context, {
  question: "How can we improve the landing-page conversion rate?",
});
assert.equal(cro.response.specialist?.id, "cro-analyst");
assert.equal(cro.response.specialistAnalysis?.findings[0]?.kind, "limitation");
assert.match(cro.response.specialistAnalysis?.hypotheses[0]?.statement ?? "", /^Hypothesis:/);
assert.equal(cro.response.specialistAnalysis?.recommendations[0]?.evidence.length, 0);
assert.ok(cro.response.specialistAnalysis?.recommendations[0]?.hypothesisId);

const seo = executeSpecialistWorkflow(context, {
  question: "Why did organic traffic fall?",
});
assert.equal(seo.response.specialist?.id, "seo-analyst");
assert.equal(seo.response.status, "insufficient_data");
assert.match(seo.response.limitations.join(" "), /Search Console/i);
assert.match(seo.response.specialistAnalysis?.hypotheses[0]?.statement ?? "", /^Hypothesis:/);

const rankSearchConsole: SearchConsoleDataState = {
  status: "available",
  data: {
    source: SEARCH_CONSOLE_SOURCE,
    sourceLabel: SEARCH_CONSOLE_SOURCE_LABEL,
    propertyUrl: "sc-domain:example.com",
    dateRange: { startDate: "2026-08-15", endDate: "2026-08-28" },
    fetchedAt: "2026-09-01T00:00:00.000Z",
    reports: [],
    rankTracking: {
      currentPeriod: { startDate: "2026-08-15", endDate: "2026-08-28" },
      previousPeriod: { startDate: "2026-08-01", endDate: "2026-08-14" },
      currentRows: [{ dimension: "query", query: "declining seo query", averagePosition: 9, impressions: 150, clicks: 8, ctr: 8 / 150 }],
      previousRows: [{ dimension: "query", query: "declining seo query", averagePosition: 5, impressions: 220, clicks: 16, ctr: 16 / 220 }],
    },
  },
};
const rankedSeo = executeSpecialistWorkflow({
  ...context,
  searchConsole: rankSearchConsole,
  rankTracking: buildSeoRankTracking(rankSearchConsole),
}, { question: "Which queries declined in ranking?" });
assert.equal(rankedSeo.response.status, "supported");
assert.match(rankedSeo.response.answer, /9\.0/);
assert.match(rankedSeo.response.limitations.join(" "), /not an exact live SERP rank/i);
assert.ok(rankedSeo.response.supportingEvidence.every((item) => item.context.includes("Google Search Console")));
assert.doesNotMatch(rankedSeo.response.answer, /algorithm update|competitor|backlink loss|technical SEO problem|content quality/i);

const currentOnlySearchConsole: SearchConsoleDataState = {
  status: "available",
  data: {
    ...rankSearchConsole.data,
    reports: [
      { dimension: "query", rows: [{ query: "current seo query", averagePosition: 8.2, impressions: 120, clicks: 12, ctr: 0.1 }] },
      { dimension: "page", rows: [{ page: "https://example.com/current", averagePosition: 9.4, impressions: 180, clicks: 15, ctr: 15 / 180 }] },
    ],
    rankTracking: undefined,
  },
};
const currentOnlySeo = executeSpecialistWorkflow({
  ...context,
  searchConsole: currentOnlySearchConsole,
  rankTracking: buildSeoRankTracking(currentOnlySearchConsole),
}, { question: "What does Search Console show for SEO?" });
assert.equal(currentOnlySeo.response.status, "supported");
assert.match(currentOnlySeo.response.answer, /current-period evidence/i);
assert.match(currentOnlySeo.response.limitations.join(" "), /No ranking movement is inferred/i);
assert.equal(currentOnlySeo.response.supportingEvidence.some((item) => item.metric === "Search Console CTR"), true);

const strategist = executeSpecialistWorkflow(context, {
  question: "What are the top three marketing priorities for next week?",
});
assert.equal(strategist.response.specialist?.id, "marketing-strategist");
assert.equal(strategist.response.workflow, "specialists_to_strategist");
assert.deepEqual(
  strategist.response.contributors?.map((agent) => agent.id),
  ["ppc-analyst", "analytics-analyst", "cro-analyst", "seo-analyst"],
);
assert.equal(strategist.response.specialistAnalysis?.recommendations.length, 3);
assert.equal(strategist.response.contributorAnalyses?.length, 4);
assert.ok(strategist.response.specialistAnalysis?.recommendations.every(
  (recommendation) => recommendation.evidence.length > 0 || recommendation.hypothesisId,
));

const explicitlySelected = executeSpecialistWorkflow(context, {
  question: "Why did CPA increase?",
  specialistId: "seo-analyst",
});
assert.equal(explicitlySelected.response.specialist?.id, "seo-analyst");
assert.match(explicitlySelected.response.limitations.join(" "), /Search Console/i);

const strategistAnalysis = strategist.response.specialistAnalysis;
assert.ok(strategistAnalysis);
const grounded = validateSpecialistAnalysisGrounding(
  strategistAnalysis,
  strategistAnalysis.evidence,
);
assert.equal(grounded.success, true);
const inventedEvidence = structuredClone(strategistAnalysis);
assert.ok(inventedEvidence.evidence[0]);
inventedEvidence.evidence[0].value += 1;
assert.equal(
  validateSpecialistAnalysisGrounding(
    inventedEvidence,
    strategistAnalysis.evidence,
  ).success,
  false,
  "Altered specialist evidence passed the grounding check.",
);

const ppcInstructions = getSpecialistAgent("ppc-analyst")!.systemInstructions;
const analyticsInstructions = getSpecialistAgent("analytics-analyst")!.systemInstructions;
const croInstructions = getSpecialistAgent("cro-analyst")!.systemInstructions;
const seoInstructions = getSpecialistAgent("seo-analyst")!.systemInstructions;
const strategistInstructions = getSpecialistAgent("marketing-strategist")!.systemInstructions;
assert.match(ppcInstructions, /Never infer a cause/i);
assert.match(analyticsInstructions, /Do not claim a period change without both periods/i);
assert.match(croInstructions, /label any CRO idea as a hypothesis/i);
assert.match(seoInstructions, /aggregated historical metric/i);
assert.match(strategistInstructions, /Never add a metric, cause, business fact/i);

console.log(
  "Specialist agent verification passed: five typed scopes, deterministic routing examples, manual selection, cross-discipline routing, bounded strategist synthesis, Search Console rank evidence, unavailable-data behavior, labeled CRO/SEO hypotheses, schema enforcement, and altered-evidence rejection.",
);
