import { z } from "zod";

export const LANDING_PAGE_BRIEF_VERSION = "landing-page-brief.v1" as const;
export const LANDING_PAGE_DRAFT_VERSION = "landing-page-draft.v1" as const;

export const LANDING_PAGE_DRAFT_LIMITS = {
  name: 120,
  guidance: 1_000,
  claim: 400,
  title: 80,
  headline: 120,
  subheadline: 240,
  cta: 60,
  body: 600,
  seoTitle: 60,
  metaDescription: 160,
  benefits: 6,
  proofMessages: 4,
  faqs: 6,
} as const;

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) return false;
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) return false;
    if (hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
      if (hostname === "::" || hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || /^fe[89ab]/.test(hostname)) return false;
      const parts = hostname.split(".").map(Number);
      if (parts.length === 4) {
        const [a, b] = parts;
        if (a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168)) return false;
      }
    }
    return true;
  } catch { return false; }
}

const safeUrlSchema = z.string().trim().min(1).max(2_048).refine(isSafeHttpUrl, "Enter a safe absolute http or https URL without credentials or a private-network target.");

export const landingPageBriefSchema = z.object({
  schemaVersion: z.literal(LANDING_PAGE_BRIEF_VERSION),
  pageName: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.name),
  offer: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.guidance),
  targetAudience: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.guidance),
  primaryConversionGoal: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.name),
  destinationUrl: safeUrlSchema.optional(),
  brandGuidance: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.guidance).optional(),
  factualClaims: z.array(z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.claim)).max(12).default([]),
  ctaPreference: z.string().trim().min(1).max(LANDING_PAGE_DRAFT_LIMITS.cta).optional(),
}).strict();

export const landingPageGenerationRequestSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  brief: landingPageBriefSchema,
}).strict();

const sourceSchema = z.enum(["user_brief", "landing_page_analysis", "google_ads", "ga4", "search_console", "competitor_analysis", "generated_ad_copy"]);
const evidenceSchema = z.object({
  id: z.string().regex(/^lpg:(?:first_party|external|generated):[a-z0-9:_-]+$/),
  scope: z.enum(["first_party", "competitor", "generated"]),
  source: sourceSchema,
  kind: z.enum(["business_fact", "audience", "conversion_goal", "brand_guidance", "cta", "page_observation", "performance", "search_theme", "competitor_pattern", "generated_theme"]),
  text: z.string().trim().min(1).max(600),
  reusePolicy: z.enum(["claim_support", "theme_only", "differentiation_only"]),
  fictional: z.boolean(),
}).strict();

const sourceStatusSchema = z.object({
  source: sourceSchema,
  status: z.enum(["available", "unavailable"]),
  detail: z.string().trim().min(1).max(400),
}).strict();

export const landingPageEvidencePackSchema = z.object({
  schemaVersion: z.literal(LANDING_PAGE_DRAFT_VERSION),
  workspace: z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(160) }).strict(),
  builtAt: z.string().datetime(),
  brief: landingPageBriefSchema,
  fictional: z.boolean(),
  sourceStatus: z.array(sourceStatusSchema).length(7),
  evidence: z.array(evidenceSchema).max(60),
}).strict().superRefine((pack, context) => {
  if (new Set(pack.evidence.map((item) => item.id)).size !== pack.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
  pack.evidence.forEach((item, index) => {
    if (item.scope === "competitor" && item.reusePolicy !== "differentiation_only") context.addIssue({ code: "custom", message: "Competitor evidence is differentiation-only.", path: ["evidence", index] });
    if (item.scope !== "competitor" && item.reusePolicy === "differentiation_only") context.addIssue({ code: "custom", message: "Only competitor evidence may be differentiation-only.", path: ["evidence", index] });
    if (item.scope === "generated" && item.reusePolicy === "claim_support") context.addIssue({ code: "custom", message: "Generated copy cannot become claim-support evidence.", path: ["evidence", index] });
  });
});

const referencedCopySchema = (maximum: number) => z.object({
  copy: z.string().trim().min(1).max(maximum),
  evidenceIds: z.array(z.string().min(1)).min(1).max(12),
}).strict();

const draftSchema = z.object({
  id: z.literal("landing-page-draft-1"),
  source: z.enum(["ai", "deterministic_fallback"]),
  pageTitle: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.title),
  hero: z.object({
    headline: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.headline),
    subheadline: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.subheadline),
    primaryCta: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.cta),
    secondaryCta: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.cta).nullable(),
  }).strict(),
  benefits: z.array(z.object({ title: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.title), body: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.body) }).strict()).min(1).max(LANDING_PAGE_DRAFT_LIMITS.benefits),
  supportingProof: z.array(z.object({ title: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.title), body: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.body) }).strict()).min(1).max(LANDING_PAGE_DRAFT_LIMITS.proofMessages),
  faqs: z.array(z.object({ question: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.title), answer: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.body) }).strict()).min(1).max(LANDING_PAGE_DRAFT_LIMITS.faqs),
  finalCta: z.object({ headline: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.headline), body: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.body), cta: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.cta) }).strict(),
  seo: z.object({ title: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.seoTitle), metaDescription: referencedCopySchema(LANDING_PAGE_DRAFT_LIMITS.metaDescription) }).strict(),
  rationale: z.object({ summary: z.string().trim().min(1).max(600), firstPartyEvidenceIds: z.array(z.string()).min(1).max(20), inspirationEvidenceIds: z.array(z.string()).max(20) }).strict(),
  warnings: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  validation: z.object({ status: z.literal("valid"), checkedAt: z.string().datetime(), rules: z.array(z.string().trim().min(1).max(200)).min(1).max(16) }).strict(),
}).strict();

