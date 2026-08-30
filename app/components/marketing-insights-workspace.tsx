"use client";

import { FormEvent, useState } from "react";

import AiInsightsPanel from "@/app/components/ai-insights-panel";
import {
  validateMarketingInsights,
  type MarketingInsight,
} from "@/lib/marketing-insights";

type AiResponse = {
  insights?: MarketingInsight[];
  status?: "grounded_insights" | "insufficient_data";
  reason?: string;
  error?: string;
  analysis?: {
    candidateCount: number;
    candidateCategories: string[];
    unavailableDimensions: string[];
  };
};

export default function MarketingInsightsWorkspace({
  currency,
}: {
  currency: string;
}) {
  const [prompt, setPrompt] = useState(
    "Analyze this account and recommend the most important campaign optimizations.",
  );
  const [insights, setInsights] = useState<MarketingInsight[]>([]);
  const [analysis, setAnalysis] = useState<AiResponse["analysis"]>();
  const [insufficientDataReason, setInsufficientDataReason] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInsights([]);
    setAnalysis(undefined);
    setInsufficientDataReason("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const result = (await response.json()) as AiResponse;

      if (!response.ok) {
        setError(result.error ?? "The AI request failed. Please try again.");
        return;
      }

      const validation = validateMarketingInsights({
        insights: result.insights,
      });
      if (!validation.success) {
        setError(
          "The AI returned an analysis that could not be displayed safely. Please try again.",
        );
        return;
      }

      setInsights(validation.insights);
      setAnalysis(result.analysis);
      if (result.status === "insufficient_data") {
        setInsufficientDataReason(
          result.reason ?? "There is insufficient data for a supported insight.",
        );
      }
    } catch {
      setError("Could not reach the Crush AI endpoint. Is the local server running?");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section aria-labelledby="ai-insights-heading" className="mt-8">
      <div className="mb-4">
        <h2
          className="text-lg font-semibold text-zinc-950"
          id="ai-insights-heading"
        >
          AI insights
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Evidence-checked findings and recommendations from the structured AI
          campaign-performance analyzer
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/40">
        <h3 className="font-semibold text-zinc-950">Run a supported analysis</h3>
        <p className="mt-1 text-sm leading-5 text-zinc-600">
          Analyze campaign, geography, keyword, search-term, and
          conversion-action performance using pre-calculated metrics.
        </p>
        <form className="mt-4" onSubmit={handleSubmit}>
          <label className="text-sm font-medium" htmlFor="ai-prompt">
            Analysis request
          </label>
          <textarea
            className="mt-2 block min-h-24 w-full rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            id="ai-prompt"
            maxLength={500}
            onChange={(event) => setPrompt(event.target.value)}
            required
            value={prompt}
          />
          <button
            className="mt-3 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || !prompt.trim()}
            type="submit"
          >
            {isLoading ? "Analyzing..." : "Analyze sample account"}
          </button>
        </form>
      </div>

      {analysis ? (
        <div
          aria-live="polite"
          className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"
        >
          <p>
            Evaluated {analysis.candidateCount} supported candidates across{" "}
            {analysis.candidateCategories.length} detection categories.
          </p>
          {analysis.unavailableDimensions.length > 0 ? (
            <p className="mt-1 text-blue-800">
              No sample data: {analysis.unavailableDimensions.join(", ")}.
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p
          aria-live="polite"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <AiInsightsPanel
        currency={currency}
        insights={insights}
        isLoading={isLoading}
        unavailableMessage={
          error
            ? "Insights are unavailable because the analysis could not be completed."
            : analysis && insights.length === 0
              ? insufficientDataReason ||
                "No evidence-backed recommendations were returned for this request."
              : !analysis
                ? "Run an analysis to populate this category."
                : undefined
        }
      />
    </section>
  );
}
