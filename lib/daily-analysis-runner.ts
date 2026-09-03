import "server-only";

import { analyzeDailyMarketingChanges } from "./daily-analysis-ai.ts";
import { collectDailyMarketingData } from "./daily-analysis-data.ts";
import { saveDailyAnalysis } from "./daily-analysis-storage.ts";
import { executeDailyAnalysis, type DailyAnalysisResult } from "./daily-analysis.ts";

export async function runDailyMarketingAnalysis(
  options: {
    now?: Date;
    timeZone?: string;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<DailyAnalysisResult> {
  const environment = options.environment ?? process.env;
  return executeDailyAnalysis(
    {
      now: options.now,
      timeZone:
        options.timeZone ??
        (environment.DAILY_ANALYSIS_TIME_ZONE?.trim() || "UTC"),
    },
    {
      collect: (ranges) => collectDailyMarketingData(ranges, environment),
      analyze: (input) => analyzeDailyMarketingChanges(input, environment),
      save: (result) =>
        saveDailyAnalysis(result, environment.DAILY_ANALYSIS_STORAGE_DIR),
    },
  );
}
