"use client";

import { FormEvent, useState } from "react";

import { LANDING_PAGE_DEMO_ID, landingPageAnalysisSchema, type LandingPageAnalysis, type LandingPageAnalysisItem } from "@/lib/landing-page-analysis";

function severityClass(severity: LandingPageAnalysisItem["severity"] | "high" | "medium" | "low") {
  return severity === "high" ? "bg-red-100 text-red-800" : severity === "medium" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
}

function EvidenceLinks({ ids, analysis }: { ids: readonly string[]; analysis: LandingPageAnalysis }) {
  return <div className="mt-2 flex flex-wrap gap-1.5">{ids.map((id) => {
    const item = analysis.evidence.find((evidence) => evidence.id === id);
    return <a className="rounded bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100" href={`#${id.replaceAll(":", "-")}`} key={id}>{item?.label ?? id}</a>;
  })}</div>;
}

export default function LandingPageAnalysisPanel({ clientId }: { clientId: string }) {
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<LandingPageAnalysis>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(body: Record<string, string>) {
    setLoading(true); setError(""); setAnalysis(undefined);
    try {
      const response = await fetch("/api/landing-page-analysis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, ...body }) });
      const value = await response.json() as unknown;
      if (!response.ok) {
        setError(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "The page could not be analyzed.");
        return;
      }
      const parsed = zResponse(value);
      if (!parsed) { setError("The analysis response did not pass client-side schema validation."); return; }
      setAnalysis(parsed);
    } catch { setError("Could not reach the landing-page analysis endpoint."); } finally { setLoading(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void run({ mode: "url", url: url.trim() }); }

  return (
    <section aria-labelledby="landing-page-analysis-heading" className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950" id="landing-page-analysis-heading">Landing-page analysis</h3><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Read-only analysis</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Review static page evidence, basic accessibility signals, CRO opportunities, and bounded test hypotheses. Explanations are hypotheses, not proven causes.</p></div>
      </div>
      <form className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]" onSubmit={submit}>
        <div><label className="text-sm font-medium text-slate-800" htmlFor="landing-page-url">Explicit landing-page URL</label><input className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" id="landing-page-url" onChange={(event) => setUrl(event.target.value)} placeholder="https://www.example.com/landing-page" required type="url" value={url} /></div>
        <button className="self-end rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60" disabled={loading || !url.trim()} type="submit">{loading ? "Analyzing…" : "Analyze URL"}</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60" disabled={loading} onClick={() => void run({ mode: "demo", fixtureId: LANDING_PAGE_DEMO_ID })} type="button">Analyze fictional Northstar demo page</button><p className="text-xs text-slate-500">No JavaScript, cookies, credentials, form submissions, or linked-page crawling.</p></div>
      {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
      {analysis ? <div aria-live="polite" className="mt-6 grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(analysis.sources).map(([key, source]) => <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={key}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{source.label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{source.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs leading-5 text-slate-600">{source.detail ?? (key === "page" ? `${analysis.retrieval.bytes.toLocaleString()} bytes retrieved at ${new Date(analysis.retrieval.retrievedAt).toLocaleString()}.` : "")}</p></div>)}</div>
        <div><h4 className="font-semibold text-slate-950">Deterministic observations</h4><div className="mt-3 grid gap-3 md:grid-cols-2">{[...analysis.observations, ...analysis.strengths].map((item) => <article className="rounded-xl border border-slate-200 p-4" key={item.id}><div className="flex justify-between gap-3"><h5 className="font-semibold text-slate-900">{item.title}</h5><span className="text-xs font-medium text-slate-500">{item.category.replaceAll("_", " ")}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{item.explanation}</p><EvidenceLinks analysis={analysis} ids={item.evidenceIds} /></article>)}</div></div>
        <div><h4 className="font-semibold text-slate-950">Prioritized CRO opportunities</h4>{analysis.issues.length ? <div className="mt-3 grid gap-3">{analysis.issues.map((item) => <article className="rounded-xl border border-slate-200 p-4" key={item.id}><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(item.severity)}`}>{item.severity}</span><h5 className="font-semibold text-slate-900">{item.title}</h5>{item.hypothesis ? <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">Hypothesis</span> : <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-800">Observed signal</span>}</div><p className="mt-2 text-sm leading-6 text-slate-600">{item.explanation}</p><EvidenceLinks analysis={analysis} ids={item.evidenceIds} /></article>)}</div> : <p className="mt-2 text-sm text-slate-600">No deterministic CRO issue crossed the bounded rules. Manual review may still identify opportunities.</p>}</div>
        <div><h4 className="font-semibold text-slate-950">Proposed test hypotheses</h4><p className="mt-1 text-xs text-slate-500">These are experiments to review, not forecasts or guaranteed lift.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{analysis.experiments.map((experiment) => <article className="rounded-xl border border-violet-200 bg-violet-50/40 p-4" key={experiment.id}><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityClass(experiment.priority)}`}>{experiment.priority}</span><h5 className="font-semibold text-slate-900">{experiment.title}</h5></div><p className="mt-2 text-sm leading-6 text-slate-700">{experiment.hypothesis}</p><p className="mt-2 text-sm leading-6 text-slate-600"><span className="font-semibold">Test:</span> {experiment.test}</p><p className="mt-2 text-xs font-medium text-slate-700">Primary metric: {experiment.primaryMetric}</p><EvidenceLinks analysis={analysis} ids={experiment.evidenceIds} /></article>)}</div></div>
        <details className="rounded-xl border border-slate-200 p-4" open><summary className="cursor-pointer font-semibold text-slate-950">Supporting evidence and limitations</summary><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="grid gap-2">{analysis.evidence.map((item) => <div className="scroll-mt-24 rounded-lg bg-slate-50 p-3" id={item.id.replaceAll(":", "-")} key={item.id}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.source.replaceAll("_", " ")} · {item.label}</p><p className="mt-1 break-words text-sm font-medium text-slate-900">{String(item.value)}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p></div>)}</div><ul className="grid content-start gap-2 text-sm leading-6 text-slate-600">{analysis.limitations.map((limitation) => <li className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2" key={limitation}>{limitation}</li>)}</ul></div></details>
      </div> : null}
    </section>
  );
}

function zResponse(value: unknown): LandingPageAnalysis | undefined {
  if (!value || typeof value !== "object" || !("analysis" in value)) return undefined;
  const parsed = landingPageAnalysisSchema.safeParse(value.analysis);
  return parsed.success ? parsed.data : undefined;
}
