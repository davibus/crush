import { z } from "zod";

export const MARKETING_INSIGHT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

export const MARKETING_ENTITY_TYPES = [
  "account",
  "campaign",
  "ad_group",
  "keyword",
  "search_term",
  "geography",
  "device",
  "conversion_action",
] as const;

export const EVIDENCE_UNITS = [
  "currency",
  "percent",
  "count",
  "ratio",
] as const;

export const marketingEvidenceSchema = z
  .object({
    metric: z.string().trim().min(1).max(100),
    value: z.number().finite(),
    unit: z.enum(EVIDENCE_UNITS),
    context: z.string().trim().min(1).max(300),
  })
  .strict();

export const marketingEntitySchema = z
  .object({
    type: z.enum(MARKETING_ENTITY_TYPES),
    id: z.string().trim().min(1).max(100).nullable(),
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export const marketingInsightSchema = z
  .object({
    problemOpportunity: z.string().trim().min(1).max(500),
    severity: z.enum(MARKETING_INSIGHT_SEVERITIES),
    affectedEntity: marketingEntitySchema,
    evidence: z.array(marketingEvidenceSchema).min(1).max(8),
    recommendedAction: z.string().trim().min(1).max(500),
    expectedImpact: z.string().trim().min(1).max(500),
    confidenceScore: z.number().finite().min(0).max(1),
  })
  .strict();

export const marketingInsightsResponseSchema = z
  .object({
    insights: z.array(marketingInsightSchema).max(5),
  })
  .strict();

export type MarketingEvidence = z.infer<typeof marketingEvidenceSchema>;
export type MarketingEntity = z.infer<typeof marketingEntitySchema>;
export type MarketingInsight = z.infer<typeof marketingInsightSchema>;
export type MarketingInsightsResponse = z.infer<
  typeof marketingInsightsResponseSchema
>;

export type MarketingInsightsValidationResult =
  | { success: true; insights: MarketingInsight[] }
  | { success: false; insights: []; error: string };

export function validateMarketingInsights(
  value: unknown,
): MarketingInsightsValidationResult {
  const result = marketingInsightsResponseSchema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      insights: [],
      error: "The AI response did not match the required marketing insight format.",
    };
  }

  return { success: true, insights: result.data.insights };
}
