"use client";

import { useState } from "react";

import { negativeKeywordProposalResultSchema, type NegativeKeywordProposalResult } from "@/lib/negative-keyword-proposals";

const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

export default function NegativeKeywordProposalsPanel({ clientId, currency }: { clientId: string; currency: string }) {
  const [result, setResult] = useState<NegativeKeywordProposalResult>();
  const [reviewStates, setReviewStates] = useState<Record<string, "accepted_for_future_review" | "rejected">>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/negative-keyword-proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId }) });
      const body = await response.json() as unknown;
      if (!response.ok) { setError(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Negative-keyword proposals could not be generated."); return; }
      const parsed = body && typeof body === "object" && "result" in body ? negativeKeywordProposalResultSchema.safeParse(body.result) : undefined;
      if (!parsed?.success) { setError("The proposal response did not pass client-side schema validation."); return; }
      setResult(parsed.data); setReviewStates({});
    } catch { setError("Could not reach the negative-keyword proposal endpoint."); } finally { setLoading(false); }
  }

  return <section aria-labelledby="negative-keyword-heading" className="mb-8 rounded-3xl border border-amber-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950" id="negative-keyword-heading">Negative-keyword review proposals</h3><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Recommendation only</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Generate conservative, evidence-linked proposals for marketer review. No Google Ads changes have been made, and this feature cannot add negatives to an account.</p></div>
      <button className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={loading} onClick={generate} type="button">{loading ? "Analyzing…" : result ? "Regenerate proposals" : "Generate proposals"}</button>
    </div>
    {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {result ? <div aria-live="polite" className="mt-6 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporting period</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.analysisPeriod.label}</p><p className="mt-1 text-xs text-slate-600">{result.analysisPeriod.completionStatus.replaceAll("_", " ")}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source evidence</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.source.searchTermRowCount} search-term rows</p><p className="mt-1 text-xs text-slate-600">{result.source.label}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Optional AI</p><p className="mt-1 text-sm font-semibold text-slate-900">{result.ai.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-600">{result.ai.detail}</p></div></div>
      {result.status !== "ready" ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-semibold text-slate-900">{result.status === "insufficient_evidence" ? "Insufficient search-term evidence" : "No qualifying candidates"}</p><p className="mt-1 text-sm text-slate-600">Crush did not fabricate proposals. Protected terms, converted traffic, conflicts, duplicates, and rows below the materiality floor are withheld.</p></div> : null}
      {result.proposals.map((proposal) => { const reviewState = reviewStates[proposal.id]; return <article className="rounded-2xl border border-slate-200 p-4 sm:p-5" key={proposal.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Review proposal · {proposal.strength} deterministic evidence</p><h4 className="mt-1 text-xl font-semibold text-slate-950">[{proposal.proposedNegativeKeyword}] <span className="text-sm font-semibold text-slate-500">{proposal.matchType} match</span></h4><p className="mt-1 text-sm text-slate-600">Source search term: “{proposal.sourceSearchTerm.text}”</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{reviewState ? reviewState.replaceAll("_", " ") : "proposed"}</span></div>
        <p className="mt-4 text-sm leading-6 text-slate-700">{proposal.rationale}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5"><div><dt className="text-xs text-slate-500">Historical spend</dt><dd className="font-semibold tabular-nums text-slate-950">{money(proposal.historicalAffectedTraffic.spend, currency)}</dd></div><div><dt className="text-xs text-slate-500">Clicks</dt><dd className="font-semibold tabular-nums text-slate-950">{proposal.historicalAffectedTraffic.clicks}</dd></div><div><dt className="text-xs text-slate-500">Conversions</dt><dd className="font-semibold tabular-nums text-slate-950">{proposal.historicalAffectedTraffic.conversions}</dd></div><div><dt className="text-xs text-slate-500">Conversion value</dt><dd className="font-semibold tabular-nums text-slate-950">{proposal.historicalAffectedTraffic.conversionValue === null ? "Unavailable" : money(proposal.historicalAffectedTraffic.conversionValue, currency)}</dd></div><div><dt className="text-xs text-slate-500">Scope</dt><dd className="font-semibold text-slate-950">{proposal.scope.level === "ad_group" ? `${proposal.scope.campaignName} / ${proposal.scope.adGroup}` : proposal.scope.campaignName}</dd></div></dl>
        <p className="mt-3 text-xs font-medium text-amber-800">Historical affected traffic only — not projected or guaranteed savings.</p>
        <details className="mt-4 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Evidence, conflict checks, and uncertainty</summary><div className="mt-3 grid gap-3 text-xs leading-5 text-slate-600"><p><span className="font-semibold text-slate-800">Evidence IDs:</span> {proposal.evidenceIds.join(", ")}</p><ul>{proposal.conflictChecks.map((item) => <li key={item}>• {item}</li>)}</ul><ul>{proposal.uncertainty.map((item) => <li key={item}>• {item}</li>)}</ul></div></details>
        <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setReviewStates((state) => ({ ...state, [proposal.id]: "accepted_for_future_review" }))} type="button">Accept for future review</button><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setReviewStates((state) => ({ ...state, [proposal.id]: "rejected" }))} type="button">Reject proposal</button><span className="self-center text-xs text-slate-500">Browser-local review state only; neither action changes Google Ads.</span></div>
      </article>; })}
      <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><summary className="cursor-pointer font-semibold text-amber-950">Limitations and exclusions</summary><p className="mt-2 text-sm text-slate-700">Protected: {result.exclusions.protected} · Below threshold: {result.exclusions.belowThreshold} · Duplicates: {result.exclusions.duplicate} · Conflicts: {result.exclusions.conflict}</p><ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">{result.limitations.map((item) => <li key={item}>• {item}</li>)}</ul></details>
    </div> : null}
  </section>;
}
