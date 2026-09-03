function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none ${className}`} />;
}

export default function Loading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-slate-950 text-white">
        <div className="mx-auto max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-500 font-bold">C</div>
            <div><p className="font-semibold">Crush</p><p className="text-xs text-slate-400">AI Marketing Command Center</p></div>
          </div>
          <div className="py-12 lg:py-16">
            <Skeleton className="h-4 w-48 bg-slate-700" />
            <Skeleton className="mt-5 h-12 w-full max-w-2xl bg-slate-700 sm:h-16" />
            <Skeleton className="mt-5 h-5 w-full max-w-3xl bg-slate-800" />
            <Skeleton className="mt-2 h-5 w-3/4 max-w-xl bg-slate-800" />
          </div>
        </div>
      </div>
      <div className="border-b border-slate-200 bg-white py-3" />
      <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <section aria-label="Loading dashboard overview">
          <Skeleton className="h-64 w-full rounded-3xl" />
          <div className="mt-12">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-9 w-72 max-w-full" />
            <Skeleton className="mt-3 h-5 w-full max-w-xl" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="rounded-2xl border border-slate-200 bg-white p-5" key={index}>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-5 h-9 w-36" />
                <Skeleton className="mt-12 h-3 w-32 bg-slate-100" />
              </div>
            ))}
          </div>
        </section>
        <p className="sr-only" role="status">Loading the Crush marketing dashboard</p>
      </div>
    </main>
  );
}
