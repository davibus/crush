"use client";

import { FormEvent, useState } from "react";

import { LANDING_PAGE_BRIEF_VERSION, LANDING_PAGE_DRAFT_LIMITS, landingPageDraftResultSchema, type LandingPageDraft, type LandingPageDraftResult } from "@/lib/landing-page-generation";

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";

function Field({ id, label, value, onChange, required = false, maximum = LANDING_PAGE_DRAFT_LIMITS.guidance, multiline = false, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean; maximum?: number; multiline?: boolean; placeholder?: string }) {
  return <div><label className="text-xs font-semibold text-slate-700" htmlFor={id}>{label}</label>{multiline ? <textarea className={`${inputClass} min-h-20 resize-y`} id={id} maxLength={maximum} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} value={value} /> : <input className={inputClass} id={id} maxLength={maximum} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} value={value} />}</div>;
}

function Editable({ label, value, maximum, multiline = false, onChange }: { label: string; value: string; maximum: number; multiline?: boolean; onChange: (value: string) => void }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}{multiline ? <textarea className={`${inputClass} min-h-20 resize-y font-normal`} maxLength={maximum} onChange={(event) => onChange(event.target.value)} value={value} /> : <input className={`${inputClass} font-normal`} maxLength={maximum} onChange={(event) => onChange(event.target.value)} value={value} />}<span className="mt-1 block text-right font-normal text-slate-400">{value.length}/{maximum}</span></label>;
}

function Preview({ draft }: { draft: LandingPageDraft }) {
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">DRAFT / PREVIEW ONLY · Nothing has been published</div>
    <header className="bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 px-6 py-14 text-center text-white sm:px-12">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">{draft.pageTitle.copy}</p><h4 className="mx-auto mt-4 max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl">{draft.hero.headline.copy}</h4><p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-200">{draft.hero.subheadline.copy}</p><div className="mt-7 flex flex-wrap justify-center gap-3"><span className="rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold">{draft.hero.primaryCta.copy}</span>{draft.hero.secondaryCta ? <span className="rounded-xl border border-slate-400 px-5 py-3 text-sm font-semibold">{draft.hero.secondaryCta.copy}</span> : null}</div>
    </header>
    <section className="px-6 py-10 sm:px-10"><h5 className="text-xl font-semibold text-slate-950">Benefits and value</h5><div className="mt-5 grid gap-4 md:grid-cols-2">{draft.benefits.map((benefit, index) => <article className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={index}><h6 className="font-semibold text-slate-950">{benefit.title.copy}</h6><p className="mt-2 text-sm leading-6 text-slate-600">{benefit.body.copy}</p></article>)}</div></section>
    <section className="border-y border-slate-200 bg-blue-50/60 px-6 py-10 sm:px-10"><h5 className="text-xl font-semibold text-slate-950">Supporting message</h5><div className="mt-5 grid gap-4">{draft.supportingProof.map((item, index) => <article key={index}><h6 className="font-semibold text-slate-900">{item.title.copy}</h6><p className="mt-1 text-sm leading-6 text-slate-700">{item.body.copy}</p></article>)}</div></section>
    <section className="px-6 py-10 sm:px-10"><h5 className="text-xl font-semibold text-slate-950">Questions and objections</h5><div className="mt-4 divide-y divide-slate-200">{draft.faqs.map((faq, index) => <article className="py-4" key={index}><h6 className="font-semibold text-slate-900">{faq.question.copy}</h6><p className="mt-1 text-sm leading-6 text-slate-600">{faq.answer.copy}</p></article>)}</div></section>
    <section className="bg-slate-900 px-6 py-10 text-center text-white sm:px-10"><h5 className="text-2xl font-semibold">{draft.finalCta.headline.copy}</h5><p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-300">{draft.finalCta.body.copy}</p><span className="mt-5 inline-block rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold">{draft.finalCta.cta.copy}</span></section>
  </div>;
}

