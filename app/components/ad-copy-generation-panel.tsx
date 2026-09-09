"use client";

import { FormEvent, useState } from "react";

import { AD_COPY_LIMITS, adCopyDraftResultSchema, googleAdsCharacterCount, type AdCopyDraftResult } from "@/lib/ad-copy-generation";

function CopyList({ label, values, maximum }: { label: string; values: readonly string[]; maximum: number }) {
  return <div><h5 className="text-sm font-semibold text-slate-900">{label}</h5><ol className="mt-2 grid gap-2">{values.map((value, index) => { const count = googleAdsCharacterCount(value); return <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" key={`${value}-${index}`}><span>{value}</span><span aria-label={`${count} of ${maximum} characters`} className="shrink-0 text-xs font-medium text-slate-500">{count}/{maximum}</span></li>; })}</ol></div>;
}

export default function AdCopyGenerationPanel({ clientId }: { clientId: string }) {
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<AdCopyDraftResult>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generate(event?: FormEvent) {
    event?.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/ad-copy-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, ...(objective.trim() ? { objective: objective.trim() } : {}) }) });
      const body = await response.json() as unknown;
      if (!response.ok) { setError(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "Ad-copy drafts could not be generated."); return; }
      const parsed = body && typeof body === "object" && "result" in body ? adCopyDraftResultSchema.safeParse(body.result) : undefined;
      if (!parsed?.success) { setError("The draft response did not pass client-side schema validation."); return; }
      setResult(parsed.data);
    } catch { setError("Could not reach the ad-copy drafting endpoint."); } finally { setLoading(false); }
  }

  return <section aria-labelledby="ad-copy-heading" className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950" id="ad-copy-heading">AI ad-copy drafting</h3><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Draft only</span><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">Google responsive search ad</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Create review-ready creative suggestions from this workspace&apos;s validated evidence. Crush cannot upload, publish, or change Google Ads.</p></div></div>
    <form className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={generate}>
      <div><label className="text-xs font-semibold text-slate-700" htmlFor="ad-copy-objective">Creative objective or theme (optional)</label><input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id="ad-copy-objective" maxLength={AD_COPY_LIMITS.maxObjectiveCharacters} onChange={(event) => setObjective(event.target.value)} placeholder="Example: emphasize trail-ready weekend gear" value={objective} /><p className="mt-1 text-xs text-slate-500">Direction only; this cannot add unsupported prices, offers, guarantees, or other facts.</p></div>
      <button className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={loading} type="submit">{loading ? "Drafting…" : result ? "Regenerate drafts" : "Generate drafts"}</button>
    </form>
    {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {result ? <div aria-live="polite" className="mt-6 grid gap-5">
      {result.fictional ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Fictional/sample data — these drafts are portfolio examples, not live client advertising.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{result.sourceStatus.map((source) => <article className={`rounded-xl border p-3 ${source.status === "available" ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`} key={source.source}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{source.source.replaceAll("_", " ")}</p><p className={`mt-1 text-sm font-bold ${source.status === "available" ? "text-emerald-800" : "text-slate-600"}`}>{source.status}</p><p className="mt-1 text-xs leading-5 text-slate-600">{source.detail}</p></article>)}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI status: {result.ai.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-700">{result.ai.detail}</p></div>
      {result.status === "insufficient_data" ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Insufficient validated first-party business language to create a responsible draft. Analyze the workspace landing page, then try again.</p> : <div className="grid gap-4">{result.candidates.map((draft) => <article className="rounded-2xl border border-slate-200 p-4 sm:p-5" key={draft.id}>
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">AI-generated creative suggestion · {draft.source.replaceAll("_", " ")}</p><h4 className="mt-1 text-base font-semibold text-slate-950">{draft.creativeAngle}</h4></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Validation: {draft.validation.status}</span></div>
        <p className="mt-2 text-sm leading-6 text-slate-600">{draft.rationale}</p><div className="mt-4 grid gap-4 lg:grid-cols-2"><CopyList label="Candidate headlines" maximum={AD_COPY_LIMITS.headline.maxCharacters} values={draft.headlines} /><CopyList label="Candidate descriptions" maximum={AD_COPY_LIMITS.description.maxCharacters} values={draft.descriptions} /></div>
        <details className="mt-4 rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Supporting evidence references</summary><div className="mt-3 grid gap-2 text-xs text-slate-600"><p><span className="font-semibold text-slate-800">First-party claim support:</span> {draft.claimEvidenceIds.join(", ")}</p><p><span className="font-semibold text-slate-800">Creative inspiration:</span> {draft.inspirationEvidenceIds.join(", ") || "None"}</p></div></details>
      </article>)}</div>}
      <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><summary className="cursor-pointer font-semibold text-amber-950">Evidence boundary and limitations</summary><div className="mt-3 grid gap-4 lg:grid-cols-2"><ul className="grid gap-2 text-sm leading-6 text-slate-700">{result.limitations.map((item) => <li key={item}>• {item}</li>)}</ul><div className="grid gap-2">{result.evidence.map((item) => <div className="rounded-lg border border-slate-200 bg-white p-2.5" key={item.id}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.scope.replaceAll("_", " ")} · {item.source.replaceAll("_", " ")} · {item.reusePolicy.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-800">{item.text}</p><p className="mt-1 break-all text-[11px] text-slate-500">{item.id}</p></div>)}</div></div></details>
    </div> : null}
  </section>;
}
