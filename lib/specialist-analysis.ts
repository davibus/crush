import type { PreparedCampaignPerformanceAnalysis } from "./campaign-performance-analyzer.ts";
import type { GA4Data, GA4DataState, GA4Metrics } from "./ga4.ts";
import type { GoogleAdsDailyMetric } from "./google-ads.ts";
import {
  buildGroundedChatCandidates,
  resolveDeterministicCalculation,
  selectGroundedChatCandidates,
  type ChatConversationMessage,
  type GroundedChatCandidate,
  type MarketingChatResponse,
} from "./marketing-data-chat.ts";
import type { MarketingEvidence } from "./marketing-insights.ts";
import {
  getSpecialistAgent,
  routeSpecialistQuestion,
  specialistAnalysisSchema,
  specialistIdentity,
  type SpecialistAgentId,
  type SpecialistAnalysis,
  type SpecialistRoute,
  type SpecialistSelectionId,
} from "./specialist-agents.ts";

export type SpecialistMarketingContext = {
  analysis: PreparedCampaignPerformanceAnalysis;
  dailyMetrics: readonly GoogleAdsDailyMetric[];
  ga4: GA4DataState;
};

export type ExecuteSpecialistRequest = {
  question: string;
  history?: readonly ChatConversationMessage[];
  specialistId?: SpecialistSelectionId;
};

export type SpecialistWorkflowResult = {
  route: SpecialistRoute;
  response: MarketingChatResponse;
};

type SpecialistExecution = {
  analysis: SpecialistAnalysis;
  response: MarketingChatResponse;
};

function uniqueEvidence(items: readonly MarketingEvidence[]): MarketingEvidence[] {
  return [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];
}

