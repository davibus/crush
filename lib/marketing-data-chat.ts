import { z } from "zod";

import type { PreparedCampaignPerformanceAnalysis } from "./campaign-performance-analyzer.ts";
import {
  calculateGoogleAdsMetric,
  calculateGoogleAdsMetrics,
  GOOGLE_ADS_METRIC_KEYS,
  type CalculatedGoogleAdsMetrics,
  type GoogleAdsDailyMetric,
  type GoogleAdsMetricCalculation,
  type GoogleAdsMetricKey,
} from "./google-ads.ts";
import {
  marketingEntitySchema,
  marketingEvidenceSchema,
  type MarketingEntity,
} from "./marketing-insights.ts";

export const MAX_CHAT_QUESTION_LENGTH = 500;
export const MAX_CHAT_HISTORY_MESSAGES = 8;
export const MAX_CHAT_HISTORY_CHARACTERS = 3_000;

export const chatConversationMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_CHAT_QUESTION_LENGTH),
  })
  .strict();

export const marketingChatRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(MAX_CHAT_QUESTION_LENGTH),
    history: z
      .array(chatConversationMessageSchema)
      .max(MAX_CHAT_HISTORY_MESSAGES)
      .default([]),
  })
  .strict()
  .superRefine(({ history }, context) => {
    const characterCount = history.reduce(
      (total, message) => total + message.content.length,
      0,
    );

    if (characterCount > MAX_CHAT_HISTORY_CHARACTERS) {
      context.addIssue({
        code: "custom",
        message: `Conversation history must be ${MAX_CHAT_HISTORY_CHARACTERS} characters or fewer.`,
        path: ["history"],
      });
    }
  });

export const marketingChatResponseSchema = z
  .object({
    status: z.enum(["supported", "unsupported", "insufficient_data"]),
    answer: z.string().trim().min(1).max(2_000),
    supportingEvidence: z.array(marketingEvidenceSchema).max(12),
    limitations: z.array(z.string().trim().min(1).max(400)).max(4),
    referencedEntities: z.array(marketingEntitySchema).max(8),
    calculations: z
      .array(
        z
          .object({
            metric: z.enum(GOOGLE_ADS_METRIC_KEYS),
            label: z.string().trim().min(1).max(100),
            status: z.enum(["calculated", "insufficient_data"]),
            formula: z.string().trim().min(1).max(200),
            inputs: z
              .array(
                z
                  .object({
                    label: z.string().trim().min(1).max(100),
                    value: z.number().finite(),
                    unit: z.enum(["currency", "percent", "count", "ratio"]),
                  })
                  .strict(),
              )
              .max(5),
            result: z
              .object({
                value: z.number().finite(),
                unit: z.enum(["currency", "percent", "count", "ratio"]),
              })
              .strict()
              .nullable(),
            reason: z.string().trim().min(1).max(300).nullable(),
            entity: marketingEntitySchema,
          })
          .strict(),
      )
      .max(8)
      .optional(),
  })
  .strict();

export type ChatConversationMessage = z.infer<
  typeof chatConversationMessageSchema
>;
export type MarketingChatRequest = z.infer<typeof marketingChatRequestSchema>;
export type MarketingChatResponse = z.infer<
  typeof marketingChatResponseSchema
>;

export type MarketingChatIntent =
  | "cpa_increase"
  | "best_campaigns"
  | "waste"
  | "city_conversion_rate"
  | "budget_increase"
  | "negative_search_terms"
  | "weekly_change"
  | "unknown";

export type GroundedChatCandidate = {
  id: string;
  response: MarketingChatResponse;
};

export type MarketingChatCalculation = NonNullable<
  MarketingChatResponse["calculations"]
>[number];

function round(value: number): number {
  return Number(value.toFixed(2));
}

