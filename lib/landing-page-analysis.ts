import { z } from "zod";

import type { GA4DataState, GA4LandingPage } from "./ga4.ts";
import type { GoogleAdsCampaign, GoogleAdsLandingPage, GoogleAdsSearchTerm } from "./google-ads.ts";

export const LANDING_PAGE_ANALYSIS_VERSION = "landing-page-analysis.v1" as const;
export const LANDING_PAGE_DEMO_ID = "northstar-outdoor-co" as const;

export const landingPageRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo"), clientId: z.string().trim().min(1).max(100), fixtureId: z.literal(LANDING_PAGE_DEMO_ID) }).strict(),
  z.object({ mode: z.literal("url"), clientId: z.string().trim().min(1).max(100), url: z.string().trim().min(1).max(2_048) }).strict(),
]);

const evidenceSourceSchema = z.enum(["page_html", "ga4", "google_ads", "demo_fixture"]);
export const landingPageEvidenceSchema = z.object({
  id: z.string().regex(/^lp:[a-z0-9:_-]+$/),
  source: evidenceSourceSchema,
  kind: z.enum(["url", "metadata", "content", "structure", "accessibility", "performance", "campaign_context"]),
  label: z.string().trim().min(1).max(160),
  value: z.union([z.string().max(1_000), z.number().finite(), z.boolean()]),
  detail: z.string().trim().min(1).max(1_000),
}).strict();

const categorySchema = z.enum(["message_match", "content_clarity", "conversion_friction", "accessibility"]);
const analysisItemSchema = z.object({
  id: z.string().regex(/^lp:(?:observation|strength|issue):[a-z0-9_-]+$/),
  category: categorySchema,
  severity: z.enum(["info", "low", "medium", "high"]),
  title: z.string().trim().min(1).max(180),
  explanation: z.string().trim().min(1).max(900),
  evidenceIds: z.array(z.string()).min(1).max(10),
  hypothesis: z.boolean(),
}).strict();
const experimentSchema = z.object({
  id: z.string().regex(/^lp:experiment:[a-z0-9_-]+$/),
  category: categorySchema,
  priority: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(1).max(180),
  hypothesis: z.string().trim().min(1).max(900),
  test: z.string().trim().min(1).max(900),
  primaryMetric: z.string().trim().min(1).max(180),
  evidenceIds: z.array(z.string()).min(1).max(10),
  hypothesisFlag: z.literal(true),
}).strict();

export const landingPageAnalysisSchema = z.object({
  schemaVersion: z.literal(LANDING_PAGE_ANALYSIS_VERSION),
  page: z.object({ requestedUrl: z.string().url().max(2_048), finalUrl: z.string().url().max(2_048), title: z.string().max(300).nullable() }).strict(),
  analyzedAt: z.string().datetime(),
  retrieval: z.object({ status: z.literal("available"), retrievedAt: z.string().datetime(), source: z.enum(["live_url", "demo_fixture"]), redirectCount: z.number().int().min(0).max(3), bytes: z.number().int().positive(), contentType: z.string().max(200) }).strict(),
  sources: z.object({
    page: z.object({ status: z.literal("available"), label: z.string(), detail: z.string() }).strict(),
    ga4: z.object({ status: z.enum(["available", "unavailable", "unmatched"]), label: z.string(), detail: z.string() }).strict(),
    googleAds: z.object({ status: z.enum(["available", "unavailable", "unmatched"]), label: z.string(), detail: z.string() }).strict(),
    ai: z.object({ status: z.enum(["applied", "not_configured", "failed", "invalid"]), label: z.string(), detail: z.string() }).strict(),
  }).strict(),
  observations: z.array(analysisItemSchema).max(20),
  strengths: z.array(analysisItemSchema).max(12),
  issues: z.array(analysisItemSchema).max(16),
  experiments: z.array(experimentSchema).max(10),
  limitations: z.array(z.string().trim().min(1).max(600)).min(1).max(15),
  evidence: z.array(landingPageEvidenceSchema).min(1).max(60),
}).strict().superRefine((analysis, context) => {
  const evidenceIds = new Set(analysis.evidence.map((item) => item.id));
  const referenced = [...analysis.observations, ...analysis.strengths, ...analysis.issues, ...analysis.experiments];
  for (const [itemIndex, item] of referenced.entries()) {
    for (const evidenceId of item.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) context.addIssue({ code: "custom", message: `Unknown evidence ID: ${evidenceId}`, path: ["items", itemIndex, "evidenceIds"] });
    }
  }
  if (evidenceIds.size !== analysis.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
});