function uniqueStrings(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function calculationEvidence(response: MarketingChatResponse): MarketingEvidence[] {
  return (response.calculations ?? []).flatMap((calculation) =>
    calculation.result
      ? [{
          metric: calculation.label,
          value: calculation.result.value,
          unit: calculation.result.unit,
          context: `${calculation.entity.name}; deterministically calculated as ${calculation.formula}.`,
        }]
      : [],
  );
}

const candidateTitles: Record<string, string> = {
  best_campaigns: "Paid-media efficiency and volume leaders",
  waste: "Measured campaign inefficiency",
  city_conversion_rate: "Geographic conversion-rate leaders",
  budget_increase: "Controlled budget-growth candidate",
  negative_search_terms: "Search-term exclusion review",
  cpa_increase: "CPA change cannot be diagnosed",
  weekly_change: "Weekly change cannot be measured",
  unsupported_question: "Question is outside the available paid-media evidence",
};

const candidateRecommendations: Partial<
  Record<string, { action: string; rationale: string; priority: "high" | "medium" | "low" }>
> = {
  waste: {
    action: "Audit and constrain the measured high-spend, low-conversion campaign before expanding it.",
    rationale: "The loaded campaign metrics show the clearest cost and conversion inefficiency.",
    priority: "high",
  },
  budget_increase: {
    action: "Run a controlled budget-growth test on the supported efficiency leader and monitor marginal CPA and ROAS.",
    rationale: "Its loaded CPA and ROAS outperform the account benchmarks.",
    priority: "medium",
  },
  negative_search_terms: {
    action: "Review the flagged search term's intent and lead quality, then add a scoped negative only if that review confirms irrelevance.",
    rationale: "The term meets the deterministic spend, click, and conversion review criteria.",
    priority: "medium",
  },
};

function analysisFromCandidates(
  agentId: SpecialistAgentId,
  candidates: readonly GroundedChatCandidate[],
  summary?: string,
): SpecialistAnalysis {
  const agent = getSpecialistAgent(agentId);
  if (!agent) throw new Error(`Unknown specialist agent: ${agentId}`);
  const supported = candidates.filter((candidate) => candidate.response.status === "supported");
  const allEvidence = uniqueEvidence(
    candidates.flatMap((candidate) => [
      ...candidate.response.supportingEvidence,
      ...calculationEvidence(candidate.response),
    ]),
  );
  const findings = candidates.map((candidate) => {
    const evidence = uniqueEvidence([
      ...candidate.response.supportingEvidence,
      ...calculationEvidence(candidate.response),
    ]);
    return {
      title: candidateTitles[candidate.id] ?? "Grounded marketing observation",
      detail: candidate.response.answer,
      kind: candidate.response.status === "supported" && evidence.length > 0
        ? "measured" as const
        : "limitation" as const,
      evidence: candidate.response.status === "supported" ? evidence : [],
      sourceAgentIds: [agentId],
    };
  });
  const recommendations = candidates.flatMap((candidate) => {
    const definition = candidateRecommendations[candidate.id];
    if (!definition || candidate.response.status !== "supported") return [];
    const evidence = uniqueEvidence([
      ...candidate.response.supportingEvidence,
      ...calculationEvidence(candidate.response),
    ]);
    if (evidence.length === 0) return [];
    return [{
      ...definition,
      evidence,
      hypothesisId: null,
      sourceAgentIds: [agentId],
    }];
  });

  return specialistAnalysisSchema.parse({
    agent: specialistIdentity(agentId),
    summary: summary ?? candidates[0]?.response.answer ?? "No supported analysis is available.",
    findings,
    evidence: allEvidence,
    recommendations,
    limitations: uniqueStrings(candidates.flatMap((candidate) => candidate.response.limitations)),
    confidence: supported.length === candidates.length && supported.length > 0 ? 0.9 : supported.length > 0 ? 0.72 : 0.25,
    hypotheses: [],
  });
}

function withSpecialistMetadata(
  response: MarketingChatResponse,
  analysis: SpecialistAnalysis,
  route: SpecialistRoute,
  contributorAnalyses: readonly SpecialistAnalysis[] = [],
): MarketingChatResponse {
  return {
    ...response,
    specialist: analysis.agent,
    contributors: contributorAnalyses.length > 0
      ? contributorAnalyses.map((item) => item.agent)
      : [analysis.agent],
    workflow: route.workflow,
    routingReason: route.reason,
    specialistAnalysis: analysis,
    ...(contributorAnalyses.length > 0
      ? { contributorAnalyses: [...contributorAnalyses] }
      : {}),
  };
}

function ppcExecution(
  context: SpecialistMarketingContext,
  request: ExecuteSpecialistRequest,
  broad = false,
): SpecialistExecution {
  const candidates = buildGroundedChatCandidates(context.analysis, context.dailyMetrics);
  let selected: GroundedChatCandidate[];
  if (broad) {
    const priorityIds = ["waste", "budget_increase", "negative_search_terms"];
    selected = priorityIds.flatMap((id) => candidates.find((candidate) => candidate.id === id) ?? []);
  } else {
    const calculation = resolveDeterministicCalculation(request.question, context.analysis);
    const routed = calculation
      ? [calculation]
      : selectGroundedChatCandidates(request.question, request.history ?? [], candidates);
    selected = routed.length === 1
      ? routed
      : candidates.filter((candidate) => candidate.id === "unsupported_question");
  }
  const analysis = analysisFromCandidates(
    "ppc-analyst",
    selected,
    broad
      ? "The PPC review prioritized the strongest measured paid-media actions without inferring unobserved causes."
      : undefined,
  );
  const primary = selected[0]!;
  const response: MarketingChatResponse = broad
    ? {
        status: selected.some((candidate) => candidate.response.status === "supported") ? "supported" : "insufficient_data",
        answer: analysis.summary,
        supportingEvidence: analysis.evidence.slice(0, 12),
        limitations: analysis.limitations.slice(0, 4),
        referencedEntities: selected.flatMap((candidate) => candidate.response.referencedEntities).slice(0, 8),
      }
    : primary.response;
  return { analysis, response };
}

function ga4UnavailableExecution(
  agentId: "analytics-analyst" | "cro-analyst" | "seo-analyst",
  answer: string,
  limitations: string[],
  hypothesis?: SpecialistAnalysis["hypotheses"][number],
): SpecialistExecution {
  const hypotheses = hypothesis ? [hypothesis] : [];
  const recommendations = hypothesis
    ? [{
        action: hypothesis.validationNeeded,
        rationale: `Test this explicitly labeled ${agentId === "seo-analyst" ? "SEO" : "CRO"} hypothesis before treating it as a finding.`,
        priority: "low" as const,
        evidence: [],
        hypothesisId: hypothesis.id,
        sourceAgentIds: [agentId],
      }]
    : [];
  const analysis = specialistAnalysisSchema.parse({
    agent: specialistIdentity(agentId),
    summary: answer,
    findings: [{
      title: "Required evidence is unavailable",
      detail: answer,
      kind: "limitation",
      evidence: [],
      sourceAgentIds: [agentId],
    }],
    evidence: [],
    recommendations,
    limitations,
    confidence: 0.15,
    hypotheses,
  });
  return {
    analysis,
    response: {
      status: "insufficient_data",
      answer,
      supportingEvidence: [],
      limitations: limitations.slice(0, 4),
      referencedEntities: [],
    },
  };
}

function ga4Evidence(metrics: GA4Metrics, context: string): MarketingEvidence[] {
  return [
    { metric: "Sessions", value: metrics.sessions, unit: "count", context },
    { metric: "Users", value: metrics.totalUsers, unit: "count", context },
    { metric: "Engagement rate", value: metrics.engagementRate, unit: "percent", context },
    { metric: "Key events", value: metrics.keyEvents, unit: "count", context },
  ];
}

function analyticsExecution(
  context: SpecialistMarketingContext,
  request: ExecuteSpecialistRequest,
): SpecialistExecution {
  if (context.ga4.status !== "available") {
    return ga4UnavailableExecution(
      "analytics-analyst",
      "Crush cannot evaluate sessions, users, engagement, or their change because GA4 context is not available.",
      [
        "GA4 is unconfigured or unavailable for this request.",
        "No prior-period GA4 series is present, so a session decline cannot be measured or explained.",
      ],
    );
  }
  const { data } = context.ga4;
  const asksForChange = /\b(?:declin|decreas|increas|chang|previous|prior|compar|why|fell|fall|rose|rise)\w*\b/i.test(request.question);
  const evidence = ga4Evidence(
    data.summary,
    `GA4 property ${data.propertyId}, ${data.dateRange.startDate} through ${data.dateRange.endDate}.`,
  );
  const limitation = "Only one GA4 reporting period is loaded; no prior-period GA4 totals are available for a valid comparison or causal diagnosis.";
  const answer = asksForChange
    ? `The loaded GA4 period contains ${data.summary.sessions.toLocaleString("en-US")} sessions, but Crush cannot verify or explain a decline without prior-period GA4 data.`
    : `The loaded GA4 period contains ${data.summary.sessions.toLocaleString("en-US")} sessions, ${data.summary.totalUsers.toLocaleString("en-US")} users, and ${data.summary.keyEvents.toLocaleString("en-US")} key events.`;
  const analysis = specialistAnalysisSchema.parse({
    agent: specialistIdentity("analytics-analyst"),
    summary: answer,
    findings: [{
      title: "Current GA4 period",
      detail: "Current-period site activity is measured, but a trend requires another comparable period.",
      kind: "measured",
      evidence,
      sourceAgentIds: ["analytics-analyst"],
    }],
    evidence,
    recommendations: [],
    limitations: asksForChange ? [limitation] : [],
    confidence: asksForChange ? 0.45 : 0.9,
    hypotheses: [],
  });
  return {
    analysis,
    response: {
      status: asksForChange ? "insufficient_data" : "supported",
      answer,
      supportingEvidence: evidence,
      limitations: asksForChange ? [limitation] : [],
      referencedEntities: [],
    },
  };
}

function croExecution(context: SpecialistMarketingContext): SpecialistExecution {
  const hypothesis = {
    id: "cro-message-match",
    statement: "Hypothesis: landing-page message match or funnel friction may be suppressing conversion rate; Crush has no page-content, step-level funnel, or experiment evidence to confirm this.",
    validationNeeded: "Instrument funnel steps and run a controlled landing-page experiment with a predefined primary conversion metric.",
  };
  if (context.ga4.status !== "available" || context.ga4.data.landingPages.length === 0) {
    return ga4UnavailableExecution(
      "cro-analyst",
      "Crush cannot identify a measured landing-page conversion-rate opportunity because page-level analytics are unavailable. A possible page or funnel issue is only a hypothesis.",
      ["No GA4 landing-page rows, page content, funnel steps, or experiment results are available."],
      hypothesis,
    );
  }
  const pages = context.ga4.data.landingPages
    .filter((page) => page.sessions > 0)
    .map((page) => ({ page, rate: (page.keyEvents / page.sessions) * 100 }))
    .sort((left, right) => left.rate - right.rate);
  const lowest = pages[0];
  if (!lowest) {
    return ga4UnavailableExecution(
      "cro-analyst",
      "Landing-page rows are loaded, but none has sessions from which to calculate a key-event rate.",
      ["At least one landing page with sessions is required."],
      hypothesis,
    );
  }
  const evidence: MarketingEvidence[] = [
    { metric: "Landing-page sessions", value: lowest.page.sessions, unit: "count", context: `${lowest.page.landingPage} in the loaded GA4 period.` },
    { metric: "Landing-page key-event rate", value: Number(lowest.rate.toFixed(2)), unit: "percent", context: `${lowest.page.keyEvents} GA4 key events divided by ${lowest.page.sessions} sessions for ${lowest.page.landingPage}.` },
  ];
  const answer = `${lowest.page.landingPage} has the lowest calculated GA4 key-event rate among loaded landing pages at ${lowest.rate.toFixed(2)}%. This identifies where to investigate, not why the page performs that way.`;
  const analysis = specialistAnalysisSchema.parse({
    agent: specialistIdentity("cro-analyst"),
    summary: answer,
    findings: [{ title: "Lowest observed landing-page key-event rate", detail: answer, kind: "measured", evidence, sourceAgentIds: ["cro-analyst"] }],
    evidence,
    recommendations: [{
      action: hypothesis.validationNeeded,
      rationale: "Page-level outcome data identifies an investigation target but does not diagnose the cause.",
      priority: "medium",
      evidence,
      hypothesisId: hypothesis.id,
      sourceAgentIds: ["cro-analyst"],
    }],
    limitations: ["GA4 key events are used as the available site outcome; page content, funnel steps, and experiments are not loaded."],
    confidence: 0.7,
    hypotheses: [hypothesis],
  });
  return { analysis, response: { status: "supported", answer, supportingEvidence: evidence, limitations: analysis.limitations.slice(0, 4), referencedEntities: [] } };
}

function sumGA4Metrics(rows: GA4Data["trafficSources"]): GA4Metrics {
  const totals = rows.reduce(
    (sum, row) => ({
      sessions: sum.sessions + row.sessions,
      totalUsers: sum.totalUsers + row.totalUsers,
      newUsers: sum.newUsers + row.newUsers,
      activeUsers: sum.activeUsers + row.activeUsers,
      keyEvents: sum.keyEvents + row.keyEvents,
      engagedSessions: sum.engagedSessions + row.engagedSessions,
      totalRevenue: sum.totalRevenue + row.totalRevenue,
    }),
    { sessions: 0, totalUsers: 0, newUsers: 0, activeUsers: 0, keyEvents: 0, engagedSessions: 0, totalRevenue: 0 },
  );
  return { ...totals, engagementRate: totals.sessions > 0 ? (totals.engagedSessions / totals.sessions) * 100 : 0 };
}

function seoExecution(
  context: SpecialistMarketingContext,
  request: ExecuteSpecialistRequest,
): SpecialistExecution {
  const hypothesis = {
    id: "seo-demand-or-visibility",
    statement: "Hypothesis: an organic change could reflect search demand, search visibility, indexation, or site changes; Crush does not currently have evidence that distinguishes these causes.",
    validationNeeded: "Connect Search Console and compare query, page, country, device, click, impression, CTR, and position data across equivalent periods; add crawl evidence if technical causes are suspected.",
  };
  if (context.ga4.status !== "available") {
    return ga4UnavailableExecution(
      "seo-analyst",
      "Crush cannot measure organic traffic for this request because GA4 is unavailable, and it cannot diagnose SEO causes because Search Console and crawler data are not integrated.",
      ["GA4 organic traffic is unavailable.", "Search Console and SEO crawler evidence are not available in Crush."],
      hypothesis,
    );
  }
  const organicRows = context.ga4.data.trafficSources.filter(
    (row) => /organic search/i.test(row.channelGroup) || /^organic$/i.test(row.medium),
  );
  if (organicRows.length === 0) {
    return ga4UnavailableExecution(
      "seo-analyst",
      "The loaded GA4 context has no Organic Search traffic-source rows, and Crush has no Search Console or crawler data from which to make an SEO finding.",
      ["No GA4 Organic Search rows are present.", "Search Console and SEO crawler evidence are not available in Crush."],
      hypothesis,
    );
  }
  const metrics = sumGA4Metrics(organicRows);
  const evidence = ga4Evidence(metrics, `GA4 Organic Search rows, ${context.ga4.data.dateRange.startDate} through ${context.ga4.data.dateRange.endDate}.`);
  const asksForChange = /\b(?:declin|decreas|increas|chang|previous|prior|compar|why|fell|fall|rose|rise)\w*\b/i.test(request.question);
  const limitation = "Only one organic GA4 period is loaded, and Search Console and crawler evidence are absent; traffic change and SEO causes cannot be established.";
  const answer = asksForChange
    ? `The loaded period contains ${metrics.sessions.toLocaleString("en-US")} Organic Search sessions, but Crush cannot verify or explain a fall without a comparison period and Search Console evidence.`
    : `The loaded period contains ${metrics.sessions.toLocaleString("en-US")} Organic Search sessions and ${metrics.keyEvents.toLocaleString("en-US")} key events.`;
  const analysis = specialistAnalysisSchema.parse({
    agent: specialistIdentity("seo-analyst"),
    summary: answer,
    findings: [{ title: "Current Organic Search activity", detail: answer, kind: "measured", evidence, sourceAgentIds: ["seo-analyst"] }],
    evidence,
    recommendations: asksForChange ? [{ action: hypothesis.validationNeeded, rationale: "The causal possibilities remain hypotheses until search-performance evidence is compared.", priority: "medium", evidence: [], hypothesisId: hypothesis.id, sourceAgentIds: ["seo-analyst"] }] : [],
    limitations: [limitation],
    confidence: asksForChange ? 0.4 : 0.75,
    hypotheses: asksForChange ? [hypothesis] : [],
  });
  return { analysis, response: { status: asksForChange ? "insufficient_data" : "supported", answer, supportingEvidence: evidence, limitations: [limitation], referencedEntities: [] } };
}

function executeOne(
  id: Exclude<SpecialistAgentId, "marketing-strategist">,
  context: SpecialistMarketingContext,
  request: ExecuteSpecialistRequest,
  broad: boolean,
): SpecialistExecution {
  if (id === "ppc-analyst") return ppcExecution(context, request, broad);
  if (id === "analytics-analyst") return analyticsExecution(context, request);
  if (id === "cro-analyst") return croExecution(context);
  return seoExecution(context, request);
}

function strategistSynthesis(
  executions: readonly SpecialistExecution[],
): SpecialistExecution {
  const recommendations = executions
    .flatMap((execution) => execution.analysis.recommendations)
    .sort((left, right) => ({ high: 0, medium: 1, low: 2 })[left.priority] - ({ high: 0, medium: 1, low: 2 })[right.priority])
    .slice(0, 3);
  const evidence = uniqueEvidence(recommendations.flatMap((item) => item.evidence));
  const limitations = uniqueStrings(executions.flatMap((execution) => execution.analysis.limitations));
  const summary = recommendations.length > 0
    ? `The top ${recommendations.length} grounded marketing ${recommendations.length === 1 ? "priority is" : "priorities are"}: ${recommendations.map((item, index) => `${index + 1}) ${item.action}`).join(" ")}`
    : "The specialists did not find enough measured evidence to set an action priority; collect the missing channel and comparison data first.";
  const analysis = specialistAnalysisSchema.parse({
    agent: specialistIdentity("marketing-strategist"),
    summary,
    findings: executions.flatMap((execution) => execution.analysis.findings).slice(0, 8),
    evidence: uniqueEvidence(executions.flatMap((execution) => execution.analysis.evidence)).slice(0, 20),
    recommendations,
    limitations: limitations.slice(0, 10),
    confidence: recommendations.length > 0 ? 0.78 : 0.2,
    hypotheses: executions.flatMap((execution) => execution.analysis.hypotheses).slice(0, 6),
  });
  return {
    analysis,
    response: {
      status: recommendations.length > 0 ? "supported" : "insufficient_data",
      answer: summary,
      supportingEvidence: evidence.slice(0, 12),
      limitations: limitations.slice(0, 4),
      referencedEntities: executions.flatMap((execution) => execution.response.referencedEntities).slice(0, 8),
    },
  };
}

