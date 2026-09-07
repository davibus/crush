function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none ${className}`} />;
}

export default function AgencyLoading() {
  return (
    <main aria-busy="true" className="min-h-screen bg-slate-50">
      <div className="bg-slate-950">
        <div className="mx-auto max-w-[90rem] px-4 py-5 sm:px-6 lg:px-8">
          <Skeleton className="h-9 w-44 bg-slate-800" />
          <div className="py-12 lg:py-16">
            <Skeleton className="h-4 w-40 bg-slate-700" />
            <Skeleton className="mt-5 h-14 max-w-3xl bg-slate-700" />
            <Skeleton className="mt-5 h-5 max-w-2xl bg-slate-800" />
          </div>
        </div>
      </div>
      <div className="mx-auto grid max-w-[90rem] gap-5 px-4 py-10 sm:px-6 xl:grid-cols-2 lg:px-8">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-96 rounded-3xl" key={index} />)}
      </div>
      <p className="sr-only" role="status">Loading the agency portfolio</p>
    </main>
  );
}
