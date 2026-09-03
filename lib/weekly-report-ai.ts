import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { extractOpenAIStructuredResponse } from "./openai-structured-response.ts";
import type { WeeklyReportAiResult, WeeklyReportDraft } from "./weekly-report.ts";

const MODEL = "gpt-4o-mini";
const selectionSchema = z.object({
  selectedCandidateIds: z.array(z.string().min(1)).max(8),
}).strict();

function fallback(detail: string, warning?: string): WeeklyReportAiResult {
  return { status: "deterministic_fallback", detail, selectedCandidateIds: [], ...(warning ? { warning } : {}) };
}

export async function enrichWeeklyReport(
  draft: WeeklyReportDraft,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<WeeklyReportAiResult> {
  const candidates = Object.values(draft.candidates).flat();
  if (candidates.length === 0) {
    return {
      status: "not_needed",
      detail: "No comparable KPI movement was available for AI prioritization; the deterministic report remains complete.",
      selectedCandidateIds: [],
    };
  }
  if (!environment.OPENAI_API_KEY) {
    return fallback(
      "AI is not configured. Deterministic sections and evidence are shown in their calculated priority order.",
      "OpenAI is not configured; the Weekly Marketing Report used its deterministic grounded report instead.",
    );
  }

  try {
    const response = await new OpenAI({ apiKey: environment.OPENAI_API_KEY }).responses.parse({
      model: MODEL,
      instructions: [
        "Prioritize the most decision-useful supplied weekly marketing report candidates.",
        "Return only candidate IDs copied exactly from allowedCandidates.",
        "Do not create or revise text, metrics, percentages, campaign names, evidence, trends, causes, or recommendations.",
        "Google Ads and GA4 use distinct measurement systems and must not be treated as interchangeable.",
      ].join(" "),
      input: JSON.stringify({
        reportingPeriod: draft.reportingPeriod,
        comparisonPeriod: draft.comparisonPeriod,
        dataSourceStatus: draft.dataSourceStatus,
        currentSummary: draft.currentSummary,
        previousSummary: draft.previousSummary,
        calculatedKpiChanges: draft.kpiChanges,
        supportingEvidence: draft.supportingEvidence,
        allowedCandidates: candidates,
      }),
      text: {
        format: zodTextFormat(selectionSchema, "weekly_report_selection", {
          description: "Up to eight IDs copied from the supplied weekly report candidates.",
        }),
      },
      max_output_tokens: 500,
      store: false,
    });
    const extracted = extractOpenAIStructuredResponse(response);
    if (!extracted.success) throw new Error(`Structured response ${extracted.reason}.`);
    const selection = selectionSchema.parse(extracted.value);
    const allowedIds = new Set(candidates.map((candidate) => candidate.id));
    const unique = [...new Set(selection.selectedCandidateIds)];
    if (unique.length !== selection.selectedCandidateIds.length || unique.some((id) => !allowedIds.has(id))) {
      throw new Error("AI selected duplicate or unsupported candidate IDs.");
    }
    return {
      status: "enriched",
      detail: `AI prioritized ${unique.length} of ${candidates.length} grounded deterministic report candidates; it did not author metrics or evidence.`,
      selectedCandidateIds: unique,
    };
  } catch (error) {
    console.error("Weekly report AI prioritization failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown failure",
    });
    return fallback(
      "AI prioritization was unavailable. Deterministic sections and evidence are shown in their calculated priority order.",
      "AI enrichment was unavailable; the Weekly Marketing Report kept its deterministic grounded report.",
    );
  }
}
