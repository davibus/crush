"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

import {
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_CHAT_QUESTION_LENGTH,
  marketingChatResponseSchema,
  type MarketingChatResponse,
} from "@/lib/marketing-data-chat";
import type { MarketingEvidence } from "@/lib/marketing-insights";
import type { SpecialistSelectionId } from "@/lib/specialist-agents";

const STARTER_QUESTIONS = [
  "Why did CPA increase?",
  "Why did sessions decline compared with the previous period?",
  "How can we improve the landing-page conversion rate?",
  "Why did organic traffic fall?",
  "What are the top three marketing priorities for next week?",
] as const;

const SPECIALIST_OPTIONS: ReadonlyArray<{
  id: SpecialistSelectionId;
  label: string;
}> = [
  { id: "auto", label: "Auto" },
  { id: "ppc-analyst", label: "PPC Analyst" },
  { id: "analytics-analyst", label: "Analytics Analyst" },
  { id: "cro-analyst", label: "CRO Analyst" },
  { id: "seo-analyst", label: "SEO Analyst" },
  { id: "marketing-strategist", label: "Marketing Strategist / CMO" },
];

const MAX_VISIBLE_MESSAGES = 10;

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: MarketingChatResponse;
};

function messageId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function formatEvidence(item: MarketingEvidence, currencyCode: string): string {
  return formatValue(item.value, item.unit, currencyCode);
}

