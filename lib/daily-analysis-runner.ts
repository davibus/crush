import "server-only";

import { createClientEnvironment } from "./clients.ts";
import { analyzeDailyMarketingChanges } from "./daily-analysis-ai.ts";
import { collectDailyMarketingData } from "./daily-analysis-data.ts";
import { saveDailyAnalysis } from "./daily-analysis-storage.ts";
import { executeDailyAnalysis, type DailyAnalysisResult } from "./daily-analysis.ts";
import { getTenantRepository } from "./tenant-repository.ts";

export async function runDailyMarketingAnalysis(
  clientId: string,
  options: {
    now?: Date;
    timeZone?: string;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<DailyAnalysisResult> {
  const baseEnvironment = options.environment ?? process.env;
  const client = await getTenantRepository().findWorkspaceById(clientId);
  if (!client) throw new Error(`Unknown client workspace: ${clientId}`);
  const environment = createClientEnvironment(client, baseEnvironment);
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
        saveDailyAnalysis(client.id, result, environment.DAILY_ANALYSIS_STORAGE_DIR),
    },
  );
}
