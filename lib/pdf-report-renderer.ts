import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import type { PdfMarketingReport, PdfReportNarrativeItem } from "./pdf-report.ts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const NAVY = rgb(0.059, 0.09, 0.165);
const BLUE = rgb(0.145, 0.388, 0.922);
const SLATE = rgb(0.278, 0.333, 0.412);
const LIGHT = rgb(0.945, 0.961, 0.976);
const WHITE = rgb(1, 1, 1);

type Canvas = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

function safeText(value: string): string {
  return value
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const paragraphs = safeText(text).split(/\r?\n/);
  return paragraphs.flatMap((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  });
}

function newPage(canvas: Canvas): void {
  canvas.page = canvas.document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  canvas.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 12, width: PAGE_WIDTH, height: 12, color: BLUE });
  canvas.y = PAGE_HEIGHT - 42;
}

function ensure(canvas: Canvas, height: number): void {
  if (canvas.y - height < 48) newPage(canvas);
}

function paragraph(
  canvas: Canvas,
  text: string,
  options: { size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; bold?: boolean } = {},
): void {
  const size = options.size ?? 9.5;
  const indent = options.indent ?? 0;
  const lineHeight = size * 1.42;
  const font = options.bold ? canvas.bold : canvas.regular;
  const lines = wrap(text, font, size, CONTENT_WIDTH - indent);
  ensure(canvas, lines.length * lineHeight + (options.gap ?? 7));
  for (const line of lines) {
    canvas.page.drawText(line, { x: MARGIN + indent, y: canvas.y, size, font, color: options.color ?? SLATE });
    canvas.y -= lineHeight;
  }
  canvas.y -= options.gap ?? 7;
}

function sectionTitle(canvas: Canvas, title: string, kicker?: string): void {
  ensure(canvas, kicker ? 52 : 38);
  canvas.y -= 8;
  if (kicker) {
    canvas.page.drawText(safeText(kicker.toUpperCase()), { x: MARGIN, y: canvas.y, size: 7.5, font: canvas.bold, color: BLUE });
    canvas.y -= 15;
  }
  canvas.page.drawText(safeText(title), { x: MARGIN, y: canvas.y, size: 18, font: canvas.bold, color: NAVY });
  canvas.y -= 11;
  canvas.page.drawRectangle({ x: MARGIN, y: canvas.y, width: 36, height: 2.5, color: BLUE });
  canvas.y -= 17;
}