export default function LandingPageGenerationPanel({ clientId }: { clientId: string }) {
  const [pageName, setPageName] = useState("");
  const [offer, setOffer] = useState("");
  const [audience, setAudience] = useState("");
  const [goal, setGoal] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [brandGuidance, setBrandGuidance] = useState("");
  const [claims, setClaims] = useState("");
  const [cta, setCta] = useState("");
  const [result, setResult] = useState<LandingPageDraftResult>();
  const [edited, setEdited] = useState<LandingPageDraft>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(mutator: (draft: LandingPageDraft) => void) {
    if (!edited) return;
    const next = structuredClone(edited);
    mutator(next);
    setEdited(next);
  }

  async function generate(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const brief = { schemaVersion: LANDING_PAGE_BRIEF_VERSION, pageName, offer, targetAudience: audience, primaryConversionGoal: goal, ...(destinationUrl.trim() ? { destinationUrl } : {}), ...(brandGuidance.trim() ? { brandGuidance } : {}), factualClaims: claims.split(/\r?\n/).map((item) => item.trim()).filter(Boolean), ...(cta.trim() ? { ctaPreference: cta } : {}) };
      const response = await fetch("/api/landing-page-generation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId, brief }) });
      const body = await response.json() as unknown;
      if (!response.ok) { setError(body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "A landing-page draft could not be generated."); return; }
      const parsed = body && typeof body === "object" && "result" in body ? landingPageDraftResultSchema.safeParse(body.result) : undefined;
      if (!parsed?.success) { setError("The draft response did not pass client-side schema validation."); return; }
      setResult(parsed.data); setEdited(parsed.data.draft ? structuredClone(parsed.data.draft) : undefined);
    } catch { setError("Could not reach the landing-page drafting endpoint."); } finally { setLoading(false); }
  }

  return <section aria-labelledby="landing-page-generation-heading" className="mb-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950" id="landing-page-generation-heading">AI landing-page drafting</h3><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">Draft / preview only</span></div><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Create an editable structured-copy preview from this workspace&apos;s brief and bounded evidence. Crush does not create or publish a public page.</p></div></div>
    <form className="mt-5 grid gap-4" onSubmit={generate}><div className="grid gap-4 md:grid-cols-2"><Field id="lpg-name" label="Page or campaign name" maximum={LANDING_PAGE_DRAFT_LIMITS.name} onChange={setPageName} required value={pageName} /><Field id="lpg-goal" label="Primary conversion goal" maximum={LANDING_PAGE_DRAFT_LIMITS.name} onChange={setGoal} placeholder="Example: Request a consultation" required value={goal} /><Field id="lpg-offer" label="Offer, product, or service" multiline onChange={setOffer} required value={offer} /><Field id="lpg-audience" label="Target audience" multiline onChange={setAudience} required value={audience} /><Field id="lpg-url" label="Existing or destination URL (optional)" maximum={2_048} onChange={setDestinationUrl} placeholder="https://example.com/service" value={destinationUrl} /><Field id="lpg-cta" label="CTA preference (optional)" maximum={LANDING_PAGE_DRAFT_LIMITS.cta} onChange={setCta} placeholder="Example: Request a consultation" value={cta} /><Field id="lpg-brand" label="Brand or message guidance (optional)" multiline onChange={setBrandGuidance} value={brandGuidance} /><Field id="lpg-claims" label="User-provided factual claims (optional, one per line)" multiline onChange={setClaims} placeholder="Only add facts you can substantiate" value={claims} /></div><p className="text-xs leading-5 text-slate-500">Missing business facts will not be invented. Claims are treated as explicit user input, remain visible in the evidence panel, and still require human substantiation.</p><button className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:w-fit" disabled={loading} type="submit">{loading ? "Drafting…" : result ? "Regenerate draft" : "Generate draft"}</button></form>
    {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {result ? <div aria-live="polite" className="mt-7 grid gap-5">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">DRAFT / PREVIEW ONLY — nothing has been published, deployed, connected to a CMS, or sent traffic.</div>
      {result.fictional ? <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950">Fictional/sample evidence is present. This is a portfolio preview, not live-client content.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{result.sourceStatus.map((source) => <article className={`rounded-xl border p-3 ${source.status === "available" ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`} key={source.source}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{source.source.replaceAll("_", " ")}</p><p className="mt-1 text-sm font-bold text-slate-800">{source.status}</p><p className="mt-1 text-xs leading-5 text-slate-600">{source.detail}</p></article>)}</div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI status: {result.ai.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-700">{result.ai.detail}</p></div>
      {result.status === "insufficient_data" || !edited ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Insufficient safe first-party offer and audience evidence. No page copy was created.</p> : <>
        <Preview draft={edited} />
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4" open><summary className="cursor-pointer font-semibold text-slate-900">Edit draft copy locally</summary><p className="mt-2 text-xs text-slate-500">Edits stay in this browser state. They are not saved, published, or promoted to trusted evidence.</p><div className="mt-4 grid gap-4 md:grid-cols-2"><Editable label="Hero headline" maximum={LANDING_PAGE_DRAFT_LIMITS.headline} onChange={(value) => update((draft) => { draft.hero.headline.copy = value; })} value={edited.hero.headline.copy} /><Editable label="Hero subheadline" maximum={LANDING_PAGE_DRAFT_LIMITS.subheadline} multiline onChange={(value) => update((draft) => { draft.hero.subheadline.copy = value; })} value={edited.hero.subheadline.copy} /><Editable label="Primary CTA" maximum={LANDING_PAGE_DRAFT_LIMITS.cta} onChange={(value) => update((draft) => { draft.hero.primaryCta.copy = value; })} value={edited.hero.primaryCta.copy} />{edited.benefits.map((benefit, index) => <div className="grid gap-2" key={index}><Editable label={`Benefit ${index + 1} title`} maximum={LANDING_PAGE_DRAFT_LIMITS.title} onChange={(value) => update((draft) => { draft.benefits[index]!.title.copy = value; })} value={benefit.title.copy} /><Editable label={`Benefit ${index + 1} body`} maximum={LANDING_PAGE_DRAFT_LIMITS.body} multiline onChange={(value) => update((draft) => { draft.benefits[index]!.body.copy = value; })} value={benefit.body.copy} /></div>)}{edited.supportingProof.map((item, index) => <Editable key={index} label={`Supporting section ${index + 1}`} maximum={LANDING_PAGE_DRAFT_LIMITS.body} multiline onChange={(value) => update((draft) => { draft.supportingProof[index]!.body.copy = value; })} value={item.body.copy} />)}{edited.faqs.map((faq, index) => <Editable key={index} label={`FAQ ${index + 1} answer`} maximum={LANDING_PAGE_DRAFT_LIMITS.body} multiline onChange={(value) => update((draft) => { draft.faqs[index]!.answer.copy = value; })} value={faq.answer.copy} />)}<Editable label="Final CTA body" maximum={LANDING_PAGE_DRAFT_LIMITS.body} multiline onChange={(value) => update((draft) => { draft.finalCta.body.copy = value; })} value={edited.finalCta.body.copy} /></div></details>
        <details className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"><summary className="cursor-pointer font-semibold text-blue-950">Structured sections, evidence, and rationale</summary><div className="mt-3 grid gap-4"><p className="text-sm leading-6 text-slate-700">{result.draft?.rationale.summary}</p><div className="grid gap-3 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">First-party claim support</p><p className="mt-1 break-all text-xs text-slate-600">{result.draft?.rationale.firstPartyEvidenceIds.join(", ")}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Theme / competitor inspiration</p><p className="mt-1 break-all text-xs text-slate-600">{result.draft?.rationale.inspirationEvidenceIds.join(", ") || "None used"}</p></div></div><div className="grid gap-2 md:grid-cols-2">{result.evidence.map((item) => <article className={`rounded-lg border p-3 ${item.scope === "competitor" ? "border-violet-200 bg-violet-50" : item.scope === "generated" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`} key={item.id}><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{item.scope.replaceAll("_", " ")} · {item.source.replaceAll("_", " ")} · {item.reusePolicy.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-800">{item.text}</p><p className="mt-1 break-all text-[11px] text-slate-500">{item.id}</p></article>)}</div></div></details>
      </>}
      <details className="rounded-xl border border-amber-200 bg-amber-50/50 p-4"><summary className="cursor-pointer font-semibold text-amber-950">Warnings and limitations</summary><ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">{[...(result.draft?.warnings ?? []), ...result.limitations].map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}</ul></details>
    </div> : null}
  </section>;
}
