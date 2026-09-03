import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const { runWeeklyMarketingReport } = await import("../lib/weekly-report-runner.ts");

try {
  const report = await runWeeklyMarketingReport();
  console.log(JSON.stringify({
    reportingPeriod: report.reportingPeriod,
    generatedAt: report.generatedAt,
    dataSourceStatus: report.dataSourceStatus,
    aiEnrichment: report.aiEnrichment.status,
  }, null, 2));
} catch (error) {
  console.error("Weekly Marketing Report failed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