function currency(value: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function evidence(
  metric: string,
  value: number,
  unit: "currency" | "percent" | "count" | "ratio",
  context: string,
) {
  return { metric, value: round(value), unit, context } as const;
}

function calculationMetrics(
  metrics: CalculatedGoogleAdsMetrics,
): Parameters<typeof calculateGoogleAdsMetric>[0] {
  return {
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    cost: metrics.spend,
    conversions: metrics.conversions,
    conversionValue: metrics.conversionValue,
  };
}

function chatCalculation(
  calculation: GoogleAdsMetricCalculation,
  entity: MarketingEntity,
): MarketingChatCalculation {
  return {
    metric: calculation.metric,
    label: calculation.label,
    status: calculation.status,
    formula: calculation.formula,
    inputs: calculation.inputs.map(({ label, value, unit }) => ({
      label,
      value,
      unit,
    })),
    result:
      calculation.status === "calculated"
        ? { value: calculation.value, unit: calculation.unit }
        : null,
    reason:
      calculation.status === "insufficient_data"
        ? calculation.reason
        : null,
    entity,
  };
}

function formatMetricValue(
  calculation: MarketingChatCalculation,
  currencyCode: string,
): string {
  const result = calculation.result;
  if (!result) return "unavailable";
  if (result.unit === "currency") return currency(result.value, currencyCode);
  if (result.unit === "percent") return `${result.value.toFixed(2)}%`;
  if (result.unit === "ratio") return `${result.value.toFixed(2)}x`;
  return result.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function normalizedText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requestedMetric(question: string): GoogleAdsMetricKey | null {
  const normalized = normalizedText(question);
  if (/\b(?:cpa|cost per (?:acquisition|conversion)|each conversion cost)\b/.test(normalized)) return "cpa";
  if (/\b(?:conversion rate|percentage of clicks converted|percent of clicks converted)\b/.test(normalized)) return "conversionRate";
  if (/\bctr\b|\bclick through rate\b/.test(normalized)) return "ctr";
  if (/\bcpc\b|\bcost per click\b/.test(normalized)) return "cpc";
  if (/\broas\b|\breturn on ad spend\b/.test(normalized)) return "roas";
  if (/\bconversion value\b|\bvalue of conversions\b/.test(normalized)) return "conversionValue";
  if (/\bspend\b|\bhow much (?:did|have) (?:i|we) spend\b/.test(normalized)) return "spend";
  if (/\bimpressions?\b/.test(normalized)) return "impressions";
  if (/\bclicks?\b/.test(normalized)) return "clicks";
  if (/\bconversions?\b/.test(normalized)) return "conversions";
  return null;
}

function mentionedCampaigns(
  question: string,
  campaigns: PreparedCampaignPerformanceAnalysis["campaigns"],
) {
  const normalized = normalizedText(question);
  const occurrences = campaigns.flatMap((campaign) => {
    const name = normalizedText(campaign.name);
    const matches: Array<{ campaign: (typeof campaigns)[number]; start: number; end: number }> = [];
    let start = normalized.indexOf(name);
    while (start >= 0) {
      matches.push({ campaign, start, end: start + name.length });
      start = normalized.indexOf(name, start + 1);
    }
    return matches;
  });
  const selected: typeof occurrences = [];
  for (const occurrence of occurrences.sort(
    (left, right) => left.start - right.start || right.end - right.start - (left.end - left.start),
  )) {
    if (
      selected.some(
        (existing) => occurrence.start >= existing.start && occurrence.end <= existing.end,
      )
    ) continue;
    selected.push(occurrence);
  }
  return [...new Map(selected.map(({ campaign }) => [campaign.id, campaign])).values()];
}

export function resolveDeterministicCalculation(
  question: string,
  analysis: PreparedCampaignPerformanceAnalysis,
): GroundedChatCandidate | null {
  const normalized = normalizedText(question);
  if (
    /\bwhy\b/.test(normalized) ||
    /\b(?:increase|increased|increasing|rise|rising|rose|changed|change)\b/.test(normalized)
  ) return null;

  const metric = requestedMetric(question);
  if (!metric) return null;

  const currencyCode = analysis.account.currency;
  const accountEntity: MarketingEntity = {
    type: "account",
    id: analysis.account.id,
    name: analysis.account.name,
  };
  if (analysis.campaigns.length === 0) {
    return {
      id: `calculation:${metric}:no-data`,
      response: {
        status: "insufficient_data",
        answer: `The available data does not contain campaign metrics to calculate the requested account result.`,
        supportingEvidence: [],
        limitations: ["At least one campaign metric row is required."],
        referencedEntities: [accountEntity],
        calculations: [],
      },
    };
  }
  const mentioned = mentionedCampaigns(question, analysis.campaigns);
  const asksForCampaignRanking =
    /\bwhich campaigns?\b/.test(normalized) &&
    /\b(?:lowest|highest|best|worst|top)\b/.test(normalized);
  const asksForComparison =
    mentioned.length >= 2 &&
    /\b(?:compare|compared|versus|vs|difference|higher|lower)\b/.test(normalized);

  const makeCampaignCalculation = (
    campaign: PreparedCampaignPerformanceAnalysis["campaigns"][number],
  ) =>
    chatCalculation(calculateGoogleAdsMetric(calculationMetrics(campaign.metrics), metric), {
      type: "campaign",
      id: campaign.id,
      name: campaign.name,
    });

  if (asksForCampaignRanking) {
    const calculations = analysis.campaigns.map(makeCampaignCalculation);
    const available = calculations.filter(
      (item): item is MarketingChatCalculation & { result: NonNullable<MarketingChatCalculation["result"]> } =>
        item.status === "calculated" && item.result !== null,
    );
    if (available.length === 0) {
      const reason = calculations[0]?.reason ?? "No campaign data is available.";
      return {
        id: `calculation:${metric}:campaign-ranking`,
        response: {
          status: "insufficient_data",
          answer: `The ${metric === "cpa" ? "lowest CPA" : requestedMetric(question)} cannot be determined from the available campaign data. ${reason}`,
          supportingEvidence: [],
          limitations: [reason],
          referencedEntities: calculations.map((item) => item.entity),
          calculations,
        },
      };
    }
    const wantsLowest = /\b(?:lowest|worst)\b/.test(normalized) ||
      (/\bbest\b/.test(normalized) && (metric === "cpa" || metric === "cpc"));
    const ranked = [...available].sort((left, right) =>
      wantsLowest
        ? left.result.value - right.result.value
        : right.result.value - left.result.value,
    );
    const winner = ranked[0]!;
    return {
      id: `calculation:${metric}:campaign-ranking`,
      response: {
        status: "supported",
        answer: `${winner.entity.name} has the ${wantsLowest ? "lowest" : "highest"} ${winner.label} at ${formatMetricValue(winner, currencyCode)} among campaigns with enough data to calculate it.`,
        supportingEvidence: [],
        limitations:
          available.length === calculations.length
            ? []
            : ["Campaigns with an undefined result were excluded from the ranking."],
        referencedEntities: calculations.map((item) => item.entity),
        calculations,
      },
    };
  }

  const targets = mentioned.length > 0
    ? mentioned.slice(0, asksForComparison ? 2 : 1).map(makeCampaignCalculation)
    : [chatCalculation(calculateGoogleAdsMetric(calculationMetrics(analysis.accountMetrics), metric), accountEntity)];

  if (targets.some((item) => item.status === "insufficient_data")) {
    const reasons = targets.flatMap((item) => item.reason ?? []);
    return {
      id: `calculation:${metric}:insufficient`,
      response: {
        status: "insufficient_data",
        answer: `${targets.map((item) => item.entity.name).join(" and ")} does not have sufficient data to calculate ${targets[0]!.label}. ${reasons.join(" ")}`,
        supportingEvidence: [],
        limitations: reasons,
        referencedEntities: targets.map((item) => item.entity),
        calculations: targets,
      },
    };
  }

  if (asksForComparison && targets.length === 2) {
    const [left, right] = targets;
    const leftValue = left!.result!.value;
    const rightValue = right!.result!.value;
    const relationship = leftValue === rightValue ? "the same as" : leftValue > rightValue ? "higher than" : "lower than";
    return {
      id: `calculation:${metric}:comparison`,
      response: {
        status: "supported",
        answer: `${left!.entity.name}'s ${left!.label} is ${formatMetricValue(left!, currencyCode)}, which is ${relationship} ${right!.entity.name}'s ${right!.label} of ${formatMetricValue(right!, currencyCode)}.`,
        supportingEvidence: [],
        limitations: [],
        referencedEntities: targets.map((item) => item.entity),
        calculations: targets,
      },
    };
  }

  const calculation = targets[0]!;
  return {
    id: `calculation:${metric}:${calculation.entity.id ?? "account"}`,
    response: {
      status: "supported",
      answer: `${calculation.entity.name}'s ${calculation.label} is ${formatMetricValue(calculation, currencyCode)}. The result comes directly from the loaded inputs shown below.`,
      supportingEvidence: [],
      limitations: [],
      referencedEntities: [calculation.entity],
      calculations: [calculation],
    },
  };
}

function unsupported(
  id: GroundedChatCandidate["id"],
  answer: string,
  limitation: string,
): GroundedChatCandidate {
  return {
    id,
    response: {
      status: "unsupported",
      answer,
      supportingEvidence: [],
      limitations: [limitation],
      referencedEntities: [],
    },
  };
}

export function buildGroundedChatCandidates(
  analysis: PreparedCampaignPerformanceAnalysis,
  dailyMetrics: readonly GoogleAdsDailyMetric[],
): GroundedChatCandidate[] {
  const currencyCode = analysis.account.currency;
  const campaigns = [...analysis.campaigns];
  const efficient = [...campaigns].sort(
    (left, right) =>
      left.metrics.cpa - right.metrics.cpa ||
      right.metrics.roas - left.metrics.roas,
  )[0];
  const volumeLeader = [...campaigns].sort(
    (left, right) => right.metrics.conversions - left.metrics.conversions,
  )[0];
  const wasteCampaign = analysis.candidates.find(
    (candidate) => candidate.category === "high_spend_low_conversions",
  );
  const negativeCandidate = analysis.candidates.find(
    (candidate) => candidate.category === "negative_keyword_opportunity",
  );
  const budgetCandidate = analysis.candidates.find(
    (candidate) => candidate.category === "budget_opportunity",
  );
  const geographies = [...analysis.geographies].sort(
    (left, right) =>
      right.metrics.conversionRate - left.metrics.conversionRate,
  );

  const candidates: GroundedChatCandidate[] = [
    unsupported(
      "cpa_increase",
      "The available data does not contain enough historical information to determine why CPA increased.",
      "The sample contains one seven-day period and no earlier comparison period or causal diagnostics.",
    ),
    unsupported(
      "weekly_change",
      "The available data cannot determine what changed this week because it contains only one week of daily results and no previous week for comparison.",
      `Daily coverage runs from ${dailyMetrics[0]?.date ?? "an unavailable start date"} through ${dailyMetrics.at(-1)?.date ?? "an unavailable end date"}.`,
    ),
  ];

  if (efficient && volumeLeader) {
    candidates.push({
      id: "best_campaigns",
      response: {
        status: "supported",
        answer:
          `${efficient.name} is the strongest efficiency performer: it has the lowest CPA (${currency(efficient.metrics.cpa, currencyCode)}) and highest ROAS (${efficient.metrics.roas.toFixed(2)}x). ` +
          `${volumeLeader.name} leads conversion volume with ${volumeLeader.metrics.conversions.toLocaleString("en-US")} conversions at a ${currency(volumeLeader.metrics.cpa, currencyCode)} CPA. “Best” depends on whether the goal is efficiency or total volume.`,
        supportingEvidence: [
          evidence("CPA", efficient.metrics.cpa, "currency", `${efficient.name} campaign metrics.`),
          evidence("ROAS", efficient.metrics.roas, "ratio", `${efficient.name} campaign metrics.`),
          evidence("Conversions", volumeLeader.metrics.conversions, "count", `${volumeLeader.name} campaign metrics.`),
          evidence("CPA", volumeLeader.metrics.cpa, "currency", `${volumeLeader.name} campaign metrics.`),
        ],
        limitations: [
          "The sample has no campaign goals, margin targets, or incrementality data, so efficiency and volume are reported separately.",
        ],
        referencedEntities: [
          { type: "campaign", id: efficient.id, name: efficient.name },
          { type: "campaign", id: volumeLeader.id, name: volumeLeader.name },
        ],
      },
    });
  } else {
    candidates.push(
      unsupported(
        "best_campaigns",
        "The available data does not contain enough campaign performance information to identify the best-performing campaigns.",
        "Campaign-level CPA, ROAS, and conversion totals are required to compare efficiency and volume.",
      ),
    );
  }

  if (wasteCampaign) {
    const entity = analysis.campaigns.find(
      (campaign) => campaign.id === wasteCampaign.entity.id,
    );
    if (entity) {
      candidates.push({
        id: "waste",
        response: {
          status: "supported",
          answer:
            `${entity.name} shows the clearest measured campaign-level inefficiency. It spent ${currency(entity.metrics.spend, currencyCode)} for ${entity.metrics.conversions} conversions, producing a ${currency(entity.metrics.cpa, currencyCode)} CPA versus the ${currency(analysis.accountMetrics.cpa, currencyCode)} account CPA. This supports constraining or auditing the campaign, but does not prove that every conversion or dollar was worthless.`,
          supportingEvidence: [
            evidence("Spend", entity.metrics.spend, "currency", `${entity.name} campaign metrics.`),
            evidence("Conversions", entity.metrics.conversions, "count", `${entity.name} campaign metrics.`),
            evidence("CPA", entity.metrics.cpa, "currency", `${entity.name} campaign metrics.`),
            evidence("Account CPA", analysis.accountMetrics.cpa, "currency", "Calculated across all loaded campaigns."),
          ],
          limitations: [
            "Lead quality and profit are not present, so waste is limited to measured cost and conversion inefficiency.",
          ],
          referencedEntities: [wasteCampaign.entity],
        },
      });
    }
  } else {
    candidates.push(
      unsupported(
        "waste",
        "The available data does not identify a campaign that meets the measured inefficiency criteria.",
        "A campaign-level high-spend, low-conversion candidate is required; lead quality and profit are not available.",
      ),
    );
  }

  if (geographies.length > 0) {
    const leaders = geographies.slice(0, 3);
    candidates.push({
      id: "city_conversion_rate",
      response: {
        status: "supported",
        answer: `The highest conversion rates in the loaded city data are ${leaders
          .map(
            (location) =>
              `${location.location} (${location.metrics.conversionRate.toFixed(2)}%)`,
          )
          .join(", ")}.`,
        supportingEvidence: leaders.flatMap((location) => [
          evidence("Conversion rate", location.metrics.conversionRate, "percent", `${location.location} geography metrics.`),
          evidence("Clicks", location.metrics.clicks, "count", `${location.location} geography metrics.`),
        ]),
        limitations: [
          "These rows cover only the five cities in the sample and do not establish geographic capacity or causation.",
        ],
        referencedEntities: leaders.map((location) => ({
          type: "geography" as const,
          id: location.id,
          name: location.location,
        })),
      },
    });
  } else {
    candidates.push(
      unsupported(
        "city_conversion_rate",
        "The available data does not contain city-level results to compare conversion rates.",
        "City-level clicks and conversions are required to calculate and rank conversion rates.",
      ),
    );
  }

  if (budgetCandidate) {
    const entity = analysis.campaigns.find(
      (campaign) => campaign.id === budgetCandidate.entity.id,
    );
    if (entity) {
      candidates.push({
        id: "budget_increase",
        response: {
          status: "supported",
          answer:
            `${entity.name} is the supported candidate for a controlled budget-growth test. Its ${currency(entity.metrics.cpa, currencyCode)} CPA and ${entity.metrics.roas.toFixed(2)}x ROAS outperform the account benchmarks of ${currency(analysis.accountMetrics.cpa, currencyCode)} CPA and ${analysis.accountMetrics.roas.toFixed(2)}x ROAS. Increase allocation only as a measured test while monitoring marginal CPA and ROAS.`,
          supportingEvidence: [
            evidence("CPA", entity.metrics.cpa, "currency", `${entity.name} campaign metrics.`),
            evidence("ROAS", entity.metrics.roas, "ratio", `${entity.name} campaign metrics.`),
            evidence("Conversions", entity.metrics.conversions, "count", `${entity.name} campaign metrics.`),
            evidence("Daily budget", entity.dailyBudget, "currency", `${entity.name} configured daily budget.`),
          ],
          limitations: [
            "The data has no impression-share, budget-loss, marginal-return, or market-capacity fields, so it cannot support a specific increase amount.",
          ],
          referencedEntities: [budgetCandidate.entity],
        },
      });
    }
  } else {
    candidates.push(
      unsupported(
        "budget_increase",
        "The available data does not identify a supported candidate for a budget increase.",
        "A campaign must meet the grounded budget-opportunity criteria; the data cannot support an increase from performance alone when no candidate qualifies.",
      ),
    );
  }

  if (negativeCandidate) {
    const term = analysis.searchTerms.find(
      (searchTerm) => searchTerm.id === negativeCandidate.entity.id,
    );
    if (term) {
      candidates.push({
        id: "negative_search_terms",
        response: {
          status: "supported",
          answer:
            `“${term.searchTerm}” is the only search term that meets the deterministic negative-keyword review criteria. It spent ${currency(term.metrics.spend, currencyCode)} across ${term.metrics.clicks} clicks for ${term.metrics.conversions} conversion (${currency(term.metrics.cpa, currencyCode)} CPA). Validate lead quality and intent before adding an appropriately scoped negative.`,
          supportingEvidence: [
            evidence("Spend", term.metrics.spend, "currency", `Search-term metrics in ${term.campaignName}.`),
            evidence("Clicks", term.metrics.clicks, "count", `Search-term metrics in ${term.campaignName}.`),
            evidence("Conversions", term.metrics.conversions, "count", `Search-term metrics in ${term.campaignName}.`),
            evidence("CPA", term.metrics.cpa, "currency", `Search-term metrics in ${term.campaignName}.`),
          ],
          limitations: [
            "The sample has no lead-quality or query-intent labels, so exclusion remains conditional on review.",
          ],
          referencedEntities: [negativeCandidate.entity],
        },
      });
    }
  } else {
    candidates.push(
      unsupported(
        "negative_search_terms",
        "The available data does not identify a search term that meets the negative-keyword review criteria.",
        "Search-term spend, clicks, and conversions are required, and exclusion still depends on lead-quality and intent review.",
      ),
    );
  }

  const dailyTotals = calculateGoogleAdsMetrics(
    dailyMetrics.reduce(
      (total, day) => ({
        impressions: total.impressions + day.impressions,
        clicks: total.clicks + day.clicks,
        cost: total.cost + day.cost,
        conversions: total.conversions + day.conversions,
        conversionValue: total.conversionValue + day.conversionValue,
      }),
      { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
    ),
  );

  candidates.push(
    unsupported(
      "unsupported_question",
      "The available Google Ads sample data does not contain enough evidence to answer that question safely.",
      `Available context covers campaign, geography, keyword, search-term, conversion-action, and one week of account-level daily performance (${dailyTotals.clicks.toLocaleString("en-US")} clicks total).`,
    ),
  );

  return [...candidates];
}

export function inferMarketingChatIntent(
  question: string,
  history: readonly ChatConversationMessage[] = [],
): MarketingChatIntent {
  const normalize = normalizedText;
  const normalized = normalize(question);
  const recentUserContext = history
    .filter((message) => message.role === "user")
    .slice(-2)
    .map((message) => normalize(message.content))
    .join(" ");

  const mentionsCampaign = /\bcampaigns?\b/.test(normalized);
  const mentionsGeography = /\b(?:city|cities|location|locations|geography|geographies|geo)\b/.test(normalized);
  const mentionsConversionRate = /\bconversion rates?\b|\bconvert(?:s|ed|ing)?\b/.test(normalized);
  const asksForHighest = /\b(?:best|highest|top|most)\b/.test(normalized);

  if (
    /\b(?:week|weekly)\b/.test(normalized) &&
    /\b(?:change|changed|changes|changing|different|difference)\b/.test(normalized)
  ) return "weekly_change";
  if (
    /\b(?:cpa|cost per acquisition)\b/.test(normalized) &&
    /\b(?:increase|increased|increasing|rise|rising|rose|higher|up)\b/.test(normalized)
  ) return "cpa_increase";
  const mentionsSearchTerm = /\b(?:search|query)\s+terms?\b/.test(normalized);
  const mentionsNegativeAction =
    /\b(?:negative|negatives|exclude|excluded|excluding|block|blocked)\b/.test(
      normalized,
    );
  if (
    (mentionsSearchTerm && mentionsNegativeAction) ||
    (/\bnegative keywords?\b/.test(normalized) &&
      /\b(?:which|what|add|become|make|turn|exclude|block)\b/.test(normalized))
  ) return "negative_search_terms";
  if (mentionsGeography && mentionsConversionRate && asksForHighest) {
    return "city_conversion_rate";
  }
  if (
    /\b(?:budget|spend|allocation)\b/.test(normalized) &&
    /\b(?:increase|increased|increasing|raise|raised|grow|growing|scale|more|allocate|add)\b/.test(normalized)
  ) return "budget_increase";
  if (
    mentionsCampaign &&
    /\b(?:waste|wastes|wasted|wasting|inefficient|inefficiency|poor|poorly|worst|underperform|underperforming|underperformer|underperformers)\b/.test(normalized)
  ) return "waste";
  if (
    mentionsCampaign &&
    /\b(?:best|top|strongest)\b/.test(normalized)
  ) return "best_campaigns";
  if (
    /\b(?:their|those|them)\b/.test(normalized) &&
    /\b(?:cpa|cost per acquisition)\b/.test(normalized) &&
    /\bcampaigns?\b/.test(recentUserContext) &&
    /\b(?:best|top|strongest)\b/.test(recentUserContext)
  ) return "best_campaigns";

  return "unknown";
}

export function selectGroundedChatCandidates(
  question: string,
  history: readonly ChatConversationMessage[],
  candidates: readonly GroundedChatCandidate[],
): GroundedChatCandidate[] {
  const intent = inferMarketingChatIntent(question, history);
  if (intent !== "unknown") {
    const match = candidates.find((candidate) => candidate.id === intent);
    if (match) return [match];
  }

  return [...candidates];
}

export type MarketingChatValidationResult =
  | { success: true; response: MarketingChatResponse }
  | { success: false; error: string };

export function validateGroundedChatResponse(
  value: unknown,
  allowedCandidates: readonly GroundedChatCandidate[],
): MarketingChatValidationResult {
  const parsed = marketingChatResponseSchema.safeParse(value);
  if (!parsed.success) {
    return {
      success: false,
      error: "The AI response did not match the required chat response format.",
    };
  }

  const serialized = JSON.stringify(parsed.data);
  const match = allowedCandidates.find(
    (candidate) => JSON.stringify(candidate.response) === serialized,
  );

  if (!match) {
    return {
      success: false,
      error: "The AI response changed or invented unsupported marketing information.",
    };
  }

  return { success: true, response: match.response };
}

export function buildMarketingChatPrompt(
  request: MarketingChatRequest,
  candidates: readonly GroundedChatCandidate[],
): string {
  return [
    `Current question: ${JSON.stringify(request.question)}`,
    `Recent conversation: ${JSON.stringify(request.history)}`,
    "Allowed grounded answer packets:",
    JSON.stringify(candidates),
    "Return exactly one packet's response object. Copy it without changing, adding, calculating, or explaining anything.",
  ].join("\n");
}
