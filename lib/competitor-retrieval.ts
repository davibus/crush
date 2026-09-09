import "server-only";

import { readFile } from "node:fs/promises";

import { COMPETITOR_DEMO_ID, type CompetitorInput, type CompetitorRetrievalResult } from "./competitor-analysis.ts";
import { LandingPageRetrievalError, retrieveLandingPage, validateLandingPageUrl } from "./landing-page-retrieval.ts";

const demoFixtures = [
  { name: "Summit Trail Supply (fictional)", file: "northstar-competitor-summit.html", url: "https://summit-trail-supply.example/gear-help" },
  { name: "Campfire Direct (fictional)", file: "northstar-competitor-campfire.html", url: "https://campfire-direct.example/bundles" },
  { name: "Alpine Ready (fictional)", file: "northstar-competitor-alpine.html", url: "https://alpine-ready.example/equipment" },
] as const;

export function normalizeCompetitorInputs(inputs: readonly CompetitorInput[]): Array<CompetitorInput & { normalizedUrl: string }> {
  const normalized = inputs.map((input) => {
    const url = validateLandingPageUrl(input.url);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return { ...input, normalizedUrl: url.toString() };
  });
  if (new Set(normalized.map((item) => item.normalizedUrl)).size !== normalized.length) {
    throw new LandingPageRetrievalError("invalid_url", "Duplicate competitor URLs are not accepted in one analysis.");
  }
  return normalized;
}

export async function retrieveCompetitorPages(inputs: readonly CompetitorInput[]): Promise<CompetitorRetrievalResult[]> {
  const normalized = normalizeCompetitorInputs(inputs);
  return Promise.all(normalized.map(async (input) => {
    try {
      return { input: { url: input.url, ...(input.name ? { name: input.name } : {}) }, normalizedUrl: input.normalizedUrl, page: await retrieveLandingPage(input.normalizedUrl) };
    } catch (error) {
      const safe = error instanceof LandingPageRetrievalError ? error : new LandingPageRetrievalError("unreachable", "The public competitor page could not be retrieved.");
      return { input: { url: input.url, ...(input.name ? { name: input.name } : {}) }, normalizedUrl: input.normalizedUrl, error: { code: safe.code, message: safe.message, retrievedAt: new Date().toISOString() } };
    }
  }));
}

export async function retrieveCompetitorDemoPages(fixtureId: typeof COMPETITOR_DEMO_ID): Promise<CompetitorRetrievalResult[]> {
  if (fixtureId !== COMPETITOR_DEMO_ID) throw new LandingPageRetrievalError("invalid_url", "Unknown competitor demo fixture.");
  return Promise.all(demoFixtures.map(async (fixture) => {
    const html = await readFile(new URL(`../data/${fixture.file}`, import.meta.url), "utf8");
    return {
      input: { url: fixture.url, name: fixture.name }, normalizedUrl: fixture.url,
      page: { requestedUrl: fixture.url, finalUrl: fixture.url, html, retrievedAt: new Date().toISOString(), source: "demo_fixture" as const, redirectCount: 0, bytes: Buffer.byteLength(html), contentType: "text/html; charset=utf-8" },
    };
  }));
}
