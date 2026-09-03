import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { runDailyMarketingAnalysis } = await import(
  "../lib/daily-analysis-runner.ts"
);

try {
  const result = await runDailyMarketingAnalysis();
  console.log(
    JSON.stringify(
      {
        analysisDate: result.analysisDate,
        generatedAt: result.generatedAt,
        dataSourcesUsed: result.dataSourcesUsed,
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
