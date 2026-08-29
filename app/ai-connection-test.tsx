"use client";

import { FormEvent, useState } from "react";
import type { MarketingInsight } from "@/lib/marketing-insights";

type AiResponse = {
  insights?: MarketingInsight[];
  error?: string;
};

export default function AiConnectionTest() {
  const [prompt, setPrompt] = useState(
    "Briefly summarize this account's performance and mention one notable campaign difference.",
  );
  const [insights, setInsights] = useState<MarketingInsight[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInsights([]);
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const result = (await response.json()) as AiResponse;

      if (!response.ok || !Array.isArray(result.insights)) {
        setError(result.error ?? "The AI request failed. Please try again.");
        return;
      }

      setInsights(result.insights);
    } catch {
      setError("Could not reach the Crush AI endpoint. Is the local server running?");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-semibold">AI connection test</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Send a small account summary and two campaign samples to the server-side
        LLM connection.
      </p>

      <form className="mt-4" onSubmit={handleSubmit}>
        <label className="text-sm font-medium" htmlFor="ai-prompt">
          Test prompt
        </label>
        <textarea
          className="mt-2 block min-h-24 w-full rounded-lg border border-zinc-300 p-3 text-sm outline-none focus:border-zinc-500"
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
          {isLoading ? "Connecting..." : "Test AI connection"}
        </button>
      </form>

      {insights.length > 0 ? (
        <div aria-live="polite" className="mt-4 grid gap-4">
          {insights.map((insight, index) => (
            <article
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm"
              key={`${insight.affectedEntity.type}-${insight.affectedEntity.id ?? insight.affectedEntity.name}-${index}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs font-semibold uppercase text-white">
                  {insight.severity}
                </span>
                <span className="font-medium">
                  {insight.affectedEntity.name}
                </span>
                <span className="text-zinc-500">
                  {Math.round(insight.confidenceScore * 100)}% confidence
                </span>
              </div>
              <h3 className="mt-3 font-semibold">
                {insight.problemOpportunity}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600">
                {insight.evidence.map((item, evidenceIndex) => (
                  <li key={`${item.metric}-${evidenceIndex}`}>
                    {item.metric}: {item.value} {item.unit} — {item.context}
                  </li>
                ))}
              </ul>
              <p className="mt-3">
                <span className="font-medium">Recommended action:</span>{" "}
                {insight.recommendedAction}
              </p>
              <p className="mt-1">
                <span className="font-medium">Expected impact:</span>{" "}
                {insight.expectedImpact}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      {error ? (
        <p aria-live="polite" className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
