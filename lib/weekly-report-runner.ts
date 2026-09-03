import "server-only";

import { enrichWeeklyReport } from "./weekly-report-ai.ts";
import { collectWeeklyMarketingData } from "./weekly-report-data.ts";
import { saveWeeklyReport } from "./weekly-report-storage.ts";
import { executeWeeklyReport, type WeeklyReport } from "./weekly-report.ts";

export async function runWeeklyMarketingReport(
  options: { now?: Date; timeZone?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<WeeklyReport> {
  const environment = options.environment ?? process.env;
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
      save: (report) => saveWeeklyReport(report, environment.WEEKLY_REPORT_STORAGE_DIR),
    },
  );
}
