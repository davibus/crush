"use client";

import { useState } from "react";

function responseFilename(response: Response): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([a-z0-9.-]+)"/i.exec(disposition);
  return match?.[1] ?? "crush-marketing-report.pdf";
}

export default function PdfReportDownload({ clientId }: { clientId: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function downloadReport() {
    setIsGenerating(true);
    setError("");
    try {
      const response = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/reports/pdf`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? "The PDF report could not be generated.");
      }
      if (!response.headers.get("Content-Type")?.startsWith("application/pdf")) {
        throw new Error("The server returned an unexpected report format.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = responseFilename(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error
        ? downloadError.message
        : "The PDF report could not be generated.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section aria-labelledby="pdf-report-heading" className="mb-8 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-slate-950 to-blue-950 text-white shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">Client-ready export</p>
          <h2 className="mt-2 text-lg font-semibold" id="pdf-report-heading">PDF Marketing Report</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">Download a polished snapshot of current KPIs, account health, saved analysis, recommendations, and available GA4 context.</p>
        </div>
        <button
          className="shrink-0 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-950 disabled:cursor-wait disabled:opacity-60"
          disabled={isGenerating}
          onClick={downloadReport}
          type="button"
        >
          {isGenerating ? "Generating PDF..." : "Download PDF report"}
        </button>
      </div>
      {error ? <p className="border-t border-red-400/30 bg-red-950/40 px-5 py-3 text-sm text-red-100 sm:px-6" role="alert">{error}</p> : null}
    </section>
  );
}
