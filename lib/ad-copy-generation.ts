import { z } from "zod";

export const AD_COPY_SCHEMA_VERSION = "ad-copy-draft.v1" as const;
export const AD_COPY_FORMAT = "google_responsive_search_ad" as const;
export const AD_COPY_LIMITS = {
  headline: { minItems: 3, maxItems: 15, maxCharacters: 30 },
  description: { minItems: 2, maxItems: 4, maxCharacters: 90 },
  maxDrafts: 3,
  maxObjectiveCharacters: 200,
} as const;

export const adCopyDraftRequestSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  objective: z.string().trim().max(AD_COPY_LIMITS.maxObjectiveCharacters).optional(),
}).strict();

const evidenceSchema = z.object({
  id: z.string().regex(/^ac:(?:first_party|external):[a-z0-9:_-]+$/),
  scope: z.enum(["first_party", "competitor"]),
  source: z.enum(["workspace_landing_page", "google_ads_keyword", "google_ads_search_term", "google_ads_campaign", "search_console_query", "competitor_page"]),
  kind: z.enum(["business_language", "cta", "search_theme", "campaign_context", "competitor_pattern"]),
  text: z.string().trim().min(1).max(300),
  reusePolicy: z.enum(["claim_and_theme", "theme_only", "differentiation_only"]),
  observed: z.literal(true),
  fictional: z.boolean(),
}).strict();

const sourceStatusSchema = z.object({
  source: z.enum(["workspace_landing_page", "google_ads", "search_console", "competitor_analysis"]),
  status: z.enum(["available", "unavailable"]),
  detail: z.string().trim().min(1).max(300),
}).strict();