export type LandingPageAnalysis = z.infer<typeof landingPageAnalysisSchema>;
export type LandingPageEvidence = z.infer<typeof landingPageEvidenceSchema>;
export type LandingPageAnalysisItem = z.infer<typeof analysisItemSchema>;
export type LandingPageExperiment = z.infer<typeof experimentSchema>;

export type RetrievedLandingPage = {
  requestedUrl: string;
  finalUrl: string;
  html: string;
  retrievedAt: string;
  source: "live_url" | "demo_fixture";
  redirectCount: number;
  bytes: number;
  contentType: string;
};

export type LandingPageAnalysisContext = {
  ga4: GA4DataState;
  adsLandingPages?: readonly GoogleAdsLandingPage[];
  adsCampaigns?: readonly GoogleAdsCampaign[];
  searchTerms?: readonly GoogleAdsSearchTerm[];
  explicitDemoCampaignId?: string;
};

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function text(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "").trim() : undefined;
}

function elements(html: string, tag: string): Array<{ tag: string; inner: string }> {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi"))].map((match) => ({ tag: match[0].slice(0, match[0].indexOf(">") + 1), inner: match[1] }));
}

function normalizeUrl(value: string, base?: string): string | null {
  try {
    const parsed = new URL(value, base);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) parsed.port = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch { return null; }
}

function matchesGa4Page(row: GA4LandingPage, finalUrl: string): boolean {
  try {
    const final = new URL(finalUrl);
    const candidate = row.landingPage.split("?")[0]?.replace(/\/+$/, "") || "/";
    return candidate === final.pathname.replace(/\/+$/, "") || normalizeUrl(row.landingPage) === normalizeUrl(finalUrl);
  } catch { return false; }
}

function addEvidence(list: LandingPageEvidence[], value: Omit<LandingPageEvidence, "id">, id: string): string {
  const evidenceId = `lp:${id}`;
  list.push({ id: evidenceId, ...value });
  return evidenceId;
}

