import { KpiOverviewSkeleton } from "@/app/components/kpi-overview";

export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-50 p-4 text-zinc-900 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 animate-pulse motion-reduce:animate-none">
          <div className="h-9 w-28 rounded bg-zinc-200" />
          <div className="mt-3 h-5 w-64 rounded bg-zinc-200" />
        </div>
        <KpiOverviewSkeleton />
      </div>
    </main>
  );
}