export const adCopyEvidencePackSchema = z.object({
  schemaVersion: z.literal(AD_COPY_SCHEMA_VERSION),
  workspace: z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(160) }).strict(),
  builtAt: z.string().datetime(),
  objective: z.string().trim().max(AD_COPY_LIMITS.maxObjectiveCharacters).nullable(),
  fictional: z.boolean(),
  sourceStatus: z.array(sourceStatusSchema).length(4),
  evidence: z.array(evidenceSchema).max(40),
}).strict().superRefine((pack, context) => {
  if (new Set(pack.evidence.map((item) => item.id)).size !== pack.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
  for (const [index, item] of pack.evidence.entries()) {
    if (item.scope === "competitor" && item.reusePolicy !== "differentiation_only") context.addIssue({ code: "custom", message: "Competitor evidence is differentiation-only.", path: ["evidence", index, "reusePolicy"] });
    if (item.scope === "first_party" && item.reusePolicy === "differentiation_only") context.addIssue({ code: "custom", message: "First-party evidence cannot be competitor-only.", path: ["evidence", index, "reusePolicy"] });
  }
});

export function googleAdsCharacterCount(value: string): number {
  return [...value].reduce((total, character) => total + (/[ᄀ-ᅟ〈〉⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦]/u.test(character) ? 2 : 1), 0);
}

export function normalizeAdCopy(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

const candidateSchema = z.object({
  id: z.string().regex(/^draft-[1-3]$/),
  source: z.enum(["ai", "deterministic_fallback"]),
  creativeAngle: z.string().trim().min(1).max(120),
  rationale: z.string().trim().min(1).max(500),
  headlines: z.array(z.string()).min(AD_COPY_LIMITS.headline.minItems).max(AD_COPY_LIMITS.headline.maxItems),
  descriptions: z.array(z.string()).min(AD_COPY_LIMITS.description.minItems).max(AD_COPY_LIMITS.description.maxItems),
  claimEvidenceIds: z.array(z.string()).min(1).max(12),
  inspirationEvidenceIds: z.array(z.string()).max(12),
  validation: z.object({ status: z.literal("valid"), checkedAt: z.string().datetime(), rules: z.array(z.string().trim().min(1).max(200)).min(1).max(12) }).strict(),
}).strict();

export const adCopyDraftResultSchema = z.object({
  schemaVersion: z.literal(AD_COPY_SCHEMA_VERSION),
  workspace: z.object({ id: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(160) }).strict(),
  generatedAt: z.string().datetime(),
  format: z.literal(AD_COPY_FORMAT),
  draftOnly: z.literal(true),
  published: z.literal(false),
  status: z.enum(["ready", "insufficient_data"]),
  fictional: z.boolean(),
  objective: z.string().trim().max(AD_COPY_LIMITS.maxObjectiveCharacters).nullable(),
  sourceStatus: z.array(sourceStatusSchema).length(4),
  evidence: z.array(evidenceSchema).max(40),
  candidates: z.array(candidateSchema).max(AD_COPY_LIMITS.maxDrafts),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  ai: z.object({ status: z.enum(["generated", "not_configured", "failed", "invalid", "not_attempted"]), detail: z.string().trim().min(1).max(400) }).strict(),
}).strict().superRefine((result, context) => {
  const evidence = new Map(result.evidence.map((item) => [item.id, item]));
  if (evidence.size !== result.evidence.length) context.addIssue({ code: "custom", message: "Evidence IDs must be unique.", path: ["evidence"] });
  result.evidence.forEach((item, index) => {
    if (item.scope === "competitor" && item.reusePolicy !== "differentiation_only") context.addIssue({ code: "custom", message: "Competitor evidence is differentiation-only.", path: ["evidence", index, "reusePolicy"] });
    if (item.scope === "first_party" && item.reusePolicy === "differentiation_only") context.addIssue({ code: "custom", message: "First-party evidence cannot be competitor-only.", path: ["evidence", index, "reusePolicy"] });
  });
  if (result.status === "ready" && result.candidates.length === 0) context.addIssue({ code: "custom", message: "Ready results require a candidate.", path: ["candidates"] });
  if (result.status === "insufficient_data" && result.candidates.length > 0) context.addIssue({ code: "custom", message: "Insufficient-data results cannot contain drafts.", path: ["candidates"] });
  for (const [candidateIndex, candidate] of result.candidates.entries()) {
    for (const [field, values, limit] of [["headlines", candidate.headlines, AD_COPY_LIMITS.headline.maxCharacters], ["descriptions", candidate.descriptions, AD_COPY_LIMITS.description.maxCharacters]] as const) {
      const normalized = values.map(normalizeAdCopy);
      normalized.forEach((value, index) => {
        if (!value) context.addIssue({ code: "custom", message: "Ad copy cannot be empty.", path: ["candidates", candidateIndex, field, index] });
        if (value !== values[index]) context.addIssue({ code: "custom", message: "Ad copy must use normalized whitespace.", path: ["candidates", candidateIndex, field, index] });
        if (googleAdsCharacterCount(value) > limit) context.addIssue({ code: "custom", message: `${field === "headlines" ? "Headline" : "Description"} exceeds ${limit} characters.`, path: ["candidates", candidateIndex, field, index] });
      });
      if (new Set(normalized.map((value) => value.toLocaleLowerCase("en-US"))).size !== normalized.length) context.addIssue({ code: "custom", message: `Duplicate ${field} are not allowed.`, path: ["candidates", candidateIndex, field] });
    }
    for (const id of candidate.claimEvidenceIds) {
      const item = evidence.get(id);
      if (!item) context.addIssue({ code: "custom", message: `Unknown evidence ID: ${id}`, path: ["candidates", candidateIndex, "claimEvidenceIds"] });
      else if (item.scope !== "first_party" || item.reusePolicy !== "claim_and_theme") context.addIssue({ code: "custom", message: `Claim evidence must be reusable first-party evidence: ${id}`, path: ["candidates", candidateIndex, "claimEvidenceIds"] });
    }
    for (const id of candidate.inspirationEvidenceIds) if (!evidence.has(id)) context.addIssue({ code: "custom", message: `Unknown evidence ID: ${id}`, path: ["candidates", candidateIndex, "inspirationEvidenceIds"] });
  }
});

export type AdCopyEvidence = z.infer<typeof evidenceSchema>;
export type AdCopyEvidencePack = z.infer<typeof adCopyEvidencePackSchema>;
export type AdCopyDraftCandidate = z.infer<typeof candidateSchema>;
export type AdCopyDraftResult = z.infer<typeof adCopyDraftResultSchema>;

const riskyClaims = [
  /(?:^|\b)#\s*1\b/i, /\bbest in\b/i, /\bsave\s+\d+\s*%/i, /\b\d+\s*%\s+off\b/i,
  /\b\d+(?:\.\d+)?\s*%\b/i, /(?:^|\s)[$£€]\s*\d+(?:\.\d+)?\b/i,
  /\bguaranteed?\b/i, /\b\d(?:\.\d)?\s*stars?\b/i, /\bsame[- ]day\b/i,
  /\b\d+\s+years?\b/i, /\bcertified\b/i, /\baward[- ]winning\b/i,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty)\s+years?\b/i,
  /\bfree (?:shipping|consultation|estimate|trial|delivery)\b/i,
  /\bships? (?:anywhere|nationwide|worldwide)\b/i,
] as const;

function normalizedForGrounding(value: string): string {
  return normalizeAdCopy(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9%]+/g, " ").trim();
}