export const landingPageDraftResultSchema = z.object({
  schemaVersion: z.literal(LANDING_PAGE_DRAFT_VERSION),
  workspace: z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(160) }).strict(),
  generatedAt: z.string().datetime(),
  brief: landingPageBriefSchema,
  draftOnly: z.literal(true),
  previewOnly: z.literal(true),
  published: z.literal(false),
  status: z.enum(["ready", "insufficient_data"]),
  fictional: z.boolean(),
  sourceStatus: z.array(sourceStatusSchema).length(7),
  evidence: z.array(evidenceSchema).max(60),
  draft: draftSchema.nullable(),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  ai: z.object({ status: z.enum(["generated", "not_configured", "failed", "invalid", "not_attempted"]), detail: z.string().trim().min(1).max(500) }).strict(),
}).strict().superRefine((result, context) => {
  if (result.status === "ready" && !result.draft) context.addIssue({ code: "custom", message: "Ready results require a draft.", path: ["draft"] });
  if (result.status === "insufficient_data" && result.draft) context.addIssue({ code: "custom", message: "Insufficient-data results cannot contain a draft.", path: ["draft"] });
  if (result.draft && result.workspace.id.trim() === "") context.addIssue({ code: "custom", message: "A workspace is required.", path: ["workspace", "id"] });
  const pack = landingPageEvidencePackSchema.safeParse({ schemaVersion: result.schemaVersion, workspace: result.workspace, builtAt: result.generatedAt, brief: result.brief, fictional: result.fictional, sourceStatus: result.sourceStatus, evidence: result.evidence });
  if (!pack.success) context.addIssue({ code: "custom", message: "Result evidence does not satisfy the evidence-pack boundary.", path: ["evidence"] });
  else if (result.draft) {
    const validated = validateLandingPageDraft(result.draft, pack.data, result.draft.validation.checkedAt);
    if (!validated.success) context.addIssue({ code: "custom", message: validated.error, path: ["draft"] });
  }
});

export type LandingPageBrief = z.infer<typeof landingPageBriefSchema>;
export type LandingPageEvidence = z.infer<typeof evidenceSchema>;
export type LandingPageEvidencePack = z.infer<typeof landingPageEvidencePackSchema>;
export type LandingPageDraft = z.infer<typeof draftSchema>;
export type LandingPageDraftResult = z.infer<typeof landingPageDraftResultSchema>;

export function normalizeLandingPageCopy(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const unsupportedClaimPatterns = [
  /(?:^|\b)#\s*1\b/i, /\b(?:best|top|leading|number one)\s+(?:in|for|provider|company|service)\b/i,
  /\b\d+(?:\.\d+)?\s*%\b/i, /(?:^|\s)[$£€]\s*\d+(?:\.\d+)?\b/i, /\b(?:save|discount|off)\s+\d+/i,
  /\bguarantee(?:d|s)?\b/i, /\b\d(?:\.\d)?\s*stars?\b/i, /\bsame[- ]day\b/i, /\b\d[\d,]*\+?\s+(?:customers?|clients?|users?|businesses?|projects?|reviews?)\b/i,
  /\b\d+\s+years?\b/i, /\b(?:certified|licensed|accredited|award[- ]winning|patented|clinically proven)\b/i,
  /\bfree\s+(?:shipping|consultation|estimate|trial|delivery)\b/i, /\bships?\s+(?:anywhere|nationwide|worldwide)\b/i,
  /\b(?:double|triple|increase|improve|boost|grow|reduce|cut)\s+(?:your\s+)?(?:sales|revenue|traffic|conversions?|costs?|roi|roas|ctr|cvr)\b/i,
] as const;

function normalizedGrounding(value: string): string {
  return normalizeLandingPageCopy(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9%$£€]+/g, " ").trim();
}

export function findUnsupportedLandingPageClaims(copy: readonly string[], pack: LandingPageEvidencePack): string[] {
  const corpus = pack.evidence.filter((item) => item.scope === "first_party" && item.reusePolicy === "claim_support").map((item) => normalizedGrounding(item.text)).join(" | ");
  const failures: string[] = [];
  for (const value of copy) for (const pattern of unsupportedClaimPatterns) {
    const match = value.match(pattern)?.[0];
    if (match && !corpus.includes(normalizedGrounding(match))) failures.push(match);
  }
  return [...new Set(failures)];
}