function items(canvas: Canvas, rows: readonly PdfReportNarrativeItem[], empty: string): void {
  if (!rows.length) {
    paragraph(canvas, empty, { color: SLATE });
    return;
  }
  for (const row of rows) {
    paragraph(canvas, row.title, { bold: true, color: NAVY, indent: 12, gap: 2 });
    paragraph(canvas, row.summary, { indent: 12, gap: 9 });
  }
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function metric(value: number | null, kind: "money" | "count" | "percent" | "ratio", currency: string): string {
  if (value === null) return "Unavailable";
  if (kind === "money") return money(value, currency);
  if (kind === "percent") return `${value.toFixed(2)}%`;
  if (kind === "ratio") return `${value.toFixed(2)}x`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function kpiGrid(canvas: Canvas, report: PdfMarketingReport): void {
  const m = report.googleAds.metrics;
  const entries: Array<[string, string]> = [
    ["Spend", metric(m.spend, "money", report.currency)],
    ["Clicks", metric(m.clicks, "count", report.currency)],
    ["Impressions", metric(m.impressions, "count", report.currency)],
    ["CTR", metric(m.ctr, "percent", report.currency)],
    ["CPC", metric(m.cpc, "money", report.currency)],
    ["Conversions", metric(m.conversions, "count", report.currency)],
    ["Conversion rate", metric(m.conversionRate, "percent", report.currency)],
    ["CPA", metric(m.cpa, "money", report.currency)],
    ["Conversion value", metric(m.conversionValue, "money", report.currency)],
    ["ROAS", metric(m.roas, "ratio", report.currency)],
  ];
  const cellWidth = CONTENT_WIDTH / 2;
  const cellHeight = 47;
  ensure(canvas, entries.length / 2 * cellHeight + 8);
  entries.forEach(([label, value], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * cellWidth;
    const y = canvas.y - row * cellHeight - cellHeight;
    canvas.page.drawRectangle({ x, y, width: cellWidth - 5, height: cellHeight - 5, color: LIGHT });
    canvas.page.drawText(label, { x: x + 12, y: y + 27, size: 7.5, font: canvas.bold, color: SLATE });
    canvas.page.drawText(safeText(value), { x: x + 12, y: y + 11, size: 12, font: canvas.bold, color: NAVY });
  });
  canvas.y -= Math.ceil(entries.length / 2) * cellHeight + 4;
}

export async function renderPdfMarketingReport(report: PdfMarketingReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const canvas: Canvas = { document, page: document.addPage([PAGE_WIDTH, PAGE_HEIGHT]), regular, bold, y: 0 };

  canvas.page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: NAVY });
  canvas.page.drawRectangle({ x: MARGIN, y: PAGE_HEIGHT - 103, width: 36, height: 36, color: BLUE });
  canvas.page.drawText("C", { x: MARGIN + 11, y: PAGE_HEIGHT - 94, size: 19, font: bold, color: WHITE });
  canvas.page.drawText("CRUSH", { x: MARGIN + 48, y: PAGE_HEIGHT - 83, size: 11, font: bold, color: WHITE });
  canvas.page.drawText("MARKETING INTELLIGENCE", { x: MARGIN + 48, y: PAGE_HEIGHT - 98, size: 7, font: bold, color: rgb(0.58, 0.68, 0.82) });
  canvas.page.drawText(report.title, { x: MARGIN, y: PAGE_HEIGHT - 190, size: 27, font: bold, color: WHITE });
  const clientLines = wrap(report.clientName, bold, 19, CONTENT_WIDTH);
  clientLines.forEach((line, index) => canvas.page.drawText(line, { x: MARGIN, y: PAGE_HEIGHT - 226 - index * 23, size: 19, font: bold, color: rgb(0.45, 0.65, 1) }));
  canvas.page.drawText(safeText(report.reportingPeriod), { x: MARGIN, y: PAGE_HEIGHT - 290, size: 11, font: regular, color: WHITE });
  canvas.page.drawText(`Generated ${new Date(report.generatedAt).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })} UTC`, { x: MARGIN, y: PAGE_HEIGHT - 311, size: 8.5, font: regular, color: rgb(0.7, 0.76, 0.84) });
  canvas.page.drawRectangle({ x: MARGIN, y: 78, width: CONTENT_WIDTH, height: 1, color: rgb(0.25, 0.32, 0.43) });
  canvas.page.drawText("Prepared for client review", { x: MARGIN, y: 56, size: 8, font: regular, color: rgb(0.64, 0.7, 0.79) });

  newPage(canvas);
  sectionTitle(canvas, "Executive overview", "Performance snapshot");
  paragraph(canvas, `Reporting period: ${report.reportingPeriod}`, { bold: true, color: NAVY });
  for (const source of report.dataSources) {
    paragraph(canvas, `${source.name} - ${source.status.replaceAll("_", " ")}: ${source.detail}`, { indent: 10, gap: 5 });
  }
  ensure(canvas, 65);
  canvas.page.drawRectangle({ x: MARGIN, y: canvas.y - 53, width: CONTENT_WIDTH, height: 53, color: NAVY });
  canvas.page.drawText("CRUSH ACCOUNT SCORE", { x: MARGIN + 15, y: canvas.y - 20, size: 7.5, font: bold, color: rgb(0.56, 0.7, 1) });
  canvas.page.drawText(`${report.googleAds.accountScore}/100`, { x: MARGIN + 15, y: canvas.y - 42, size: 20, font: bold, color: WHITE });
  canvas.y -= 68;
  paragraph(canvas, report.googleAds.accountScoreSummary);

  sectionTitle(canvas, "Google Ads performance", "Core KPIs");
  kpiGrid(canvas, report);
  sectionTitle(canvas, "Campaign highlights");
  items(canvas, report.googleAds.campaignHighlights, "No campaign highlights are available.");

  sectionTitle(canvas, "Latest Daily Analysis", "Automated analysis");
  if (report.dailyAnalysis) {
    paragraph(canvas, `${report.dailyAnalysis.analysisDate} - ${report.dailyAnalysis.status.replaceAll("_", " ")}`, { bold: true, color: NAVY });
    paragraph(canvas, report.dailyAnalysis.summary);
    items(canvas, report.dailyAnalysis.findings, "No material daily findings were identified.");
  } else {
    paragraph(canvas, "Daily Analysis has not been run for this workspace yet. The rest of this report remains complete.");
  }

  sectionTitle(canvas, "Latest Weekly Report", "Stakeholder narrative");
  if (report.weeklyReport) {
    paragraph(canvas, `${report.weeklyReport.reportingPeriod} - ${report.weeklyReport.status.replaceAll("_", " ")}`, { bold: true, color: NAVY });
    paragraph(canvas, report.weeklyReport.executiveSummary);
    paragraph(canvas, "Biggest wins", { bold: true, color: NAVY, gap: 5 });
    items(canvas, report.weeklyReport.wins, "No favorable comparable movement was identified.");
    paragraph(canvas, "Biggest problems", { bold: true, color: NAVY, gap: 5 });
    items(canvas, report.weeklyReport.problems, "No unfavorable comparable movement was identified.");
  } else {
    paragraph(canvas, "A Weekly Marketing Report has not been run for this workspace yet. Current Google Ads KPIs are still included above.");
  }

  sectionTitle(canvas, "Recommendations & opportunities", "Next actions");
  items(canvas, report.recommendations, "No grounded recommendation is available for this reporting window.");

  sectionTitle(canvas, "GA4 context", "Site outcomes");
  if (report.ga4) {
    paragraph(canvas, `GA4 reporting period: ${report.ga4.reportingPeriod}`, { bold: true, color: NAVY });
    const ga4Rows = [
      `Sessions: ${metric(report.ga4.sessions, "count", report.currency)}`,
      `Users: ${metric(report.ga4.users, "count", report.currency)}`,
      `Engaged sessions: ${metric(report.ga4.engagedSessions, "count", report.currency)}`,
      `Engagement rate: ${metric(report.ga4.engagementRate, "percent", report.currency)}`,
      `Key events: ${metric(report.ga4.keyEvents, "count", report.currency)}`,
      `Revenue: ${metric(report.ga4.revenue, "money", report.currency)}`,
    ];
    paragraph(canvas, ga4Rows.join("  |  "));
    paragraph(canvas, "Google Ads and GA4 use different attribution systems; GA4 is presented as supporting site context, not as a replacement for paid-media conversion reporting.", { size: 8.5 });
  } else {
    paragraph(canvas, "GA4 is not connected or was unavailable. Paid-media reporting remains usable without it.");
  }
  if (report.notes.length) {
    sectionTitle(canvas, "Report notes");
    report.notes.forEach((note) => paragraph(canvas, `- ${note}`, { indent: 8, gap: 4 }));
  }

  const pages = document.getPages();
  pages.forEach((page, index) => {
    if (index === 0) return;
    const label = `Crush  |  ${safeText(report.clientName)}  |  ${index + 1} of ${pages.length}`;
    page.drawText(label, { x: MARGIN, y: 24, size: 7.5, font: regular, color: SLATE });
  });
  document.setTitle(`${report.clientName} - ${report.title}`);
  document.setAuthor("Crush");
  document.setSubject(report.reportingPeriod);
  document.setCreator("Crush Marketing Intelligence");
  return document.save({ useObjectStreams: false });
}