function formatValue(
  value: number,
  unit: "currency" | "percent" | "count" | "ratio",
  currencyCode: string,
): string {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (unit === "percent") return `${value.toFixed(2)}%`;
  if (unit === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function AssistantMessage({
  response,
  currencyCode,
}: {
  response: MarketingChatResponse;
  currencyCode: string;
}) {
  return (
    <div>
      {response.specialist ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-zinc-900 px-2.5 py-1 font-semibold text-white">
            {response.specialist.name}
          </span>
          {response.workflow === "specialists_to_strategist" ? (
            <span className="text-zinc-500">
              Synthesized from {response.contributors?.map((agent) => agent.name).join(", ")}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-800">
        {response.answer}
      </p>

      {response.specialistAnalysis?.recommendations.length ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Recommended actions
          </p>
          <ol className="mt-2 grid gap-2">
            {response.specialistAnalysis.recommendations.map((recommendation, index) => (
              <li className="rounded-lg bg-white p-2.5 text-xs leading-5 text-zinc-700 ring-1 ring-zinc-200" key={`${recommendation.action}-${index}`}>
                <span className="mr-2 font-semibold text-zinc-950">{index + 1}.</span>
                {recommendation.action}
                {recommendation.hypothesisId ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                    Hypothesis-led
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {response.calculations?.length ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Calculation
          </p>
          <div className="mt-2 grid gap-2">
            {response.calculations.map((calculation, index) => (
              <div
                className="rounded-lg bg-white p-3 ring-1 ring-zinc-200"
                key={`${calculation.entity.id}-${calculation.metric}-${index}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-600">
                    {calculation.entity.name} · {calculation.label}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-zinc-950">
                    {calculation.result
                      ? formatValue(
                          calculation.result.value,
                          calculation.result.unit,
                          currencyCode,
                        )
                      : "Unavailable"}
                  </p>
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                  {calculation.inputs.map((input) => (
                    <div className="flex gap-1" key={input.label}>
                      <dt>{input.label}:</dt>
                      <dd className="font-medium tabular-nums text-zinc-800">
                        {formatValue(input.value, input.unit, currencyCode)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-zinc-500">
                  Formula: {calculation.formula}
                </p>
                {calculation.reason ? (
                  <p className="mt-1 text-xs text-amber-800">
                    {calculation.reason}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {response.supportingEvidence.length > 0 ? (
        <div className="mt-3 border-t border-zinc-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Supporting evidence
          </p>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {response.supportingEvidence.map((item, index) => (
              <div
                className="rounded-lg bg-white p-2.5 ring-1 ring-zinc-200"
                key={`${item.metric}-${item.context}-${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-xs font-medium text-zinc-600">
                    {item.metric}
                  </dt>
                  <dd className="text-sm font-semibold tabular-nums text-zinc-950">
                    {formatEvidence(item, currencyCode)}
                  </dd>
                </div>
                <dd className="mt-1 text-xs leading-4 text-zinc-500">
                  {item.context}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {response.limitations.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <span className="font-semibold">Data limitation: </span>
          {response.limitations.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

export default function MarketingDataChat({
  currency,
  dataSourceLabel = "loaded Google Ads data",
}: {
  currency: string;
  dataSourceLabel?: string;
}) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [specialistId, setSpecialistId] = useState<SpecialistSelectionId>("auto");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  async function submitQuestion(rawQuestion: string) {
    const submittedQuestion = rawQuestion.trim();
    if (!submittedQuestion || isLoading) return;

    const userMessage: DisplayMessage = {
      id: messageId(),
      role: "user",
      content: submittedQuestion,
    };
    const history = messages.slice(-MAX_CHAT_HISTORY_MESSAGES).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((current) =>
      [...current, userMessage].slice(-MAX_VISIBLE_MESSAGES),
    );
    setQuestion("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: submittedQuestion, history, specialistId }),
      });
      const result = (await response.json()) as unknown;

      if (!response.ok) {
        const serverError =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The question could not be analyzed. Please try again.";
        setError(serverError);
        return;
      }

      const validation = marketingChatResponseSchema.safeParse(result);
      if (!validation.success) {
        setError(
          "The response could not be displayed because it did not pass the required safety format.",
        );
        return;
      }

      const assistantMessage: DisplayMessage = {
        id: messageId(),
        role: "assistant",
        content: validation.data.answer,
        response: validation.data,
      };
      setMessages((current) =>
        [...current, assistantMessage].slice(-MAX_VISIBLE_MESSAGES),
      );
    } catch {
      setError("Could not reach the marketing data service. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion(question);
    }
  }

  return (
    <section
      aria-labelledby="marketing-data-chat-heading"
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/40"
    >
      <header className="border-b border-zinc-200 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-lg text-white"
          >
            ✦
          </span>
          <div>
            <h2
              className="text-lg font-semibold text-zinc-950"
              id="marketing-data-chat-heading"
            >
              Ask Your Marketing Data
            </h2>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              Ask performance questions grounded in {dataSourceLabel.toLowerCase()}.
              Answers include calculated evidence and call out missing data.
            </p>
          </div>
        </div>
      </header>

      <div
        aria-busy={isLoading}
        aria-live="polite"
        className="max-h-[34rem] min-h-80 overflow-y-auto bg-zinc-50/70 px-4 py-5 sm:px-6"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-72 max-w-3xl flex-col items-center justify-center text-center">
            <h3 className="font-semibold text-zinc-900">
              What would you like to understand?
            </h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-500">
              Start with a suggested question or ask about campaigns,
              locations, budgets, and search terms in your own words.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {STARTER_QUESTIONS.map((starter) => (
                <button
                  className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  key={starter}
                  onClick={() => void submitQuestion(starter)}
                  type="button"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl gap-4">
            {messages.map((message) => (
              <article
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 px-4 py-3 text-white"
                    : "mr-auto max-w-[95%] rounded-2xl rounded-bl-md border border-zinc-200 bg-zinc-100 px-4 py-3"
                }
                key={message.id}
              >
                <p className="mb-1 text-xs font-semibold opacity-65">
                  {message.role === "user" ? "You" : "Crush"}
                </p>
                {message.response ? (
                  <AssistantMessage
                    currencyCode={currency}
                    response={message.response}
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {message.content}
                  </p>
                )}
              </article>
            ))}

            {isLoading ? (
              <div className="mr-auto flex items-center gap-2 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600" role="status">
                <span className="flex gap-1" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500 [animation-delay:300ms] motion-reduce:animate-none" />
                </span>
                Analyzing your marketing data...
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <p
            className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div ref={conversationEndRef} />
      </div>

      <form className="border-t border-zinc-200 p-4 sm:p-5" onSubmit={handleSubmit}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-semibold text-zinc-600" htmlFor="marketing-specialist">
            Specialist
          </label>
          <select
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-800 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100"
            disabled={isLoading}
            id="marketing-specialist"
            onChange={(event) => setSpecialistId(event.target.value as SpecialistSelectionId)}
            value={specialistId}
          >
            {SPECIALIST_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
        <label className="sr-only" htmlFor="marketing-question">
          Ask a question about your marketing data
        </label>
        <div className="flex items-end gap-3">
          <textarea
            className="max-h-36 min-h-12 flex-1 resize-y rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100"
            disabled={isLoading}
            id="marketing-question"
            maxLength={MAX_CHAT_QUESTION_LENGTH}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about campaign performance..."
            rows={1}
            value={question}
          />
          <button
            className="min-h-12 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading || !question.trim()}
            type="submit"
          >
            {isLoading ? "Working..." : "Send"}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Press Enter to send · Shift+Enter for a new line · Recent context is
          limited to {MAX_CHAT_HISTORY_MESSAGES} messages
        </p>
      </form>
    </section>
  );
}
