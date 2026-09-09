import { z } from "zod";

import {
  buildDeterministicLandingPageAnalysis,
  type LandingPageAnalysis,
  type RetrievedLandingPage,
} from "./landing-page-analysis.ts";

export const COMPETITOR_ANALYSIS_VERSION = "competitor-analysis.v1" as const;
export const COMPETITOR_DEMO_ID = "northstar-fictional-competitors" as const;
export const MAX_COMPETITORS = 3;

const competitorInputSchema = z.object({
  url: z.string().trim().min(1, "Each competitor needs a URL.").max(2_048),
  name: z.string().trim().min(1).max(100).optional(),
}).strict();

export const competitorAnalysisRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("urls"),
    clientId: z.string().trim().min(1).max(100),
    competitors: z.array(competitorInputSchema).min(1, "Add at least one competitor URL.").max(MAX_COMPETITORS),
  }).strict(),
  z.object({
    mode: z.literal("demo"),
    clientId: z.string().trim().min(1).max(100),
    fixtureId: z.literal(COMPETITOR_DEMO_ID),
  }).strict(),
]);

const sourceStatusSchema = z.object({
  id: z.string().regex(/^competitor-[1-3]$/),
  name: z.string().trim().min(1).max(100).nullable(),
  suppliedUrl: z.string().trim().min(1).max(2_048),
  normalizedUrl: z.string().url().max(2_048),
  finalUrl: z.string().url().max(2_048).nullable(),
  status: z.enum(["available", "failed"]),
  sourceType: z.enum(["competitor_public_html", "demo_fixture"]),
  retrievedAt: z.string().datetime(),
  errorCode: z.string().trim().min(1).max(80).nullable(),
  detail: z.string().trim().min(1).max(500),
}).strict();

export const competitorEvidenceSchema = z.object({
  id: z.string().regex(/^ca:(?:competitor-[1-3]|own):[a-z0-9_:-]+$/),
  scope: z.enum(["competitor", "own_page"]),
  competitorId: z.string().regex(/^competitor-[1-3]$/).nullable(),
  sourceType: z.enum(["competitor_public_html", "workspace_landing_page", "demo_fixture"]),
  retrievedUrl: z.string().url().max(2_048),
  retrievedAt: z.string().datetime(),
  kind: z.enum(["url", "metadata", "headline", "cta", "offer", "audience", "trust", "structure", "content"]),
  label: z.string().trim().min(1).max(160),
  value: z.union([z.string().max(1_000), z.number().finite(), z.boolean()]),
  detail: z.string().trim().min(1).max(1_000),
  classification: z.literal("observable"),
}).strict();

export const competitorFindingSchema = z.object({
  id: z.string().regex(/^ca:(?:observation|pattern|opportunity|hypothesis):[a-z0-9_-]+$/),
  category: z.enum(["value_proposition", "cta", "offer", "audience", "trust", "form_friction", "content_structure", "messaging_theme"]),
  title: z.string().trim().min(1).max(180),
  statement: z.string().trim().min(1).max(900),
  classification: z.enum(["observable", "hypothesis"]),
  evidenceIds: z.array(z.string()).min(1).max(12),
}).strict();

