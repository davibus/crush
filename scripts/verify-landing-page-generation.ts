import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildDeterministicLandingPageFallback, generateLandingPageResult } from "../lib/landing-page-generation-ai.ts";
import { LANDING_PAGE_BRIEF_VERSION, LANDING_PAGE_DRAFT_VERSION, findUnsupportedLandingPageClaims, landingPageBriefSchema, landingPageDraftResultSchema, landingPageEvidencePackSchema, validateLandingPageDraft, type LandingPageEvidencePack } from "../lib/landing-page-generation.ts";
import { clearWorkspaceLandingPageDrafts, getWorkspaceLandingPageDraft, setWorkspaceLandingPageDraft } from "../lib/landing-page-generation-store.ts";

const now = "2026-09-08T12:00:00.000Z";
const brief = landingPageBriefSchema.parse({ schemaVersion: LANDING_PAGE_BRIEF_VERSION, pageName: "Northstar Weekend Gear", offer: "Durable camping gear for weekends outside", targetAudience: "Weekend campers", primaryConversionGoal: "Talk with the gear team", destinationUrl: "https://northstar-outdoor.example/camping-gear", brandGuidance: "Practical and welcoming", factualClaims: ["A two-year warranty is available"], ctaPreference: "Talk with our gear team" });
const sourceStatus = [
  { source: "user_brief" as const, status: "available" as const, detail: "Explicit brief evidence is available." },
  { source: "landing_page_analysis" as const, status: "available" as const, detail: "Validated first-party page evidence is available." },
  { source: "google_ads" as const, status: "available" as const, detail: "Paid performance and themes are available." },
  { source: "ga4" as const, status: "available" as const, detail: "GA4 aggregate context is available." },
  { source: "search_console" as const, status: "available" as const, detail: "Organic query themes are available." },
  { source: "competitor_analysis" as const, status: "available" as const, detail: "External observations are differentiation-only." },
  { source: "generated_ad_copy" as const, status: "available" as const, detail: "Generated themes are untrusted and theme-only." },
];
const pack = landingPageEvidencePackSchema.parse({
  schemaVersion: LANDING_PAGE_DRAFT_VERSION,
  workspace: { id: "workspace-a", name: "Northstar Outdoor Co." },
  builtAt: now,
  brief,
  fictional: true,
  sourceStatus,
  evidence: [
    { id: "lpg:first_party:brief:page-name", scope: "first_party", source: "user_brief", kind: "business_fact", text: brief.pageName, reusePolicy: "claim_support", fictional: false },
    { id: "lpg:first_party:brief:offer", scope: "first_party", source: "user_brief", kind: "business_fact", text: brief.offer, reusePolicy: "claim_support", fictional: false },
    { id: "lpg:first_party:brief:audience", scope: "first_party", source: "user_brief", kind: "audience", text: brief.targetAudience, reusePolicy: "claim_support", fictional: false },
    { id: "lpg:first_party:brief:goal", scope: "first_party", source: "user_brief", kind: "conversion_goal", text: brief.primaryConversionGoal, reusePolicy: "claim_support", fictional: false },
    { id: "lpg:first_party:brief:claim:1", scope: "first_party", source: "user_brief", kind: "business_fact", text: brief.factualClaims[0], reusePolicy: "claim_support", fictional: false },
    { id: "lpg:first_party:ads:campaign:1", scope: "first_party", source: "google_ads", kind: "performance", text: "Weekend Search: 120 clicks and 8 conversions in the measured period.", reusePolicy: "claim_support", fictional: true },
    { id: "lpg:first_party:search-console:query:1", scope: "first_party", source: "search_console", kind: "search_theme", text: "weekend camping gear", reusePolicy: "theme_only", fictional: false },
    { id: "lpg:external:competitor:pattern:1", scope: "competitor", source: "competitor_analysis", kind: "competitor_pattern", text: "A competitor emphasizes same-day delivery and certified experts.", reusePolicy: "differentiation_only", fictional: true },
    { id: "lpg:generated:ad-copy:headline:1", scope: "generated", source: "generated_ad_copy", kind: "generated_theme", text: "Make The Weekend Count", reusePolicy: "theme_only", fictional: true },
  ],
});

