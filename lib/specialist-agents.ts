import { z } from "zod";

import { marketingEvidenceSchema } from "./marketing-insights.ts";

export const SPECIALIST_AGENT_IDS = [
  "ppc-analyst",
  "analytics-analyst",
  "cro-analyst",
  "seo-analyst",
  "marketing-strategist",
] as const;

export const SPECIALIST_SELECTION_IDS = ["auto", ...SPECIALIST_AGENT_IDS] as const;

export type SpecialistAgentId = (typeof SPECIALIST_AGENT_IDS)[number];
export type SpecialistSelectionId = (typeof SPECIALIST_SELECTION_IDS)[number];

export const specialistAgentIdSchema = z.enum(SPECIALIST_AGENT_IDS);
export const specialistSelectionIdSchema = z.enum(SPECIALIST_SELECTION_IDS);

export const specialistAgentIdentitySchema = z
  .object({
    id: specialistAgentIdSchema,
    name: z.string().trim().min(1).max(100),
    specialty: z.string().trim().min(1).max(160),
  })
  .strict();

export const specialistFindingSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().min(1).max(700),
    kind: z.enum(["measured", "limitation"]),
    evidence: z.array(marketingEvidenceSchema).max(8),
    sourceAgentIds: z.array(specialistAgentIdSchema).min(1).max(5),
  })
  .strict()
  .superRefine((finding, context) => {
    if (finding.kind === "measured" && finding.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Measured findings require evidence.",
        path: ["evidence"],
      });
    }
    if (finding.kind === "limitation" && finding.evidence.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Limitations must not be presented as measured evidence.",
        path: ["evidence"],
      });
    }
  });

export const specialistHypothesisSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    statement: z.string().trim().min(1).max(500),
    validationNeeded: z.string().trim().min(1).max(500),
  })
  .strict();

export const specialistRecommendationSchema = z
  .object({
    action: z.string().trim().min(1).max(500),
    rationale: z.string().trim().min(1).max(500),
    priority: z.enum(["high", "medium", "low"]),
    evidence: z.array(marketingEvidenceSchema).max(8),
    hypothesisId: z.string().trim().min(1).max(100).nullable(),
    sourceAgentIds: z.array(specialistAgentIdSchema).min(1).max(5),
  })
  .strict()
  .superRefine((recommendation, context) => {
    if (recommendation.evidence.length === 0 && !recommendation.hypothesisId) {
      context.addIssue({
        code: "custom",
        message: "Recommendations require evidence or a labeled hypothesis.",
        path: ["evidence"],
      });
    }
  });

export const specialistAnalysisSchema = z
  .object({
    agent: specialistAgentIdentitySchema,
    summary: z.string().trim().min(1).max(1_200),
    findings: z.array(specialistFindingSchema).max(8),
    evidence: z.array(marketingEvidenceSchema).max(20),
    recommendations: z.array(specialistRecommendationSchema).max(6),
    limitations: z.array(z.string().trim().min(1).max(500)).max(10),
    confidence: z.number().finite().min(0).max(1),
    hypotheses: z.array(specialistHypothesisSchema).max(6),
  })
  .strict()
  .superRefine((analysis, context) => {
    const evidence = new Set(analysis.evidence.map((item) => JSON.stringify(item)));
    for (const [findingIndex, finding] of analysis.findings.entries()) {
      for (const [evidenceIndex, item] of finding.evidence.entries()) {
        if (!evidence.has(JSON.stringify(item))) {
          context.addIssue({
            code: "custom",
            message: "Finding evidence must also appear in the analysis evidence list.",
            path: ["findings", findingIndex, "evidence", evidenceIndex],
          });
        }
      }
    }
    const hypotheses = new Set(analysis.hypotheses.map((item) => item.id));
    for (const [recommendationIndex, recommendation] of analysis.recommendations.entries()) {
      if (
        recommendation.hypothesisId &&
        !hypotheses.has(recommendation.hypothesisId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Recommendation hypothesisId must reference a returned hypothesis.",
          path: ["recommendations", recommendationIndex, "hypothesisId"],
        });
      }
      for (const [evidenceIndex, item] of recommendation.evidence.entries()) {
        if (!evidence.has(JSON.stringify(item))) {
          context.addIssue({
            code: "custom",
            message: "Recommendation evidence must also appear in the analysis evidence list.",
            path: ["recommendations", recommendationIndex, "evidence", evidenceIndex],
          });
        }
      }
    }
  });