export const competitorAnalysisSchema = z.object({
  schemaVersion: z.literal(COMPETITOR_ANALYSIS_VERSION),
  analyzedAt: z.string().datetime(),
  readOnly: z.literal(true),
  demo: z.boolean(),
  competitors: z.array(sourceStatusSchema).min(1).max(MAX_COMPETITORS),
  ownPage: z.object({
    status: z.enum(["available", "unavailable"]),
    finalUrl: z.string().url().max(2_048).nullable(),
    detail: z.string().trim().min(1).max(500),
  }).strict(),
  observations: z.array(competitorFindingSchema).max(20),
  patterns: z.array(competitorFindingSchema).max(12),
  opportunities: z.array(competitorFindingSchema).max(10),
  hypotheses: z.array(competitorFindingSchema).max(10),
  limitations: z.array(z.string().trim().min(1).max(600)).min(1).max(20),
  evidence: z.array(competitorEvidenceSchema).max(120),
  ai: z.object({
    status: z.enum(["applied", "not_configured", "failed", "invalid"]),
    detail: z.string().trim().min(1).max(500),
  }).strict(),
}).strict().superRefine((analysis, context) => {
  const ids = new Set(analysis.evidence.map((item) => item.id));
  if (ids.size !== analysis.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
  const groups = [analysis.observations, analysis.patterns, analysis.opportunities, analysis.hypotheses];
  for (const [groupIndex, group] of groups.entries()) {
    for (const [itemIndex, item] of group.entries()) {
      if ((groupIndex < 2 && item.classification !== "observable") || (groupIndex >= 2 && item.classification !== "hypothesis")) {
        context.addIssue({ code: "custom", message: "Fact and hypothesis sections must retain their classification.", path: ["findings", itemIndex, "classification"] });
      }
      for (const evidenceId of item.evidenceIds) if (!ids.has(evidenceId)) context.addIssue({ code: "custom", message: `Unknown evidence ID: ${evidenceId}`, path: ["findings", itemIndex, "evidenceIds"] });
    }
  }
});

export type CompetitorAnalysis = z.infer<typeof competitorAnalysisSchema>;
export type CompetitorEvidence = z.infer<typeof competitorEvidenceSchema>;
export type CompetitorFinding = z.infer<typeof competitorFindingSchema>;
export type CompetitorInput = z.infer<typeof competitorInputSchema>;
export type CompetitorRetrievalResult = {
  input: CompetitorInput;
  normalizedUrl: string;
  page?: RetrievedLandingPage;
  error?: { code: string; message: string; retrievedAt?: string };
};

const copiedEvidence = [
  ["page:url", "url"], ["page:title", "metadata"], ["page:meta_description", "metadata"],
  ["page:h1", "headline"], ["page:h2", "headline"], ["page:ctas", "cta"],
  ["page:structure", "structure"], ["page:forms", "structure"], ["page:image_alt", "structure"],
  ["page:headings", "structure"], ["page:excerpt", "content"], ["page:trust_signals", "trust"],
] as const;

function mapPageEvidence(
  prefix: "own" | `competitor-${number}`,
  pageAnalysis: LandingPageAnalysis,
  sourceType: CompetitorEvidence["sourceType"],
  competitorId: string | null,
): CompetitorEvidence[] {
  return copiedEvidence.flatMap(([suffix, kind]) => {
    const original = pageAnalysis.evidence.find((item) => item.id === `lp:${suffix}`);
    if (!original) return [];
    return [{
      id: `ca:${prefix}:${suffix.replaceAll(":", "_")}`,
      scope: competitorId ? "competitor" as const : "own_page" as const,
      competitorId,
      sourceType,
      retrievedUrl: pageAnalysis.page.finalUrl,
      retrievedAt: pageAnalysis.retrieval.retrievedAt,
      kind,
      label: original.label,
      value: original.value,
      detail: original.detail,
      classification: "observable" as const,
    }];
  });
}

function evidenceValue(evidence: readonly CompetitorEvidence[], id: string): string {
  const value = evidence.find((item) => item.id === id)?.value;
  return value === undefined ? "" : String(value);
}

function compact(value: string, maximum = 220): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}

function detectedPhrases(text: string, expressions: readonly RegExp[]): string[] {
  return expressions.flatMap((expression) => text.match(expression)?.[0] ?? []).map((item) => item.trim()).filter(Boolean);
}

