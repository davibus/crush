"use client";

export default function AgencyError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="w-full max-w-lg rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">Portfolio unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold">We could not load your authorized workspaces.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">No workspace data was exposed. The problem may be temporary; retry the secure server request.</p>
        <button className="mt-6 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-slate-100" onClick={() => retry()} type="button">Try again</button>
      </section>
    </main>
  );
}
