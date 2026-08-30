import {
  marketingInsightSchema,
  type MarketingEvidence,
  type MarketingInsight,
} from "./marketing-insights.ts";

export const AI_INSIGHT_SECTIONS = [
  {
    id: "critical",
    title: "Critical issues",
    description: "High-priority findings that need attention.",
    emptyMessage: "No critical issues were returned by this analysis.",
  },
  {
    id: "opportunities",
    title: "Opportunities",
    description: "Evidence-backed ways to protect or improve performance.",
    emptyMessage: "No general opportunities were returned by this analysis.",
  },
  {
    id: "budget",
    title: "Budget recommendations",
    description: "Supported changes to spend or allocation.",
    emptyMessage: "No budget recommendations were returned by this analysis.",
  },
  {
    id: "keyword",
    title: "Keyword recommendations",
    description: "Actions supported by keyword or search-term performance.",
    emptyMessage: "No keyword recommendations were returned by this analysis.",
  },
  {
    id: "landing-page",
    title: "Landing-page recommendations",
    description: "Page-alignment actions explicitly supported by a finding.",
    emptyMessage:
      "No evidence-backed landing-page recommendations were returned.",
  },
] as const;

export type AiInsightSectionId = (typeof AI_INSIGHT_SECTIONS)[number]["id"];

export type AiInsightSection = (typeof AI_INSIGHT_SECTIONS)[number] & {
  insights: MarketingInsight[];
};

const budgetLanguage = /\b(?:budget|reallocation|allocation)\b/i;
const landingPageLanguage = /\blanding[- ]page\b/i;

function insightLanguage(insight: MarketingInsight): string {
  return [
    insight.problemOpportunity,
    insight.recommendedAction,
    insight.expectedImpact,
  ].join(" ");
}

export function getAiInsightSection(
  insight: MarketingInsight,
): AiInsightSectionId {
  if (
    insight.affectedEntity.type === "keyword" ||
    insight.affectedEntity.type === "search_term"
  ) {
    return "keyword";
  }

  const language = insightLanguage(insight);
  if (landingPageLanguage.test(language)) return "landing-page";
  if (budgetLanguage.test(language)) return "budget";

  if (insight.severity === "critical" || insight.severity === "high") {
    return "critical";
  }

  return "opportunities";
}

export function normalizeMarketingInsights(value: unknown): MarketingInsight[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const result = marketingInsightSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}

export function buildAiInsightSections(value: unknown): AiInsightSection[] {
  const insights = normalizeMarketingInsights(value);

  return AI_INSIGHT_SECTIONS.map((section) => ({
    ...section,
    insights: insights.filter(
      (insight) => getAiInsightSection(insight) === section.id,
    ),
  }));
}

const evidenceNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatEvidenceValue(
  evidence: MarketingEvidence,
  currency: string,
): string {
  if (evidence.unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(evidence.value);
  }

  const value = evidenceNumberFormatter.format(evidence.value);
  if (evidence.unit === "percent") return `${value}%`;
  if (evidence.unit === "ratio") return `${value}x`;
  return value;
}

export function formatConfidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}