export function validateSpecialistAnalysisGrounding(
  value: unknown,
  allowedEvidence: readonly MarketingEvidence[],
): { success: true; analysis: SpecialistAnalysis } | { success: false; error: string } {
  const parsed = specialistAnalysisSchema.safeParse(value);
  if (!parsed.success) return { success: false, error: "The specialist output did not match the required structured schema." };
  const allowed = new Set(allowedEvidence.map((item) => JSON.stringify(item)));
  if (parsed.data.evidence.some((item) => !allowed.has(JSON.stringify(item)))) {
    return { success: false, error: "The specialist output contains evidence that was not supplied by Crush." };
  }
  return { success: true, analysis: parsed.data };
}

export function executeSpecialistWorkflow(
  context: SpecialistMarketingContext,
  request: ExecuteSpecialistRequest,
): SpecialistWorkflowResult {
  const route = routeSpecialistQuestion(request.question, request.specialistId ?? "auto");
  if (route.workflow === "single_specialist" && route.primaryAgentId !== "marketing-strategist") {
    const execution = executeOne(route.primaryAgentId, context, request, false);
    return { route, response: withSpecialistMetadata(execution.response, execution.analysis, route) };
  }

  const contributorIds = route.contributingAgentIds.filter(
    (id): id is Exclude<SpecialistAgentId, "marketing-strategist"> => id !== "marketing-strategist",
  );
  const contributors = contributorIds.map((id) => executeOne(id, context, request, true));
  const strategist = strategistSynthesis(contributors);
  return {
    route,
    response: withSpecialistMetadata(
      strategist.response,
      strategist.analysis,
      route,
      contributors.map((execution) => execution.analysis),
    ),
  };
}