export type SpecialistAnalysis = z.infer<typeof specialistAnalysisSchema>;
export type SpecialistAgentIdentity = z.infer<typeof specialistAgentIdentitySchema>;

export type SpecialistAgent = {
  id: SpecialistAgentId;
  name: string;
  specialty: string;
  description: string;
  systemInstructions: string;
  responsibilities: readonly string[];
  supportedContext: readonly string[];
  boundaries: readonly string[];
  outputSchema: typeof specialistAnalysisSchema;
};

function defineAgent(
  definition: Omit<SpecialistAgent, "outputSchema">,
): SpecialistAgent {
  return { ...definition, outputSchema: specialistAnalysisSchema };
}

const agents = [
  defineAgent({
    id: "ppc-analyst",
    name: "PPC Analyst",
    specialty: "Google Ads and paid-media performance",
    description: "Evaluates paid-media efficiency, delivery, queries, and conversion performance.",
    systemInstructions:
      "Analyze only the supplied Google Ads and paid-media context. Tie every finding and action to supplied metrics. Never infer a cause, auction condition, lead quality, or budget constraint that the data does not establish.",
    responsibilities: [
      "Spend efficiency and CTR, CPC, CPA, conversion rate, and ROAS",
      "Campaign, keyword, search-term, conversion, budget, and bidding observations",
    ],
    supportedContext: [
      "Google Ads account and campaign metrics",
      "Loaded keyword, search-term, geography, device, conversion, and daily rows",
      "GA4 paid-media context only when an exact grounded join is available",
    ],
    boundaries: [
      "Does not invent reasons for performance changes",
      "Does not claim impression-share, bidding, margin, or lead-quality facts when unavailable",
    ],
  }),
  defineAgent({
    id: "analytics-analyst",
    name: "Analytics Analyst",
    specialty: "GA4 and contextual site analytics",
    description: "Interprets users, sessions, engagement, key events, traffic, and grounded period trends.",
    systemInstructions:
      "Use supplied GA4 context only. Distinguish Google Ads platform reporting from GA4 site reporting. Do not claim a period change without both periods or infer attribution or causation from correlation.",
    responsibilities: [
      "Users, sessions, engagement, key events, and traffic trends",
      "Period comparisons and grounded relationships between advertising and site behavior",
    ],
    supportedContext: ["Configured GA4 summary, traffic-source, landing-page, and campaign rows"],
    boundaries: [
      "Does not equate Google Ads conversions with GA4 key events",
      "Does not manufacture prior-period values or causal explanations",
    ],
  }),
  defineAgent({
    id: "cro-analyst",
    name: "CRO Analyst",
    specialty: "Conversion-rate and funnel opportunities",
    description: "Separates measured site-conversion evidence from testable page and funnel hypotheses.",
    systemInstructions:
      "Use only supplied conversion and page-level evidence for measured conclusions. When page content, experiments, or funnel steps are unavailable, explicitly label any CRO idea as a hypothesis and state how to validate it.",
    responsibilities: ["Landing-page and funnel performance", "Evidence-based conversion experiments"],
    supportedContext: ["GA4 landing-page sessions and key events", "Loaded conversion metrics"],
    boundaries: [
      "Does not diagnose page copy, UX, speed, or form friction without page-level evidence",
      "Labels unsupported CRO explanations as hypotheses",
    ],
  }),
  defineAgent({
    id: "seo-analyst",
    name: "SEO Analyst",
    specialty: "Organic-search performance interpretation",
    description: "Interprets available organic traffic while being explicit about missing SEO evidence.",
    systemInstructions:
      "Use only supplied organic analytics. Crush currently has no Search Console or crawler integration, so never claim rankings, queries, impressions, indexation, backlinks, or technical SEO findings. Label hypotheses and validation needs.",
    responsibilities: ["Organic traffic and conversion context", "Clearly labeled SEO hypotheses"],
    supportedContext: ["GA4 Organic Search traffic-source rows when configured"],
    boundaries: [
      "No Search Console query, click, impression, or ranking evidence",
      "No crawl, indexation, backlink, or on-page audit evidence",
    ],
  }),
  defineAgent({
    id: "marketing-strategist",
    name: "Marketing Strategist / CMO",
    specialty: "Cross-channel synthesis and prioritization",
    description: "Reconciles grounded specialist findings into business priorities and next actions.",
    systemInstructions:
      "Synthesize only the supplied structured specialist analyses. Preserve their evidence and limitations, resolve overlap, and prioritize actions. Never add a metric, cause, business fact, or expertise-derived conclusion that no specialist evidence supports.",
    responsibilities: ["Cross-channel synthesis", "Business implications and action prioritization"],
    supportedContext: ["Validated structured outputs from Crush specialists"],
    boundaries: [
      "Does not create new facts beyond underlying Crush data",
      "Does not hide specialist limitations or turn hypotheses into findings",
    ],
  }),
] as const satisfies readonly SpecialistAgent[];

