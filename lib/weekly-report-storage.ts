import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { get, list, put } from "@vercel/blob";

import { weeklyReportSchema, type WeeklyReport } from "./weekly-report.ts";
import { requireWorkspaceId } from "./workspace-id.ts";

const FILE_NAME = /^\d{4}-\d{2}-\d{2}\.json$/;

function storageRoot(override?: string): string {
  const configured = override?.trim() || process.env.WEEKLY_REPORT_STORAGE_DIR?.trim();
  return path.resolve(/*turbopackIgnore: true*/ configured || path.join(process.cwd(), "runtime"));
}

function storageDirectory(clientId: string, override?: string): string {
  return path.join(storageRoot(override), "clients", requireWorkspaceId(clientId), "weekly-reports");
}

function shouldUseVercelBlob(override?: string): boolean {
  return Boolean(process.env.VERCEL) && !override?.trim() && !process.env.WEEKLY_REPORT_STORAGE_DIR?.trim();
}

function validateDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Weekly report period end must use YYYY-MM-DD.");
  return date;
}

function parseWeeklyReport(value: string, periodEnd: string): WeeklyReport {
  const parsed = weeklyReportSchema.safeParse(JSON.parse(value) as unknown);
  if (!parsed.success) throw new Error(`Saved weekly report ${periodEnd} has an invalid shape.`);
  return parsed.data;
}

export function getWeeklyReportStorageKey(clientId: string, periodEnd: string): string {
  return `clients/${requireWorkspaceId(clientId)}/weekly-reports/${validateDate(periodEnd)}.json`;
}

function blobPrefix(clientId: string): string {
  return `clients/${requireWorkspaceId(clientId)}/weekly-reports/`;
}

async function getBlobWeeklyReport(clientId: string, periodEnd: string): Promise<WeeklyReport | null> {
  const result = await get(getWeeklyReportStorageKey(clientId, periodEnd), { access: "private", useCache: false });
  if (!result) return null;
  if (!result.stream) throw new Error(`Saved weekly report ${periodEnd} returned no content.`);
  return parseWeeklyReport(await new Response(result.stream).text(), periodEnd);
}

export async function saveWeeklyReport(clientId: string, report: WeeklyReport, directory?: string): Promise<void> {
  const validated = weeklyReportSchema.parse(report);
  const periodEnd = validated.reportingPeriod.endDate;
  if (shouldUseVercelBlob(directory)) {
    await put(getWeeklyReportStorageKey(clientId, periodEnd), `${JSON.stringify(validated, null, 2)}\n`, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    return;
  }
  const targetDirectory = storageDirectory(clientId, directory);
  await mkdir(targetDirectory, { recursive: true });
  const target = path.join(targetDirectory, `${validateDate(periodEnd)}.json`);
  const temporary = path.join(targetDirectory, `.${periodEnd}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

export async function getWeeklyReport(clientId: string, periodEnd: string, directory?: string): Promise<WeeklyReport | null> {
  if (shouldUseVercelBlob(directory)) return getBlobWeeklyReport(clientId, periodEnd);
  try {
    return parseWeeklyReport(
      await readFile(path.join(storageDirectory(clientId, directory), `${validateDate(periodEnd)}.json`), "utf8"),
      periodEnd,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listWeeklyReports(clientId: string, directory?: string): Promise<WeeklyReport[]> {
  let dates: string[];
  if (shouldUseVercelBlob(directory)) {
    const prefix = blobPrefix(clientId);
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      paths.push(...page.blobs.map((blob) => blob.pathname));
      cursor = page.cursor;
    } while (cursor);
    dates = paths
      .map((pathname) => pathname.slice(prefix.length))
      .filter((file) => FILE_NAME.test(file))
      .sort((left, right) => right.localeCompare(left))
      .map((file) => file.slice(0, -5));
    const results = await Promise.all(dates.map((date) => getBlobWeeklyReport(clientId, date)));
    return results.filter((report): report is WeeklyReport => Boolean(report));
  }
  try {
    dates = (await readdir(/*turbopackIgnore: true*/ storageDirectory(clientId, directory)))
      .filter((file) => FILE_NAME.test(file))
      .sort((left, right) => right.localeCompare(left))
      .map((file) => file.slice(0, -5));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const results = await Promise.all(dates.map((date) => getWeeklyReport(clientId, date, directory)));
  return results.filter((report): report is WeeklyReport => Boolean(report));
}

export async function getLatestWeeklyReport(clientId: string, directory?: string): Promise<WeeklyReport | null> {
  return (await listWeeklyReports(clientId, directory))[0] ?? null;
}
