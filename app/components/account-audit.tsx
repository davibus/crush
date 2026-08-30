import type {
  AccountAuditResult,
  AccountAuditSeverity,
} from "@/lib/account-audit";
import type { MarketingEvidence } from "@/lib/marketing-insights";

const severityStyles: Record<AccountAuditSeverity, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

function formatEvidence(
  evidence: MarketingEvidence,
  currency: string,
): string {
  switch (evidence.unit) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(evidence.value);
    case "percent":
      return `${evidence.value.toFixed(2)}%`;
    case "ratio":
      return `${evidence.value.toFixed(2)}x`;
    case "count":
      return evidence.value.toLocaleString("en-US", {
        maximumFractionDigits: 2,
      });
  }
}

export default function AccountAudit({ audit }: { audit: AccountAuditResult }) {
  return (
    <section aria-labelledby="account-audit-heading" className="mt-8">
      <div className="mb-4">
        <h2
          className="text-lg font-semibold text-zinc-950"
          id="account-audit-heading"
        >
          Automated account audit
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {audit.summary.totalFindings} deterministic findings across all nine
          audit categories. Rules use only the structured data shown in this
          account.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {audit.categories.map((section) => (
          <article
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-200/30"
            key={section.category}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-zinc-950">{section.label}</h3>
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
                {section.status === "analyzed"
                  ? `${section.findings.length} findings`
                  : section.status.replace("_", " ")}
              </span>
            </div>

            {section.reason ? (
              <p className="mt-3 text-sm leading-5 text-zinc-500">
                {section.reason}
              </p>
            ) : section.findings.length === 0 ? (
              <p className="mt-3 text-sm leading-5 text-zinc-500">
                No supported finding met the configured thresholds.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {section.findings.map((finding) => (
                  <div className="border-t border-zinc-100 pt-4" key={finding.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${severityStyles[finding.severity]}`}
                      >
                        {finding.severity}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {finding.affectedEntity.name}
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-semibold text-zinc-900">
                      {finding.title}
                    </h4>
                    <p className="mt-1 text-sm leading-5 text-zinc-600">
                      {finding.description}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2">
                      {finding.evidence.slice(0, 4).map((evidence) => (
                        <div key={`${evidence.metric}:${evidence.context}`}>
                          <dt className="text-xs text-zinc-500">
                            {evidence.metric}
                          </dt>
                          <dd className="text-sm font-medium text-zinc-900">
                            {formatEvidence(evidence, audit.account.currency)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-sm leading-5 text-zinc-700">
                      <span className="font-medium">Recommendation:</span>{" "}
                      {finding.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