export function buildDeterministicLandingPageAnalysis(
  page: RetrievedLandingPage,
  context: LandingPageAnalysisContext,
  analyzedAt = new Date().toISOString(),
): LandingPageAnalysis {
  const safeHtml = page.html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const title = text(elements(safeHtml, "title")[0]?.inner ?? "").slice(0, 300) || null;
  const metaTag = [...safeHtml.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]).find((tag) => attribute(tag, "name")?.toLowerCase() === "description");
  const description = metaTag ? attribute(metaTag, "content")?.slice(0, 500) : undefined;
  const headings = [...safeHtml.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((m) => ({ level: Number(m[1]), text: text(m[2]).slice(0, 300) })).filter((h) => h.text);
  const h1 = headings.filter((h) => h.level === 1);
  const h2 = headings.filter((h) => h.level === 2);
  const buttons = elements(safeHtml, "button").map((item) => (text(item.inner) || attribute(item.tag, "aria-label") || "").slice(0, 160));
  const links = elements(safeHtml, "a").map((item) => (text(item.inner) || attribute(item.tag, "aria-label") || "").slice(0, 160));
  const inputs = [...safeHtml.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].map((m) => m[0]).filter((tag) => (attribute(tag, "type") ?? "text").toLowerCase() !== "hidden");
  const submitInputs = inputs.filter((tag) => ["submit", "button"].includes((attribute(tag, "type") ?? "").toLowerCase())).map((tag) => (attribute(tag, "value") || attribute(tag, "aria-label") || "").slice(0, 160));
  const ctaTexts = [...buttons, ...submitInputs, ...links.filter((label) => /\b(?:get|start|buy|shop|book|contact|talk|request|download|learn|browse|send|subscribe|try|join)\b/i.test(label))].filter(Boolean).slice(0, 12);
  const vagueCtas = ctaTexts.filter((label) => /^(?:submit|send|click here|learn more|continue|go)$/i.test(label.trim()));
  const forms = elements(safeHtml, "form");
  const images = [...safeHtml.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const missingAlt = images.filter((tag) => !attribute(tag, "alt")?.trim()).length;
  const labelsFor = new Set(elements(safeHtml, "label").map((item) => attribute(item.tag, "for")).filter(Boolean));
  const unlabeledFields = inputs.filter((tag) => {
    const id = attribute(tag, "id");
    return !(id && labelsFor.has(id)) && !attribute(tag, "aria-label") && !attribute(tag, "aria-labelledby");
  }).length;
  const unnamedControls = [...buttons, ...submitInputs, ...links].filter((label) => !label.trim()).length;
  const navLinks = elements(safeHtml, "nav").flatMap((nav) => elements(nav.inner, "a")).length;
  const visibleText = text(safeHtml).slice(0, 4_000);
  const wordCount = visibleText ? visibleText.split(/\s+/).length : 0;
  const trustSignals = [...new Set(visibleText.match(/\b(?:warranty|guarantee|reviews?|testimonials?|secure|certified|accredited|privacy|returns?|free shipping|money[- ]back)\b/gi) ?? [])].slice(0, 10);
  const headingSkip = headings.some((heading, index) => index > 0 && heading.level > headings[index - 1]!.level + 1);
  const evidence: LandingPageEvidence[] = [];
  const pageSource = page.source === "demo_fixture" ? "demo_fixture" : "page_html";
  const urlId = addEvidence(evidence, { source: pageSource, kind: "url", label: "Retrieved page URL", value: page.finalUrl, detail: `Requested ${page.requestedUrl}; final URL after ${page.redirectCount} redirect(s).` }, "page:url");
  const titleId = addEvidence(evidence, { source: pageSource, kind: "metadata", label: "Page title", value: title ?? "Not present", detail: title ? `HTML title: ${title}` : "No non-empty HTML title was found." }, "page:title");
  const descriptionId = addEvidence(evidence, { source: pageSource, kind: "metadata", label: "Meta description", value: description ?? "Not present", detail: description ? `Meta description: ${description}` : "No meta description was found." }, "page:meta_description");
  const h1Id = addEvidence(evidence, { source: pageSource, kind: "content", label: "H1 text", value: h1.map((item) => item.text).join(" | ").slice(0, 1_000) || "Not present", detail: `${h1.length} H1 element(s) found.` }, "page:h1");
  const h2Id = addEvidence(evidence, { source: pageSource, kind: "content", label: "H2 text", value: h2.map((item) => item.text).join(" | ").slice(0, 1_000) || "Not present", detail: `${h2.length} H2 element(s) found.` }, "page:h2");
  const ctaId = addEvidence(evidence, { source: pageSource, kind: "content", label: "CTA candidates", value: ctaTexts.join(" | ").slice(0, 1_000) || "None detected", detail: `${ctaTexts.length} CTA candidate(s) extracted from named buttons, submit controls, and action-oriented links; ${vagueCtas.length} use a bounded generic label.` }, "page:ctas");
  const structureId = addEvidence(evidence, { source: pageSource, kind: "structure", label: "Page structure", value: wordCount, detail: `${wordCount} visible-text words, ${links.length} links, ${buttons.length + submitInputs.length} button/submit controls, ${navLinks} navigation links, and ${forms.length} forms.` }, "page:structure");
  const formId = addEvidence(evidence, { source: pageSource, kind: "structure", label: "Observable form fields", value: inputs.length, detail: `${forms.length} form(s), ${inputs.length} non-hidden field(s), and ${unlabeledFields} field(s) without an explicit label/ARIA naming signal.` }, "page:forms");
  const imageId = addEvidence(evidence, { source: pageSource, kind: "accessibility", label: "Image alt-text signals", value: missingAlt, detail: `${images.length} image(s); ${missingAlt} without non-empty alt text. Decorative-image intent cannot be inferred.` }, "page:image_alt");
  const headingId = addEvidence(evidence, { source: pageSource, kind: "accessibility", label: "Heading structure signals", value: headingSkip, detail: `${headings.length} heading(s), ${h1.length} H1(s), heading-level skip detected: ${headingSkip ? "yes" : "no"}.` }, "page:headings");
  const controlId = addEvidence(evidence, { source: pageSource, kind: "accessibility", label: "Control naming signals", value: unnamedControls, detail: `${unnamedControls} link/button control(s) lack deterministically extractable visible or ARIA text.` }, "page:control_names");
  const excerptId = addEvidence(evidence, { source: pageSource, kind: "content", label: "Visible-content excerpt", value: visibleText.slice(0, 1_000) || "No visible text", detail: "Sanitized text excerpt; embedded instructions are untrusted page data and are never treated as model instructions." }, "page:excerpt");
  const trustId = addEvidence(evidence, { source: pageSource, kind: "content", label: "Trust/reassurance text signals", value: trustSignals.join(" | ") || "None detected", detail: `${trustSignals.length} reassurance keyword signal(s) found in static text. Presence does not establish prominence, credibility, or completeness.` }, "page:trust_signals");

  const matchedGa4 = context.ga4.status === "available" ? context.ga4.data.landingPages.filter((row) => matchesGa4Page(row, page.finalUrl)) : [];
  let ga4EvidenceId: string | undefined;
  if (matchedGa4.length) {
    const sessions = matchedGa4.reduce((sum, row) => sum + row.sessions, 0);
    const keyEvents = matchedGa4.reduce((sum, row) => sum + row.keyEvents, 0);
    ga4EvidenceId = addEvidence(evidence, { source: "ga4", kind: "performance", label: "Matched GA4 landing-page performance", value: sessions, detail: `${sessions} sessions and ${keyEvents} key events; calculated key-event rate ${sessions ? ((keyEvents / sessions) * 100).toFixed(2) : "unavailable"}% for exact URL/path matches.` }, "ga4:landing_page");
  }
  const normalizedFinal = normalizeUrl(page.finalUrl);
  let matchedAds = (context.adsLandingPages ?? []).filter((row) => normalizeUrl(row.finalUrl) === normalizedFinal);
  if (page.source === "demo_fixture" && context.explicitDemoCampaignId) {
    const campaign = context.adsCampaigns?.find((item) => item.id === context.explicitDemoCampaignId);
    if (campaign && matchedAds.length === 0) matchedAds = [{ id: "demo-explicit-map", campaignId: campaign.id, campaignName: campaign.name, finalUrl: page.finalUrl, ...campaign.metrics }];
  }
  let adsEvidenceId: string | undefined;
  if (matchedAds.length) {
    const ids = new Set(matchedAds.map((row) => row.campaignId));
    const terms = (context.searchTerms ?? []).filter((row) => ids.has(row.campaignId)).map((row) => row.searchTerm).slice(0, 8);
    adsEvidenceId = addEvidence(evidence, { source: page.source === "demo_fixture" ? "demo_fixture" : "google_ads", kind: "campaign_context", label: "Mapped Google Ads context", value: matchedAds.map((row) => row.campaignName).join(" | ").slice(0, 1_000), detail: `${page.source === "demo_fixture" ? "Bundled fictional fixture declaration" : "Exact final-URL evidence"} maps ${matchedAds.length} row(s).${terms.length ? ` Associated search terms: ${terms.join(", ")}.` : " No search-term evidence was available."}`.slice(0, 1_000) }, "ads:page_mapping");
  }

  const observations: LandingPageAnalysisItem[] = [
    { id: "lp:observation:headline", category: "content_clarity", severity: "info", title: "Headline and supporting content captured", explanation: h1.length ? `The page exposes ${h1.length} H1 and ${h2.length} H2 headings for review.` : "No H1 was deterministically observed.", evidenceIds: [urlId, h1Id, h2Id, excerptId], hypothesis: false },
    { id: "lp:observation:actions", category: "conversion_friction", severity: "info", title: "Primary action candidates captured", explanation: `${ctaTexts.length} action-oriented CTA candidates and ${forms.length} form(s) were observed in static HTML.`, evidenceIds: [ctaId, structureId, formId], hypothesis: false },
    { id: "lp:observation:accessibility", category: "accessibility", severity: "info", title: "Basic HTML accessibility signals checked", explanation: "Image alternatives, heading order, field labels, and control names were checked without executing JavaScript.", evidenceIds: [imageId, headingId, formId, controlId], hypothesis: false },
  ];
  if (ga4EvidenceId) observations.push({ id: "lp:observation:ga4_context", category: "conversion_friction", severity: "info", title: "Matched GA4 outcome context captured", explanation: "Exact URL/path matching found page-level sessions and key events. These outcomes do not diagnose page causes.", evidenceIds: [ga4EvidenceId], hypothesis: false });
  const strengths: LandingPageAnalysisItem[] = [];
  const issues: LandingPageAnalysisItem[] = [];
  const experiments: LandingPageExperiment[] = [];
  if (title && description && h1.length === 1) strengths.push({ id: "lp:strength:metadata_hierarchy", category: "content_clarity", severity: "info", title: "Core page framing is present", explanation: "A title, meta description, and single H1 provide a reviewable content hierarchy.", evidenceIds: [titleId, descriptionId, h1Id], hypothesis: false });
  if (headings.length >= 2 && wordCount <= 800) strengths.push({ id: "lp:strength:scannability", category: "content_clarity", severity: "info", title: "Static content has scannability signals", explanation: "The observed text is divided by multiple headings and remains within the bounded long-copy threshold.", evidenceIds: [structureId, headingId], hypothesis: false });
  if (trustSignals.length) strengths.push({ id: "lp:strength:trust_signal", category: "conversion_friction", severity: "info", title: "Reassurance language is present", explanation: "Static text contains a common trust or reassurance term; manual review should confirm its prominence and substantiation.", evidenceIds: [trustId], hypothesis: false });
  else issues.push({ id: "lp:issue:trust_signal", category: "conversion_friction", severity: "low", title: "Trust or reassurance language was not detected", explanation: "No common reassurance term was found in bounded static text. This does not prove that visual or dynamic trust signals are absent.", evidenceIds: [trustId, excerptId], hypothesis: true });
  if (wordCount > 800 && headings.length < 4) issues.push({ id: "lp:issue:scannability", category: "content_clarity", severity: "medium", title: "Long static copy has limited heading breaks", explanation: `${wordCount} visible-text words are organized under ${headings.length} headings, which warrants a scannability review.`, evidenceIds: [structureId, headingId], hypothesis: true });
  if (title && h1.length) {
    const titleWords = new Set(title.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 4));
    const headlineWords = new Set(h1[0]!.text.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 4));
    if (titleWords.size && ![...titleWords].some((word) => headlineWords.has(word))) issues.push({ id: "lp:issue:headline_clarity", category: "content_clarity", severity: "medium", title: "Headline does not echo the page-title topic", explanation: "No meaningful word overlap was found between the title and primary headline. This flags proposition clarity for human review; it is not a semantic quality judgment.", evidenceIds: [titleId, h1Id], hypothesis: true });
  }
  if (!h1.length || h1.length > 1) issues.push({ id: "lp:issue:h1_structure", category: "content_clarity", severity: "medium", title: h1.length ? "Multiple primary headings" : "Primary heading not found", explanation: h1.length ? "Multiple H1 elements can make the page's primary proposition less explicit." : "Static HTML did not expose an H1 that states the primary proposition.", evidenceIds: [h1Id], hypothesis: true });
  if (!ctaTexts.length) issues.push({ id: "lp:issue:cta_missing", category: "conversion_friction", severity: "high", title: "Prominent next action is not evident", explanation: "No named action-oriented link or button was deterministically extracted from static HTML.", evidenceIds: [ctaId, structureId], hypothesis: true });
  if (vagueCtas.length) issues.push({ id: "lp:issue:cta_clarity", category: "conversion_friction", severity: "medium", title: "A CTA uses a generic action label", explanation: `The label “${vagueCtas[0]}” does not state the expected outcome. Its surrounding visual context was not evaluated.`, evidenceIds: [ctaId], hypothesis: true });
  if (ctaTexts.length > 5) issues.push({ id: "lp:issue:cta_competition", category: "conversion_friction", severity: "medium", title: "Many action candidates may compete", explanation: "The number of action-oriented controls warrants a manual hierarchy review; count alone does not prove distraction.", evidenceIds: [ctaId, structureId], hypothesis: true });
  if (inputs.length >= 4) issues.push({ id: "lp:issue:form_length", category: "conversion_friction", severity: "medium", title: "Observable form requests several fields", explanation: `${inputs.length} non-hidden fields are present. Whether this is excessive depends on offer value and lead qualification needs.`, evidenceIds: [formId], hypothesis: true });
  if (navLinks >= 5) issues.push({ id: "lp:issue:navigation_competition", category: "conversion_friction", severity: "low", title: "Navigation offers competing paths", explanation: `${navLinks} navigation links create alternative exits; this is a review signal, not proof of conversion loss.`, evidenceIds: [structureId], hypothesis: true });
  if (missingAlt > 0) issues.push({ id: "lp:issue:image_alt", category: "accessibility", severity: "medium", title: "Image alternative-text signal is incomplete", explanation: `${missingAlt} image(s) have no non-empty alt attribute. A reviewer must determine whether each is informative or decorative.`, evidenceIds: [imageId], hypothesis: false });
  if (unlabeledFields > 0) issues.push({ id: "lp:issue:form_labels", category: "accessibility", severity: "high", title: "Form labeling signals are incomplete", explanation: `${unlabeledFields} field(s) have no explicit label or ARIA naming signal in static HTML. Placeholder text is not counted as a label.`, evidenceIds: [formId], hypothesis: false });
  if (headingSkip) issues.push({ id: "lp:issue:heading_order", category: "accessibility", severity: "low", title: "Heading level is skipped", explanation: "The static heading sequence skips a level and should be reviewed for semantic structure.", evidenceIds: [headingId], hypothesis: false });
  if (unnamedControls > 0) issues.push({ id: "lp:issue:control_names", category: "accessibility", severity: "high", title: "Unnamed interactive controls detected", explanation: `${unnamedControls} link/button control(s) lack extractable visible or ARIA naming text.`, evidenceIds: [controlId], hypothesis: false });
  if (adsEvidenceId) {
    const h1Words = new Set(h1.flatMap((item) => item.text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 3));
    const mappedTerms = context.searchTerms?.filter((term) => matchedAds.some((row) => row.campaignId === term.campaignId)) ?? [];
    const intentWords = new Set(mappedTerms.flatMap((term) => term.searchTerm.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 3));
    const overlap = [...intentWords].some((word) => h1Words.has(word));
    if (intentWords.size && !overlap) issues.push({ id: "lp:issue:message_match", category: "message_match", severity: "high", title: "Paid-search language is not echoed in the H1", explanation: "No meaningful word overlap was found between mapped search-term evidence and the H1. This flags a message-match review; it does not prove user confusion.", evidenceIds: [adsEvidenceId, h1Id], hypothesis: true });
    else strengths.push({ id: "lp:strength:message_match", category: "message_match", severity: "info", title: "Headline reflects mapped paid-search language", explanation: "The H1 shares meaningful language with explicitly mapped search-term evidence.", evidenceIds: [adsEvidenceId, h1Id], hypothesis: false });
  }
  const messageIssue = issues.find((item) => item.id === "lp:issue:message_match");
  if (messageIssue) experiments.push({ id: "lp:experiment:message_match", category: "message_match", priority: "high", title: "Test intent-specific headline framing", hypothesis: "Hypothesis: echoing the mapped paid-search intent more explicitly in the headline may improve qualified visitors' understanding.", test: "Compare the current page with a reviewed variant whose headline and supporting copy reflect the mapped query theme while keeping offer and traffic allocation controlled.", primaryMetric: "GA4 key-event rate for the mapped landing page", evidenceIds: messageIssue.evidenceIds, hypothesisFlag: true });
  if (issues.some((item) => item.id === "lp:issue:form_length")) experiments.push({ id: "lp:experiment:form_scope", category: "conversion_friction", priority: "medium", title: "Test a reduced first-step form", hypothesis: "Hypothesis: asking for fewer fields initially may reduce observable form friction without reducing lead usefulness.", test: "Compare the current form with a reviewed variant that defers nonessential fields; monitor completion and downstream lead quality.", primaryMetric: "Form completion rate plus qualified-lead rate", evidenceIds: [formId], hypothesisFlag: true });
  if (issues.some((item) => item.id === "lp:issue:navigation_competition")) experiments.push({ id: "lp:experiment:navigation_focus", category: "conversion_friction", priority: "low", title: "Test a more focused navigation treatment", hypothesis: "Hypothesis: reducing competing navigation paths for paid traffic may make the intended next action clearer.", test: "Compare current navigation with a reviewed reduced-navigation variant while monitoring primary conversions and helpful support-path use.", primaryMetric: "Primary CTA completion rate", evidenceIds: [structureId, ctaId], hypothesisFlag: true });
  if (!experiments.length && issues.length) experiments.push({ id: "lp:experiment:clarity_review", category: issues[0]!.category, priority: "low", title: "Validate the highest-priority page signal", hypothesis: `Hypothesis: resolving “${issues[0]!.title}” may make the page easier to understand or use.`, test: "Create one reviewed variant that changes only this signal, define the primary outcome in advance, and run a controlled experiment with adequate sample size.", primaryMetric: "Predefined landing-page key-event rate", evidenceIds: issues[0]!.evidenceIds, hypothesisFlag: true });

  const ga4Status = matchedGa4.length ? { status: "available" as const, label: "GA4 landing-page metrics", detail: "An exact URL/path match was found; GA4 remains a separate source." } : { status: context.ga4.status === "available" ? "unmatched" as const : "unavailable" as const, label: "GA4 landing-page metrics", detail: context.ga4.status === "available" ? "GA4 is connected, but no exact landing-page URL/path match was found." : "GA4 landing-page metrics are unavailable." };
  const adsStatus = matchedAds.length ? { status: "available" as const, label: "Google Ads page mapping", detail: page.source === "demo_fixture" ? "The fictional fixture explicitly declares this campaign/page relationship; it is not a live account mapping." : "An exact Google Ads final-URL mapping was found; Ads remains a separate source." } : { status: (context.adsLandingPages?.length ? "unmatched" : "unavailable") as "unmatched" | "unavailable", label: "Google Ads page mapping", detail: context.adsLandingPages?.length ? "Landing-page rows exist, but no exact final-URL mapping was found." : "No campaign/page mapping is available." };
  const limitations = [
    "This is a static HTML signal review, not a full WCAG audit, usability study, performance test, or rendered-page evaluation.",
    "Page observations and experiment ideas do not establish causation or guarantee conversion lift.",
    ga4Status.status === "available" ? "GA4 association is an exact URL/path match, but attribution definitions and sample sufficiency still require review." : ga4Status.detail,
    adsStatus.status === "available" ? "Google Ads mapping supplies campaign/search intent context only; it does not prove visitor intent or page impact." : adsStatus.detail,
    matchedGa4.length && matchedGa4.reduce((sum, row) => sum + row.sessions, 0) < 100 ? "Matched GA4 session volume is below 100; performance evidence may be insufficient for prioritization." : "Experiment sample-size adequacy is not established by this analysis.",
    "JavaScript-rendered content, visual prominence, color contrast, keyboard behavior, form behavior, and trust-signal quality are not observed.",
  ];
  const severityRank = { high: 3, medium: 2, low: 1, info: 0 } as const;
  const priorityRank = { high: 3, medium: 2, low: 1 } as const;
  const sortedIssues = [...issues].sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || left.id.localeCompare(right.id));
  const sortedExperiments = [...experiments].sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority] || left.id.localeCompare(right.id));
  return landingPageAnalysisSchema.parse({
    schemaVersion: LANDING_PAGE_ANALYSIS_VERSION,
    page: { requestedUrl: page.requestedUrl, finalUrl: page.finalUrl, title }, analyzedAt,
    retrieval: { status: "available", retrievedAt: page.retrievedAt, source: page.source, redirectCount: page.redirectCount, bytes: page.bytes, contentType: page.contentType },
    sources: { page: { status: "available", label: page.source === "demo_fixture" ? "Bundled fictional demo HTML" : "Retrieved static HTML", detail: `${page.bytes.toLocaleString()} bytes retrieved at ${page.retrievedAt}.` }, ga4: ga4Status, googleAds: adsStatus, ai: { status: "not_configured", label: "Optional AI prioritization", detail: "Deterministic analysis is shown; AI prioritization was not applied." } },
    observations, strengths, issues: sortedIssues, experiments: sortedExperiments, limitations, evidence,
  });
}

export function validateLandingPageAnalysisGrounding(value: unknown): { success: true; analysis: LandingPageAnalysis } | { success: false; error: string } {
  const result = landingPageAnalysisSchema.safeParse(value);
  return result.success ? { success: true, analysis: result.data } : { success: false, error: result.error.issues[0]?.message ?? "Landing-page analysis is invalid." };
}