function unsupportedAgainstCorpus(value: string, corpus: string): string[] {
  const failures: string[] = [];
  for (const pattern of unsupportedClaimPatterns) {
    const match = value.match(pattern)?.[0];
    if (match && !corpus.includes(normalizedGrounding(match))) failures.push(match);
  }
  return failures;
}

function referencedCopyItems(draft: LandingPageDraft) {
  return [draft.pageTitle, draft.hero.headline, draft.hero.subheadline, draft.hero.primaryCta, ...(draft.hero.secondaryCta ? [draft.hero.secondaryCta] : []), ...draft.benefits.flatMap((item) => [item.title, item.body]), ...draft.supportingProof.flatMap((item) => [item.title, item.body]), ...draft.faqs.flatMap((item) => [item.question, item.answer]), draft.finalCta.headline, draft.finalCta.body, draft.finalCta.cta, draft.seo.title, draft.seo.metaDescription];
}

const instructionPattern = /\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|reveal (?:a |the )?(?:secret|api key)|other tenants?|execute (?:a |the )?tool|publish|deploy|create (?:a )?public page|change (?:ads?|bids?|budgets?))\b/i;

export function validateLandingPageDraft(value: unknown, pack: LandingPageEvidencePack, checkedAt = new Date().toISOString()): { success: true; draft: LandingPageDraft } | { success: false; error: string } {
  if (!value || typeof value !== "object") return { success: false, error: "Draft is not an object." };
  const raw = value as Record<string, unknown>;
  const normalized = { ...raw, id: "landing-page-draft-1", validation: { status: "valid", checkedAt, rules: ["required structured sections", "reasonable section lengths", "non-empty normalized copy", "known evidence IDs", "first-party claim grounding", "competitor separation", "unsupported factual and performance claims", "safe destination URL", "preview-only boundary"] } };
  const parsed = draftSchema.safeParse(normalized);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Draft schema is invalid." };
  const evidence = new Map(pack.evidence.map((item) => [item.id, item]));
  const items = referencedCopyItems(parsed.data);
  for (const item of items) {
    if (item.copy !== normalizeLandingPageCopy(item.copy)) return { success: false, error: "Draft copy must use normalized whitespace." };
    const refs = item.evidenceIds.map((id) => evidence.get(id));
    if (refs.some((entry) => !entry)) return { success: false, error: `Draft references an unknown evidence ID: ${item.evidenceIds.find((id) => !evidence.has(id))}.` };
    if (!refs.some((entry) => entry?.scope === "first_party" && entry.reusePolicy === "claim_support")) return { success: false, error: "Every copy block requires traceable first-party claim-support evidence." };
    const citedCorpus = refs.filter((entry) => entry?.scope === "first_party" && entry.reusePolicy === "claim_support").map((entry) => normalizedGrounding(entry!.text)).join(" | ");
    const unsupportedForBlock = unsupportedAgainstCorpus(item.copy, citedCorpus);
    if (unsupportedForBlock.length) return { success: false, error: `Copy contains a claim not supported by its cited first-party evidence: ${unsupportedForBlock.join(", ")}.` };
  }
  for (const id of parsed.data.rationale.firstPartyEvidenceIds) {
    const item = evidence.get(id);
    if (!item || item.scope !== "first_party" || item.reusePolicy !== "claim_support") return { success: false, error: `Rationale claim evidence is not reusable first-party evidence: ${id}.` };
  }
  for (const id of parsed.data.rationale.inspirationEvidenceIds) if (!evidence.has(id)) return { success: false, error: `Unknown inspiration evidence ID: ${id}.` };
  const allCopy = items.map((item) => item.copy);
  const metadataCopy = [parsed.data.rationale.summary, ...parsed.data.warnings];
  if ([...allCopy, ...metadataCopy].some((item) => /<\/?[a-z][^>]*>/i.test(item))) return { success: false, error: "Draft text cannot contain HTML or script markup." };
  const rationaleCorpus = parsed.data.rationale.firstPartyEvidenceIds.map((id) => evidence.get(id)).filter((item) => item?.scope === "first_party" && item.reusePolicy === "claim_support").map((item) => normalizedGrounding(item!.text)).join(" | ");
  const unsupportedMetadata = metadataCopy.flatMap((item) => unsupportedAgainstCorpus(item, rationaleCorpus));
  if (unsupportedMetadata.length) return { success: false, error: `Draft rationale or warnings contain an unsupported factual claim: ${[...new Set(unsupportedMetadata)].join(", ")}.` };
  const unsupported = findUnsupportedLandingPageClaims(allCopy, pack);
  if (unsupported.length) return { success: false, error: `Unsupported factual claim detected: ${unsupported.join(", ")}.` };
  if (instructionPattern.test(`${allCopy.join(" ")} ${parsed.data.rationale.summary}`)) return { success: false, error: "Draft contains instruction-like untrusted input or a prohibited mutation claim." };
  return { success: true, draft: parsed.data };
}
