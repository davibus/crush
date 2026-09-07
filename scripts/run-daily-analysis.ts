import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { runDailyMarketingAnalysis } = await import(
  "../lib/daily-analysis-runner.ts"
);
const clientId = process.argv[2] ?? "demo";

try {
  const result = await runDailyMarketingAnalysis(clientId);
  console.log(
    JSON.stringify(
      {
        clientId,
        analysisDate: result.analysisDate,
        generatedAt: result.generatedAt,
        dataSourcesUsed: result.dataSourcesUsed,
        dataSourceStatus: result.dataSourceStatus,
        materialChanges: result.materialChanges.length,
        aiStatus: result.aiFindings.status,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Daily Analysis failed.");
  process.exitCode = 1;
}
