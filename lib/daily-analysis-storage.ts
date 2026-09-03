import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { get, list, put } from "@vercel/blob";

import type { DailyAnalysisResult } from "./daily-analysis.ts";

const FILE_NAME = /^\d{4}-\d{2}-\d{2}\.json$/;
const BLOB_PREFIX = "daily-analyses/";

function storageDirectory(override?: string): string {
  const configuredDirectory =
    override?.trim() || process.env.DAILY_ANALYSIS_STORAGE_DIR?.trim();
  return path.resolve(/*turbopackIgnore: true*/
    configuredDirectory || path.join(process.cwd(), "runtime", "daily-analyses"),
  );
}

function shouldUseVercelBlob(override?: string): boolean {
  return Boolean(process.env.VERCEL) && !override?.trim() &&
    !process.env.DAILY_ANALYSIS_STORAGE_DIR?.trim();
}

function isDailyAnalysisResult(value: unknown): value is DailyAnalysisResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<DailyAnalysisResult>;
  return (
    typeof result.generatedAt === "string" &&
    typeof result.analysisDate === "string" &&
    typeof result.timeZone === "string" &&
    Array.isArray(result.dataSourcesUsed) &&
    Array.isArray(result.materialChanges) &&
    Array.isArray(result.warnings) &&
    Boolean(result.yesterdaySummary) &&
    Boolean(result.rolling7DaySummary) &&
    Boolean(result.aiFindings)
  );
}

function validateDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Daily analysis date must use YYYY-MM-DD.");
  }
  return date;
}

function parseDailyAnalysis(value: string, analysisDate: string): DailyAnalysisResult {
  const parsed: unknown = JSON.parse(value);
  if (!isDailyAnalysisResult(parsed)) {
    throw new Error(`Saved daily analysis ${analysisDate} has an invalid shape.`);
  }
  return parsed;
}

function blobPath(analysisDate: string): string {
  return `${BLOB_PREFIX}${validateDate(analysisDate)}.json`;
}

async function getBlobDailyAnalysis(
  analysisDate: string,
): Promise<DailyAnalysisResult | null> {
  const result = await get(blobPath(analysisDate), {
    access: "private",
    useCache: false,
  });
  if (!result) return null;
  if (!result.stream) {
    throw new Error(`Saved daily analysis ${analysisDate} returned no content.`);
  }
  return parseDailyAnalysis(
    await new Response(result.stream).text(),
    analysisDate,
  );
}

export async function saveDailyAnalysis(
  result: DailyAnalysisResult,
  directory?: string,
): Promise<void> {
  if (shouldUseVercelBlob(directory)) {
    await put(
      blobPath(result.analysisDate),
      `${JSON.stringify(result, null, 2)}\n`,
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 60,
      },
    );
    return;
  }
  const targetDirectory = storageDirectory(directory);
  await mkdir(targetDirectory, { recursive: true });
  const target = path.join(targetDirectory, `${validateDate(result.analysisDate)}.json`);
  const temporary = path.join(
    targetDirectory,
    `.${result.analysisDate}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, target);
}

export async function getDailyAnalysis(
  analysisDate: string,
  directory?: string,
): Promise<DailyAnalysisResult | null> {
  if (shouldUseVercelBlob(directory)) return getBlobDailyAnalysis(analysisDate);
  const target = path.join(
    storageDirectory(directory),
    `${validateDate(analysisDate)}.json`,
  );
  try {
    return parseDailyAnalysis(await readFile(target, "utf8"), analysisDate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listDailyAnalyses(
  directory?: string,
): Promise<DailyAnalysisResult[]> {
  if (shouldUseVercelBlob(directory)) {
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: BLOB_PREFIX, cursor, limit: 1000 });
      pathnames.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.cursor;
    } while (cursor);
    const dates = pathnames
      .map((pathname) => pathname.slice(BLOB_PREFIX.length))
      .filter((file) => FILE_NAME.test(file))
      .sort((left, right) => right.localeCompare(left))
      .map((file) => file.slice(0, -5));
    const results = await Promise.all(dates.map(getBlobDailyAnalysis));
    return results.filter((result): result is DailyAnalysisResult => Boolean(result));
  }
  const targetDirectory = storageDirectory(directory);
  let files: string[];
  try {
    files = await readdir(/*turbopackIgnore: true*/ targetDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const dates = files
    .filter((file) => FILE_NAME.test(file))
    .sort((left, right) => right.localeCompare(left))
    .map((file) => file.slice(0, -5));
  const results = await Promise.all(
    dates.map((date) => getDailyAnalysis(date, targetDirectory)),
  );
  return results.filter((result): result is DailyAnalysisResult => Boolean(result));
}

export async function getLatestDailyAnalysis(
  directory?: string,
): Promise<DailyAnalysisResult | null> {
  return (await listDailyAnalyses(directory))[0] ?? null;
}
