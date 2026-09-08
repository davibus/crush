import "server-only";

import {
  buildPdfMarketingReport,
  getPdfReportFilename,
  type PdfMarketingReport,
} from "./pdf-report.ts";
import { renderPdfMarketingReport } from "./pdf-report-renderer.ts";
import type { WorkspaceResolution } from "./tenant-authorization.ts";

export type PdfReportHandlerDependencies = {
  resolveWorkspace: (workspaceId: unknown) => Promise<WorkspaceResolution>;
  buildReport?: (workspace: Extract<WorkspaceResolution, { ok: true }>["workspace"]) => Promise<PdfMarketingReport>;
  renderReport?: (report: PdfMarketingReport) => Promise<Uint8Array>;
};

export async function handlePdfReportRequest(
  workspaceId: unknown,
  dependencies: PdfReportHandlerDependencies,
): Promise<Response> {
  const access = await dependencies.resolveWorkspace(workspaceId);
  if (!access.ok) return access.response;

  const report = await (dependencies.buildReport ?? buildPdfMarketingReport)(access.workspace);
  const pdf = await (dependencies.renderReport ?? renderPdfMarketingReport)(report);
  const filename = getPdfReportFilename(report);
  return new Response(pdf.slice().buffer, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdf.byteLength),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