export function buildDeterministicCompetitorAnalysis(
  results: readonly CompetitorRetrievalResult[],
  ownPage?: LandingPageAnalysis,
  analyzedAt = new Date().toISOString(),
): CompetitorAnalysis {
  const evidence: CompetitorEvidence[] = [];
  const observations: CompetitorFinding[] = [];
  const availableAnalyses = new Map<string, LandingPageAnalysis>();
  const competitors = results.map((result, index) => {
    const id = `competitor-${index + 1}` as const;
    if (!result.page) return {
      id, name: result.input.name ?? null, suppliedUrl: result.input.url, normalizedUrl: result.normalizedUrl,
      finalUrl: null, status: "failed" as const, sourceType: "competitor_public_html" as const,
      retrievedAt: result.error?.retrievedAt ?? analyzedAt, errorCode: result.error?.code ?? "unreachable", detail: result.error?.message ?? "The public page could not be retrieved safely.",
    };
    const pageAnalysis = buildDeterministicLandingPageAnalysis(result.page, { ga4: { status: "unconfigured" } }, analyzedAt);
    availableAnalyses.set(id, pageAnalysis);
    const pageEvidence = mapPageEvidence(id, pageAnalysis, result.page.source === "demo_fixture" ? "demo_fixture" : "competitor_public_html", id);
    evidence.push(...pageEvidence);
    const label = compact(result.input.name ?? new URL(result.page.finalUrl).hostname, 100);
    observations.push({
      id: `ca:observation:page_${index + 1}`, category: "value_proposition", title: `${label} page messaging captured`,
      statement: `${label}'s retrieved page uses H1 “${compact(evidenceValue(pageEvidence, `ca:${id}:page_h1`))}” and exposes CTA candidates “${compact(evidenceValue(pageEvidence, `ca:${id}:page_ctas`))}”.`,
      classification: "observable", evidenceIds: [`ca:${id}:page_h1`, `ca:${id}:page_ctas`],
    });
    return {
      id, name: result.input.name ?? null, suppliedUrl: result.input.url, normalizedUrl: result.normalizedUrl,
      finalUrl: result.page.finalUrl, status: "available" as const,
      sourceType: result.page.source === "demo_fixture" ? "demo_fixture" as const : "competitor_public_html" as const,
      retrievedAt: result.page.retrievedAt, errorCode: null,
      detail: `${result.page.bytes.toLocaleString()} bytes of static public content retrieved after ${result.page.redirectCount} redirect(s).`,
    };
  });

  if (ownPage) evidence.push(...mapPageEvidence("own", ownPage, ownPage.retrieval.source === "demo_fixture" ? "demo_fixture" : "workspace_landing_page", null));
  const available = competitors.filter((item) => item.status === "available");
  const patterns: CompetitorFinding[] = [];
  const opportunities: CompetitorFinding[] = [];
  const hypotheses: CompetitorFinding[] = [];

  const ctaIds = available.map((item) => `ca:${item.id}:page_ctas`);
  const uniqueCtas = new Set(ctaIds.map((id) => evidenceValue(evidence, id)).filter(Boolean));
  if (available.length > 1 && uniqueCtas.size > 1) patterns.push({ id: "ca:pattern:cta_variation", category: "cta", title: "Competitors use different action language", statement: `The ${available.length} retrieved competitor pages expose different CTA candidate sets.`, classification: "observable", evidenceIds: ctaIds });

  const themeDefinitions = [
    { id: "free", label: "free", expression: /\bfree(?: shipping| consultation| estimate| trial)?\b/gi },
    { id: "guarantee", label: "guarantee or warranty", expression: /\b(?:guarantee|warranty)\b/gi },
    { id: "bundle", label: "bundle", expression: /\bbundles?\b/gi },
    { id: "expert", label: "expert guidance", expression: /\b(?:expert|certified|consultation|guidance|guide)\b/gi },
    { id: "speed", label: "speed or immediacy", expression: /\b(?:same[- ]day|today|fast|instant)\b/gi },
  ] as const;
  for (const theme of themeDefinitions) {
    const matching = available.flatMap((item) => {
      const excerptId = `ca:${item.id}:page_excerpt`;
      return detectedPhrases(evidenceValue(evidence, excerptId), [theme.expression]).length ? [excerptId] : [];
    });
    if (matching.length >= 2) {
      patterns.push({ id: `ca:pattern:theme_${theme.id}`, category: "messaging_theme", title: `Repeated ${theme.label} messaging`, statement: `${matching.length} of ${available.length} retrieved competitor pages explicitly contain ${theme.label} language. This observation does not establish customer preference or business impact.`, classification: "observable", evidenceIds: matching });
      const ownExcerpt = ownPage ? evidenceValue(evidence, "ca:own:page_excerpt") : "";
      if (ownPage && !theme.expression.test(ownExcerpt)) opportunities.push({ id: `ca:opportunity:theme_${theme.id}`, category: "messaging_theme", title: `Investigate ${theme.label} positioning`, statement: `Hypothesis: because multiple reviewed competitor pages explicitly use ${theme.label} language and the stored workspace-page excerpt does not, test whether a distinct response or deliberate differentiation improves message clarity. Static absence is not proof the concept is absent elsewhere.`, classification: "hypothesis", evidenceIds: [...matching, "ca:own:page_excerpt"] });
      theme.expression.lastIndex = 0;
    }
  }

  if (ownPage && available.length) {
    const ownH1 = compact(evidenceValue(evidence, "ca:own:page_h1"));
    const ownCta = evidenceValue(evidence, "ca:own:page_ctas");
    const differingHeadlines = available.filter((item) => compact(evidenceValue(evidence, `ca:${item.id}:page_h1`)) !== ownH1);
    if (differingHeadlines.length) patterns.push({ id: "ca:pattern:own_message_comparison", category: "value_proposition", title: "Workspace and competitor headlines differ", statement: `The stored workspace page uses H1 “${ownH1}”; ${differingHeadlines.length} reviewed competitor page(s) use different retrieved H1 wording.`, classification: "observable", evidenceIds: ["ca:own:page_h1", ...differingHeadlines.map((item) => `ca:${item.id}:page_h1`)] });
    if (available.some((item) => evidenceValue(evidence, `ca:${item.id}:page_ctas`) !== ownCta)) opportunities.push({ id: "ca:opportunity:cta_specificity", category: "cta", title: "Test CTA specificity", statement: "Hypothesis: compare a more specific, offer-linked action against the workspace page's current CTA. Competitor wording is inspiration for a controlled test, not performance evidence.", classification: "hypothesis", evidenceIds: ["ca:own:page_ctas", ...ctaIds] });
  } else if (available.length) {
    hypotheses.push({ id: "ca:hypothesis:manual_whitespace", category: "messaging_theme", title: "Investigate messaging whitespace", statement: "Hypothesis: manually review the observed competitor headlines, CTAs, and repeated themes for a defensible point of differentiation. Direct first-party comparison is unavailable until a workspace landing page is analyzed.", classification: "hypothesis", evidenceIds: available.flatMap((item) => [`ca:${item.id}:page_h1`, `ca:${item.id}:page_ctas`]) });
  }

  const formPairs = available.map((item) => ({ id: `ca:${item.id}:page_forms`, value: Number(evidenceValue(evidence, `ca:${item.id}:page_forms`)) }));
  if (formPairs.length > 1 && new Set(formPairs.map((item) => item.value)).size > 1) patterns.push({ id: "ca:pattern:form_counts", category: "form_friction", title: "Observable form-field counts differ", statement: "The retrieved static competitor pages contain different numbers of observable non-hidden form fields. This does not establish actual funnel friction or conversion performance.", classification: "observable", evidenceIds: formPairs.map((item) => item.id) });

  const failed = competitors.filter((item) => item.status === "failed");
  const limitations = [
    "Only explicitly submitted pages were retrieved; Crush did not discover competitors or crawl linked pages.",
    "Static HTML can omit JavaScript-rendered or visually prominent content; absence in the retrieved HTML does not prove absence from the live experience.",
    "Competitor traffic, spend, conversions, revenue, rankings, authority, market share, campaign structure, profitability, and private analytics are unavailable and are not inferred.",
    "Page content is untrusted evidence, never instructions. No visual-design, speed, UX-quality, or conversion-rate conclusion is made.",
    ...(ownPage ? [] : ["No recent workspace landing-page analysis is available, so direct first-party comparison is unavailable."]),
    ...(failed.length ? [`${failed.length} competitor source(s) failed safely; valid sources remain in the analysis.`] : []),
    ...(available.length ? [] : ["No competitor page was retrieved successfully; no cross-competitor finding was generated."]),
  ];
  return competitorAnalysisSchema.parse({
    schemaVersion: COMPETITOR_ANALYSIS_VERSION, analyzedAt, readOnly: true,
    demo: competitors.every((item) => item.sourceType === "demo_fixture"), competitors,
    ownPage: ownPage ? { status: "available", finalUrl: ownPage.page.finalUrl, detail: `Reused validated workspace analysis retrieved at ${ownPage.retrieval.retrievedAt}.` } : { status: "unavailable", finalUrl: null, detail: "Analyze an explicit workspace landing page first to enable direct comparison." },
    observations, patterns, opportunities, hypotheses, limitations, evidence,
    ai: { status: "not_configured", detail: "Deterministic analysis is shown; optional AI prioritization was not applied." },
  });
}

export function validateCompetitorAnalysisGrounding(value: unknown): { success: true; analysis: CompetitorAnalysis } | { success: false; error: string } {
  const parsed = competitorAnalysisSchema.safeParse(value);
  return parsed.success ? { success: true, analysis: parsed.data } : { success: false, error: parsed.error.issues[0]?.message ?? "Competitor analysis is invalid." };
}