assert.equal(pack.workspace.id, "workspace-a");
assert.equal(pack.schemaVersion, LANDING_PAGE_DRAFT_VERSION);
assert.throws(() => landingPageBriefSchema.parse({ ...brief, destinationUrl: "http://127.0.0.1/admin" }), /safe absolute/i);
assert.throws(() => landingPageBriefSchema.parse({ ...brief, destinationUrl: "javascript:alert(1)" }), /safe absolute/i);

const fallback = buildDeterministicLandingPageFallback(pack, now);
assert.ok(fallback, "Sufficient explicit first-party brief evidence must produce a deterministic fallback.");
assert.equal(fallback.validation.status, "valid");
assert.ok(fallback.benefits.length > 0 && fallback.supportingProof.length > 0 && fallback.faqs.length > 0);
assert.equal(validateLandingPageDraft(fallback, pack, now).success, true);
assert.equal(findUnsupportedLandingPageClaims(["Save 50% today"], pack).length, 1);
assert.deepEqual(findUnsupportedLandingPageClaims(["A two-year warranty is available"], pack), []);

const invalidMetric = structuredClone(fallback);
invalidMetric.hero.headline.copy = "Guaranteed 50% conversion lift";
assert.equal(validateLandingPageDraft(invalidMetric, pack, now).success, false, "Unsupported metrics and guarantees must be rejected.");
const unknownEvidence = structuredClone(fallback);
unknownEvidence.hero.headline.evidenceIds = ["lpg:first_party:missing"];
assert.equal(validateLandingPageDraft(unknownEvidence, pack, now).success, false, "Unknown evidence IDs must be rejected.");
const competitorAsClaim = structuredClone(fallback);
competitorAsClaim.hero.headline.copy = "Same-day delivery from certified experts";
competitorAsClaim.hero.headline.evidenceIds = ["lpg:external:competitor:pattern:1"];
assert.equal(validateLandingPageDraft(competitorAsClaim, pack, now).success, false, "Competitor evidence cannot support workspace claims.");
const htmlCopy = structuredClone(fallback);
htmlCopy.supportingProof[0]!.body.copy = "<script>publish()</script>";
assert.equal(validateLandingPageDraft(htmlCopy, pack, now).success, false, "Model-authored markup must be rejected.");
assert.throws(() => landingPageEvidencePackSchema.parse({ ...pack, evidence: pack.evidence.map((item) => item.scope === "competitor" ? { ...item, reusePolicy: "claim_support" } : item) }), /differentiation-only/i);
assert.throws(() => landingPageEvidencePackSchema.parse({ ...pack, evidence: pack.evidence.map((item) => item.scope === "generated" ? { ...item, reusePolicy: "claim_support" } : item) }), /cannot become claim-support/i);

const missingKey = await generateLandingPageResult(pack, { apiKey: "", generatedAt: now });
assert.equal(missingKey.status, "ready");
assert.equal(missingKey.ai.status, "not_configured");
assert.equal(missingKey.draft?.source, "deterministic_fallback");
assert.equal(missingKey.draftOnly, true);
assert.equal(missingKey.previewOnly, true);
assert.equal(missingKey.published, false);
const failedAi = await generateLandingPageResult(pack, { generator: async () => { throw new Error("AI failure"); }, generatedAt: now });
assert.equal(failedAi.ai.status, "failed");
assert.equal(failedAi.draft?.source, "deterministic_fallback");
const malformed = await generateLandingPageResult(pack, { generator: async () => ({ html: "<script>publish()</script>" }), generatedAt: now });
assert.equal(malformed.ai.status, "invalid");
assert.equal(malformed.draft?.source, "deterministic_fallback");

