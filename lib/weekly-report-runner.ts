import "server-only";

import { createClientEnvironment, requireClientById } from "./clients.ts";
import { enrichWeeklyReport } from "./weekly-report-ai.ts";
import { collectWeeklyMarketingData } from "./weekly-report-data.ts";
import { saveWeeklyReport } from "./weekly-report-storage.ts";
import { executeWeeklyReport, type WeeklyReport } from "./weekly-report.ts";

export async function runWeeklyMarketingReport(
  clientId: string,
  options: { now?: Date; timeZone?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<WeeklyReport> {
  const baseEnvironment = options.environment ?? process.env;
  const client = requireClientById(clientId, baseEnvironment);
  const environment = createClientEnvironment(client, baseEnvironment);
  return executeWeeklyReport(
    {
      now: options.now,
      timeZone: options.timeZone ?? (
        environment.WEEKLY_REPORT_TIME_ZONE?.trim() ||
        environment.DAILY_ANALYSIS_TIME_ZONE?.trim() ||
        "UTC"
      ),
    },
    {
      collect: (ranges) => collectWeeklyMarketingData(ranges, environment),
      enrich: (draft) => enrichWeeklyReport(draft, environment),
      save: (report) => saveWeeklyReport(client.id, report, environment.WEEKLY_REPORT_STORAGE_DIR),
    },
  );
}
