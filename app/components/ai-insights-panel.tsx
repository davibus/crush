import {
  buildAiInsightSections,
  formatConfidence,
  formatEvidenceValue,
} from "@/lib/ai-insight-presentation";
import type { MarketingInsight } from "@/lib/marketing-insights";

type AiInsightsPanelProps = {
  currency: string;
  insights: unknown;
  isLoading?: boolean;
  unavailableMessage?: string;
};

const severityStyles: Record<MarketingInsight["severity"], string> = {
  critical: "border-red-200 bg-red-50 text-red-800",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  medium: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function entityTypeLabel(type: MarketingInsight["affectedEntity"]["type"]) {
  return type.replaceAll("_", " ");
}

function InsightCard({
  insight,
  currency,
}: {
  insight: MarketingInsight;
  currency: string;
}) {
  const confidence = Math.round(insight.confidenceScore * 100);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/30">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${severityStyles[insight.severity]}`}
        >
          {insight.severity} severity
        </span>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium capitalize text-zinc-700">
          {entityTypeLabel(insight.affectedEntity.type)}
        </span>
      </div>

      <h4 className="mt-3 text-base font-semibold leading-6 text-zinc-950">
        {insight.problemOpportunity}
      </h4>
      <p className="mt-1 text-sm font-medium text-zinc-700">
        Affects: {insight.affectedEntity.name}
      </p>

      <div className="mt-4 rounded-lg bg-zinc-50 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-zinc-700">Confidence</span>
          <span className="font-semibold tabular-nums text-zinc-900">
            {formatConfidence(insight.confidenceScore)}
          </span>
        </div>
        <div
          aria-label={`${formatConfidence(insight.confidenceScore)} confidence`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={confidence}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200"
          role="meter"
        >
          <div
            className="h-full rounded-full bg-blue-600"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>

      <div className="mt-4">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Evidence
        </h5>
        <dl className="mt-2 grid gap-2">
          {insight.evidence.map((item, index) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
              key={`${item.metric}-${item.context}-${index}`}
            >
              <dt className="min-w-0 break-words text-sm font-medium text-zinc-800">
                {item.metric}
              </dt>
              <dd className="text-right text-sm font-semibold tabular-nums text-zinc-950">
                {formatEvidenceValue(item, currency)}
              </dd>
              <dd className="col-span-2 break-words text-xs leading-5 text-zinc-600">
                {item.context}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <dl className="mt-4 grid gap-3 text-sm leading-6">
        <div>
          <dt className="font-semibold text-zinc-900">Recommended action</dt>
          <dd className="mt-0.5 text-zinc-600">{insight.recommendedAction}</dd>
        </div>
        <div>
          <dt className="font-semibold text-zinc-900">Expected impact</dt>
          <dd className="mt-0.5 text-zinc-600">{insight.expectedImpact}</dd>
        </div>
      </dl>
    </article>
  );
}

function LoadingCards() {
  return (
    <div className="grid gap-3" role="status">
      <div className="h-32 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none" />
      <span className="sr-only">Loading AI insights</span>
    </div>
  );
}

export default function AiInsightsPanel({
  currency,
  insights,
  isLoading = false,
  unavailableMessage,
}: AiInsightsPanelProps) {
  const sections = buildAiInsightSections(insights);

  return (
    <div
      aria-busy={isLoading}
      aria-live="polite"
      className="grid grid-cols-1 gap-4 xl:grid-cols-2"
    >
      {sections.map((section) => (
        <section
          aria-labelledby={`ai-insight-${section.id}-heading`}
          className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:p-5"
          key={section.id}
        >
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <h3
                className="font-semibold text-zinc-950"
                id={`ai-insight-${section.id}-heading`}
              >
                {section.title}
              </h3>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium tabular-nums text-zinc-600">
                {section.insights.length}
              </span>
            </div>
            <p className="mt-1 text-sm leading-5 text-zinc-500">
              {section.description}
            </p>
          </div>

          {isLoading ? (
            <LoadingCards />
          ) : section.insights.length > 0 ? (
            <div className="grid gap-3">
              {section.insights.map((insight, index) => (
                <InsightCard
                  currency={currency}
                  insight={insight}
                  key={`${insight.affectedEntity.type}-${insight.affectedEntity.id ?? insight.affectedEntity.name}-${index}`}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm leading-6 text-zinc-500">
              {unavailableMessage ?? section.emptyMessage}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
