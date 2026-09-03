import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { extractOpenAIStructuredResponse } from "./openai-structured-response.ts";
import type {
  DailyAiFindings,
  DailyAnalysisAiInput,
  DailyFinding,
  MaterialChange,
} from "./daily-analysis.ts";

const MODEL = "gpt-4o-mini";
const selectionSchema = z
  .object({
    selectedCandidateIds: z.array(z.string().min(1)).max(5),
  })
  .strict();

type FindingCandidate = DailyFinding & { id: string };

function formattedValue(change: MaterialChange, value: number | null): string {
  if (value == null) return "unavailable";
  if (change.unit === "currency") return `$${value.toFixed(2)}`;
  if (change.unit === "percent") return `${value.toFixed(2)}%`;
  if (change.unit === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function recommendation(change: MaterialChange): string {
  const period = change.period === "yesterday" ? "daily" : "seven-day";
  if (["cpa", "cpc"].includes(change.metric)) {
    return `Review the ${period} campaign mix and bid or budget changes associated with this ${change.label.toLowerCase()} movement before making an optimization decision.`;
  }
  if (["roas", "conversionRate", "conversions", "keyEvents", "revenue", "conversionValue"].includes(change.metric)) {
    return `Review the ${period} campaign, traffic-source, and conversion breakdowns available in the connected platforms to identify where this ${change.label.toLowerCase()} movement is concentrated.`;
  }
  return `Review the ${period} campaign and traffic-source breakdowns to identify where this ${change.label.toLowerCase()} movement is concentrated before changing spend.`;
}

export function buildDailyFindingCandidates(
  changes: MaterialChange[],
): FindingCandidate[] {
  return changes.map((change, index) => {
    const id = `${change.period}:${change.source}:${change.metric}:${index}`;
    const periodLabel = change.period === "yesterday" ? "yesterday versus the preceding day" : "the rolling 7 days versus the preceding 7 days";
    const percentage = change.percentageChange == null
      ? "from a zero baseline"
      : `by ${Math.abs(change.percentageChange).toFixed(1)}%`;
    return {
      id,
      materialChangeId: id,
      observedFact: `${change.label} moved ${change.direction} ${percentage}, from ${formattedValue(change, change.previousValue)} to ${formattedValue(change, change.currentValue)}, for ${periodLabel}.`,
      interpretation: `This is a material ${change.source === "google_ads" ? "Google Ads" : "GA4"} movement under the configured thresholds. The supplied period data establishes the change, but does not establish its cause.`,
      recommendation: recommendation(change),
    };
  });
}

function fallback(
  candidates: FindingCandidate[],
  summary: string,
): DailyAiFindings {
  return {
    status: "deterministic_fallback",
    summary,
    findings: candidates.slice(0, 5).map((candidate) => ({
      materialChangeId: candidate.materialChangeId,
      observedFact: candidate.observedFact,
      interpretation: candidate.interpretation,
      recommendation: candidate.recommendation,
    })),
  };
}

export async function analyzeDailyMarketingChanges(
  input: DailyAnalysisAiInput,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ findings: DailyAiFindings; warning?: string }> {
  const hasAnyData = Boolean(
    input.yesterdaySummary.googleAds || input.yesterdaySummary.ga4,
  );
  if (!hasAnyData) {
    return {
      findings: {
        status: "unavailable",
        summary: "No live marketing source was available, so performance stability could not be assessed.",
        findings: [],
      },
    };
  }
  if (input.materialChanges.length === 0) {
    return {
      findings: {
        status: "stable",
        summary: "Performance was relatively stable; no change met both the configured relative and absolute materiality thresholds.",
        findings: [],
      },
    };
  }

  const candidates = buildDailyFindingCandidates(input.materialChanges);
  if (!environment.OPENAI_API_KEY) {
    return {
      findings: fallback(
        candidates,
        `${input.materialChanges.length} material change${input.materialChanges.length === 1 ? " was" : "s were"} detected. Deterministic findings are shown because AI is not configured.`,
      ),
      warning: "OpenAI is not configured; Daily Analysis used its deterministic grounded findings instead.",
    };
  }

  try {
    const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: MODEL,
      instructions: [
        "Select the most useful daily marketing finding candidates.",
        "The supplied metrics, comparisons, material changes, contexts, and candidate text are the only source of truth.",
        "Return only candidate IDs. Do not create, revise, combine, calculate, explain, or infer any metric, cause, finding, or recommendation.",
        "A change proves only its supplied direction and magnitude; it never proves a cause.",
      ].join(" "),
      input: JSON.stringify({
        dateRanges: input.ranges,
        currentPeriods: {
          yesterday: input.yesterdaySummary,
          rolling7Day: input.rolling7DaySummary,
        },
        previousPeriods: {
          previousDay: input.previousDaySummary,
          previous7Day: input.previous7DaySummary,
        },
        calculatedChanges: {
          yesterday: input.yesterdayComparison,
          rolling7Day: input.rolling7DayComparison,
        },
        materialChanges: input.materialChanges,
        googleAdsContext: input.context.googleAds ?? null,
        ga4Context: input.context.ga4 ?? null,
        allowedCandidates: candidates,
      }),
      text: {
        format: zodTextFormat(selectionSchema, "daily_analysis_selection", {
          description: "Up to five IDs copied from the supplied allowed candidates.",
        }),
      },
      max_output_tokens: 500,
      store: false,
    });
    const extracted = extractOpenAIStructuredResponse(response);
    if (!extracted.success) throw new Error(`Structured response ${extracted.reason}.`);
    const selection = selectionSchema.parse(extracted.value);
    const allowed = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const uniqueIds = [...new Set(selection.selectedCandidateIds)];
    if (uniqueIds.length !== selection.selectedCandidateIds.length) {
      throw new Error("AI selected a duplicate candidate.");
    }
    const selected = uniqueIds.map((id) => allowed.get(id));
    if (selected.some((candidate) => !candidate)) {
      throw new Error("AI selected an unsupported candidate.");
    }
    const findings = selected
      .filter((candidate): candidate is FindingCandidate => Boolean(candidate))
      .map((candidate) => ({
        materialChangeId: candidate.materialChangeId,
        observedFact: candidate.observedFact,
        interpretation: candidate.interpretation,
        recommendation: candidate.recommendation,
      }));
    return {
      findings: {
        status: "grounded_ai",
        summary: findings.length > 0
          ? `AI prioritized ${findings.length} of ${candidates.length} deterministic material-change findings.`
          : "AI found no supplied material-change candidate useful enough to prioritize.",
        findings,
      },
    };
  } catch (error) {
    console.error("Daily Analysis AI selection failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return {
      findings: fallback(
        candidates,
        `${input.materialChanges.length} material change${input.materialChanges.length === 1 ? " was" : "s were"} detected. Deterministic findings are shown because AI selection was unavailable.`,
      ),
      warning: "AI selection was unavailable; Daily Analysis kept the validated deterministic findings instead.",
    };
  }
}