const registry = new Map<SpecialistAgentId, SpecialistAgent>(
  agents.map((agent) => [agent.id, agent]),
);

export function listSpecialistAgents(): readonly SpecialistAgent[] {
  return agents;
}

export function getSpecialistAgent(id: SpecialistAgentId): SpecialistAgent | undefined {
  return registry.get(id);
}

export function specialistIdentity(id: SpecialistAgentId): SpecialistAgentIdentity {
  const agent = registry.get(id);
  if (!agent) throw new Error(`Unknown specialist agent: ${id}`);
  return { id: agent.id, name: agent.name, specialty: agent.specialty };
}

export type SpecialistRoute = {
  selection: SpecialistSelectionId;
  primaryAgentId: SpecialistAgentId;
  contributingAgentIds: SpecialistAgentId[];
  workflow: "single_specialist" | "specialists_to_strategist";
  reason: string;
};

const routingSignals: ReadonlyArray<{
  id: Exclude<SpecialistAgentId, "marketing-strategist">;
  pattern: RegExp;
}> = [
  {
    id: "ppc-analyst",
    pattern: /\b(?:google ads?|paid media|paid search|ppc|campaigns?|ad groups?|keywords?|search terms?|cpa|cpc|ctr|roas|spend|budget|bidding)\b/i,
  },
  {
    id: "analytics-analyst",
    pattern: /\b(?:ga4|analytics|users?|sessions?|engagement|key events?|traffic sources?|period comparison|previous period)\b/i,
  },
  {
    id: "cro-analyst",
    pattern: /\b(?:cro|conversion[- ]rate optimization|landing[- ]pages?|funnel|forms?|checkout|site conversion|a\/b|experiment)\b/i,
  },
  {
    id: "seo-analyst",
    pattern: /\b(?:seo|organic|search console|rankings?|backlinks?|indexation|crawl|technical search)\b/i,
  },
];

export function routeSpecialistQuestion(
  question: string,
  selection: SpecialistSelectionId = "auto",
): SpecialistRoute {
  if (selection !== "auto") {
    if (selection === "marketing-strategist") {
      return {
        selection,
        primaryAgentId: selection,
        contributingAgentIds: routingSignals.map((signal) => signal.id),
        workflow: "specialists_to_strategist",
        reason: "The selected strategist uses the bounded specialist synthesis workflow.",
      };
    }
    return {
      selection,
      primaryAgentId: selection,
      contributingAgentIds: [selection],
      workflow: "single_specialist",
      reason: "The user explicitly selected this specialist.",
    };
  }

  const broadStrategy = /\b(?:priorities|priority|strategy|strategic|what should we do|next week|marketing performance|across channels?|overall marketing)\b/i.test(
    question,
  );
  const matches = routingSignals
    .filter((signal) => signal.pattern.test(question))
    .map((signal) => signal.id);

  if (broadStrategy) {
    const contributors = matches.length > 0
      ? matches
      : routingSignals.map((signal) => signal.id);
    return {
      selection,
      primaryAgentId: "marketing-strategist",
      contributingAgentIds: contributors,
      workflow: "specialists_to_strategist",
      reason: "The request asks for cross-channel interpretation or prioritized action.",
    };
  }

  if (matches.length > 1) {
    return {
      selection,
      primaryAgentId: "marketing-strategist",
      contributingAgentIds: matches,
      workflow: "specialists_to_strategist",
      reason: "The question contains signals from multiple specialist disciplines.",
    };
  }

  const primaryAgentId = matches[0] ?? "marketing-strategist";
  return {
    selection,
    primaryAgentId,
    contributingAgentIds: [primaryAgentId],
    workflow: "single_specialist",
    reason: matches.length === 1
      ? "The question matched this specialist's deterministic routing signals."
      : "No narrow discipline matched, so the strategist handles the general request.",
  };
}