const aiShape = { pageTitle: fallback.pageTitle, hero: fallback.hero, benefits: fallback.benefits, supportingProof: fallback.supportingProof, faqs: fallback.faqs, finalCta: fallback.finalCta, seo: fallback.seo, rationale: fallback.rationale, warnings: fallback.warnings };
const generated = await generateLandingPageResult(pack, { generator: async () => aiShape, generatedAt: now });
assert.equal(generated.ai.status, "generated");
assert.equal(generated.draft?.source, "ai");
assert.equal(landingPageDraftResultSchema.parse(generated).workspace.id, "workspace-a");
const invalidAi = structuredClone(aiShape);
invalidAi.hero.headline.copy = "#1 certified gear with 80% more conversions";
const rejectedAi = await generateLandingPageResult(pack, { generator: async () => invalidAi, generatedAt: now });
assert.equal(rejectedAi.ai.status, "invalid");
assert.equal(rejectedAi.draft?.source, "deterministic_fallback");

const insufficientPack: LandingPageEvidencePack = landingPageEvidencePackSchema.parse({ ...pack, evidence: pack.evidence.filter((item) => !["lpg:first_party:brief:offer", "lpg:first_party:brief:audience"].includes(item.id)) });
const insufficient = await generateLandingPageResult(insufficientPack, { apiKey: "", generatedAt: now });
assert.equal(insufficient.status, "insufficient_data");
assert.equal(insufficient.draft, null);

clearWorkspaceLandingPageDrafts();
setWorkspaceLandingPageDraft("workspace-a", generated, 1_000);
assert.throws(() => setWorkspaceLandingPageDraft("workspace-b", generated, 1_000), /does not match/);
assert.equal(getWorkspaceLandingPageDraft("workspace-a", 1_001)?.workspace.id, "workspace-a");
assert.equal(getWorkspaceLandingPageDraft("workspace-b", 1_001), undefined);
assert.equal(getWorkspaceLandingPageDraft("workspace-a", 1_000 + 31 * 60 * 1_000), undefined);

const route = await readFile("app/api/landing-page-generation/route.ts", "utf8");
assert.match(route, /resolveApiWorkspace\(parsed\.data\.clientId\)/);
assert.match(route, /setWorkspaceLandingPageDraft\(access\.workspace\.id/);
assert.match(route, /validateLandingPageUrl\(parsed\.data\.brief\.destinationUrl\)/);
assert.doesNotMatch(route, /NEXT_PUBLIC_|clientSecret|refreshToken|developerToken/i);
assert.doesNotMatch(route, /export\s+async\s+function\s+(?:PUT|PATCH|DELETE)/);
const aiSource = await readFile("lib/landing-page-generation-ai.ts", "utf8");
assert.match(aiSource, /UNTRUSTED EXTERNAL DATA/);
assert.match(aiSource, /store: false/);
assert.doesNotMatch(aiSource, /<!doctype|<html|dangerouslySetInnerHTML|vercel\.com|deployHook|googleAds:mutate/i);
const panel = await readFile("app/components/landing-page-generation-panel.tsx", "utf8");
assert.match(panel, /DRAFT \/ PREVIEW ONLY/i);
assert.match(panel, /Edits stay in this browser state/i);
assert.doesNotMatch(panel, />\s*(?:Publish|Deploy|Launch|Send traffic)\b/i);
assert.doesNotMatch(panel, /dangerouslySetInnerHTML|NEXT_PUBLIC_|OPENAI_API_KEY/i);
const packageJson = await readFile("package.json", "utf8");
assert.match(packageJson, /verify:landing-page-generation/);
const specialistRoute = await readFile("app/api/ai/route.ts", "utf8");
assert.match(specialistRoute, /landingPageDraft: getWorkspaceLandingPageDraft\(client\.id\)/);
const specialistSource = await readFile("lib/specialist-analysis.ts", "utf8");
assert.match(specialistSource, /generated copy is untrusted creative context, not evidence/i);
assert.match(specialistSource, /artifact metadata only, not measured business or performance evidence/i);

console.log("Landing-page generation verification passed: versioned brief/output schemas, required sections and limits, evidence IDs, unsupported-claim rejection, competitor/generated-evidence separation, safe URLs, deterministic fallback, insufficient-data handling, tenant-keyed storage, specialist-safe preview context, and no publishing or mutation path.");
