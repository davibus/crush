"use client";

import { FormEvent, useState } from "react";

import { COMPETITOR_DEMO_ID, competitorAnalysisSchema, MAX_COMPETITORS, type CompetitorAnalysis, type CompetitorFinding } from "@/lib/competitor-analysis";

type InputRow = { name: string; url: string };

function EvidenceLinks({ analysis, ids }: { analysis: CompetitorAnalysis; ids: readonly string[] }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{ids.map((id) => {
    const item = analysis.evidence.find((evidence) => evidence.id === id);
    return <a className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100" href={`#${id.replaceAll(":", "-")}`} key={id}>{item?.label ?? id}</a>;
  })}</div>;
}

function Findings({ analysis, items, empty }: { analysis: CompetitorAnalysis; items: readonly CompetitorFinding[]; empty: string }) {
  if (!items.length) return <p className="mt-2 text-sm text-slate-600">{empty}</p>;
  return <div className="mt-3 grid gap-3 md:grid-cols-2">{items.map((item) => <article className={`rounded-xl border p-4 ${item.classification === "hypothesis" ? "border-violet-200 bg-violet-50/40" : "border-slate-200"}`} key={item.id}>
    <div className="flex flex-wrap items-center gap-2"><h5 className="font-semibold text-slate-900">{item.title}</h5><span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.classification === "hypothesis" ? "bg-violet-100 text-violet-800" : "bg-blue-100 text-blue-800"}`}>{item.classification === "hypothesis" ? "Hypothesis" : "Observable fact"}</span></div>
    <p className="mt-2 text-sm leading-6 text-slate-600">{item.statement}</p><EvidenceLinks analysis={analysis} ids={item.evidenceIds} />
  </article>)}</div>;
}

export default function CompetitorAnalysisPanel({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<InputRow[]>([{ name: "", url: "" }]);
  const [analysis, setAnalysis] = useState<CompetitorAnalysis>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(index: number, key: keyof InputRow, value: string) { setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row)); }
  async function run(body: unknown) {
    setLoading(true); setError(""); setAnalysis(undefined);
    try {
      const response = await fetch("/api/competitor-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, ...(body as object) }) });
      const value = await response.json() as unknown;
      if (!response.ok) { setError(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The competitors could not be analyzed."); return; }
      const parsed = value && typeof value === "object" && "analysis" in value ? competitorAnalysisSchema.safeParse(value.analysis) : undefined;
      if (!parsed?.success) { setError("The analysis response did not pass client-side schema validation."); return; }
      setAnalysis(parsed.data);
    } catch { setError("Could not reach the competitor-analysis endpoint."); } finally { setLoading(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void run({ mode: "urls", competitors: rows.filter((row) => row.url.trim()).map((row) => ({ url: row.url.trim(), ...(row.name.trim() ? { name: row.name.trim() } : {}) })) });
  }

  return <section aria-labelledby="competitor-analysis-heading" className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950" id="competitor-analysis-heading">Competitor analysis</h3><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Read-only public analysis</span><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">Facts vs hypotheses</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Compare one to three explicitly selected public pages with observable static-HTML evidence. Strategic ideas are labeled hypotheses; no private competitor performance is inferred.</p></div></div>
    <form className="mt-5 grid gap-3" onSubmit={submit}>
      {rows.map((row, index) => <div className="grid gap-2 sm:grid-cols-[0.6fr_1.4fr_auto]" key={index}>
        <div><label className="text-xs font-medium text-slate-700" htmlFor={`competitor-name-${index}`}>Name (optional)</label><input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id={`competitor-name-${index}`} maxLength={100} onChange={(event) => update(index, "name", event.target.value)} placeholder="Competitor label" value={row.name} /></div>
        <div><label className="text-xs font-medium text-slate-700" htmlFor={`competitor-url-${index}`}>Explicit public URL</label><input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" id={`competitor-url-${index}`} onChange={(event) => update(index, "url", event.target.value)} placeholder="https://www.example.com/page" required type="url" value={row.url} /></div>
        {rows.length > 1 ? <button aria-label={`Remove competitor ${index + 1}`} className="self-end rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))} type="button">Remove</button> : <span />}
      </div>)}
      <div className="flex flex-wrap gap-2"><button className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={rows.length >= MAX_COMPETITORS || loading} onClick={() => setRows((current) => [...current, { name: "", url: "" }])} type="button">Add competitor</button><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={loading || !rows.some((row) => row.url.trim())} type="submit">{loading ? "Analyzing…" : "Run competitor analysis"}</button></div>
    </form>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60" disabled={loading} onClick={() => void run({ mode: "demo", fixtureId: COMPETITOR_DEMO_ID })} type="button">Analyze fictional Northstar competitors</button><p className="text-xs text-slate-500">No search, crawling, JavaScript, cookies, credentials, or form submission.</p></div>
    {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {analysis ? <div aria-live="polite" className="mt-6 grid gap-6">
      {analysis.demo ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">Fictional demo data — these pages and competitor names are bundled examples, not live companies.</p> : null}
      <div><h4 className="font-semibold text-slate-950">Source and retrieval status</h4><div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{analysis.competitors.map((competitor) => <article className={`rounded-xl border p-3 ${competitor.status === "failed" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`} key={competitor.id}><p className="font-semibold text-slate-900">{competitor.name ?? new URL(competitor.normalizedUrl).hostname}</p><p className="mt-1 break-all text-xs text-slate-600">{competitor.finalUrl ?? competitor.normalizedUrl}</p><p className={`mt-2 text-xs font-semibold uppercase ${competitor.status === "failed" ? "text-amber-800" : "text-emerald-700"}`}>{competitor.status}</p><p className="mt-1 text-xs leading-5 text-slate-600">{competitor.detail}</p>{competitor.retrievedAt ? <p className="mt-1 text-xs text-slate-500">Retrieved {new Date(competitor.retrievedAt).toLocaleString()}</p> : null}</article>)}</div><p className="mt-3 text-sm text-slate-600"><span className="font-semibold">Own-page comparison:</span> {analysis.ownPage.detail}</p></div>
      <div><h4 className="font-semibold text-slate-950">Observable competitor evidence</h4><Findings analysis={analysis} empty="No competitor page was retrieved successfully." items={analysis.observations} /></div>
      <div><h4 className="font-semibold text-slate-950">Cross-competitor patterns</h4><Findings analysis={analysis} empty="No repeated or contrasting pattern crossed the bounded deterministic rules." items={analysis.patterns} /></div>
      <div><h4 className="font-semibold text-slate-950">Differentiation opportunities</h4><p className="mt-1 text-xs text-slate-500">Ideas for investigation, not claims about customer preference or conversion performance.</p><Findings analysis={analysis} empty="No evidence-linked differentiation opportunity was generated." items={[...analysis.opportunities, ...analysis.hypotheses]} /></div>
      <details className="rounded-xl border border-slate-200 p-4" open><summary className="cursor-pointer font-semibold text-slate-950">Evidence references and limitations</summary><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="grid gap-2">{analysis.evidence.map((item) => <div className="scroll-mt-24 rounded-lg bg-slate-50 p-3" id={item.id.replaceAll(":", "-")} key={item.id}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.sourceType.replaceAll("_", " ")} · {item.classification} · {item.label}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{String(item.value)}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p></div>)}</div><div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">AI: {analysis.ai.status.replaceAll("_", " ")}</p><p className="mb-4 text-xs leading-5 text-slate-600">{analysis.ai.detail}</p><ul className="grid content-start gap-2 text-sm leading-6 text-slate-600">{analysis.limitations.map((limitation) => <li className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" key={limitation}>{limitation}</li>)}</ul></div></div></details>
    </div> : null}
  </section>;
}