export function findUnsupportedClaims(copy: readonly string[], pack: AdCopyEvidencePack): string[] {
  const corpus = pack.evidence.filter((item) => item.scope === "first_party" && item.reusePolicy === "claim_and_theme").map((item) => normalizedForGrounding(item.text)).join(" | ");
  const failures: string[] = [];
  for (const value of copy) {
    for (const pattern of riskyClaims) {
      const match = value.match(pattern)?.[0];
      if (match && !corpus.includes(normalizedForGrounding(match))) failures.push(match);
    }
  }
  return [...new Set(failures)];
}

export function validateAdCopyCandidate(value: unknown, pack: AdCopyEvidencePack, checkedAt = new Date().toISOString()): { success: true; candidate: AdCopyDraftCandidate } | { success: false; error: string } {
  if (!value || typeof value !== "object") return { success: false, error: "Draft is not an object." };
  const raw = value as Record<string, unknown>;
  const normalized = {
    ...raw,
    headlines: Array.isArray(raw.headlines) ? raw.headlines.map((item) => typeof item === "string" ? normalizeAdCopy(item) : item) : raw.headlines,
    descriptions: Array.isArray(raw.descriptions) ? raw.descriptions.map((item) => typeof item === "string" ? normalizeAdCopy(item) : item) : raw.descriptions,
    validation: { status: "valid", checkedAt, rules: ["RSA item counts", "30-character headlines", "90-character descriptions", "non-empty normalized copy", "no duplicates", "known evidence IDs", "first-party claim grounding", "unsupported high-risk claims"] },
  };
  const parsed = candidateSchema.safeParse(normalized);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Draft schema is invalid." };
  const shell = adCopyDraftResultSchema.safeParse({ schemaVersion: AD_COPY_SCHEMA_VERSION, workspace: pack.workspace, generatedAt: checkedAt, format: AD_COPY_FORMAT, draftOnly: true, published: false, status: "ready", fictional: pack.fictional, objective: pack.objective, sourceStatus: pack.sourceStatus, evidence: pack.evidence, candidates: [parsed.data], limitations: ["Draft only."], ai: { status: "not_attempted", detail: "Validation shell." } });
  if (!shell.success) return { success: false, error: shell.error.issues[0]?.message ?? "Draft grounding is invalid." };
  const unsupported = findUnsupportedClaims([...parsed.data.headlines, ...parsed.data.descriptions], pack);
  if (unsupported.length) return { success: false, error: `Unsupported factual claim detected: ${unsupported.join(", ")}.` };
  if (/\b(?:ignore (?:all |any )?(?:previous|prior) instructions?|system prompt|developer message|reveal (?:a |the )?(?:secret|api key)|other tenants?|execute (?:a |the )?tool|publish (?:the |these )?ads?|upload (?:the |these )?ads?)\b/i.test(`${parsed.data.creativeAngle} ${parsed.data.rationale} ${parsed.data.headlines.join(" ")} ${parsed.data.descriptions.join(" ")}`)) return { success: false, error: "Draft contains instruction-like untrusted page or objective content." };
  if (/\b(?:we|crush|i)\s+(?:have\s+)?(?:published|uploaded|applied|created|paused|enabled|changed)\b[\s\S]{0,40}\b(?:ads?|campaigns?|bids?|budgets?)\b/i.test(`${parsed.data.creativeAngle} ${parsed.data.rationale}`)) return { success: false, error: "Draft metadata represents a prohibited advertising mutation as performed." };
  return { success: true, candidate: parsed.data };
}
