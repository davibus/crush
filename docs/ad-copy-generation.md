# AI ad-copy drafting

Crush creates workspace-scoped **draft-only** Google responsive search ad (RSA) copy from validated evidence already available to an authorized workspace. It does not create, edit, upload, publish, pause, enable, or otherwise change ads, campaigns, bids, or budgets. Human review and a separately authorized manual advertising workflow are required before use.

## Architecture

`POST /api/ad-copy-generation` validates the request and resolves workspace membership server-side. The browser-supplied workspace ID selects a workspace; it is never proof of access. The route loads the existing normalized marketing dataset and the workspace's recent validated landing-page and competitor-analysis results, then builds a bounded `ad-copy-draft.v1` evidence pack.

The optional OpenAI call receives only that compact pack. Structured output is normalized and validated by application code. Only fully valid candidates are returned. A validated result is kept for 30 minutes in a bounded, in-process, workspace-keyed store so the Paid Media specialist can discuss it during the current server session. The store is not durable and never mixes workspace keys.

The response exposes only the workspace label/ID already used by the dashboard, source status, bounded evidence, drafts, validation metadata, and limitations. OAuth credentials, Google customer IDs, database data, and AI credentials are not included.

## Evidence and source boundaries

The pack can use any subset of:

- validated workspace landing-page title, metadata, headings, and CTA language;
- normalized Google Ads Search campaign context, paid keywords, and search terms;
- Google Search Console query language, explicitly labeled as organic rather than paid;
- validated competitor patterns and differentiation opportunities.

Evidence has a scope and reuse policy:

- `claim_and_theme` is validated first-party landing-page language that may substantiate a business statement;
- `theme_only` is first-party paid or organic search-language context that may guide wording but cannot establish a business claim;
- `differentiation_only` is external competitor evidence. It may inspire a distinct angle but cannot support a claim about the workspace.

Each candidate therefore has separate `claimEvidenceIds` and `inspirationEvidenceIds`. Claim IDs must resolve to `claim_and_theme` first-party evidence. Competitor wording is not copied as a workspace fact, and competitor performance is never inferred.

Landing-page and competitor text is untrusted data. The model instructions explicitly reject any embedded request for secrets, prompts, other tenant data, tools, mutations, or behavior changes. The feature does not crawl pages; it reuses the existing validated analyses.

## AI and deterministic responsibilities

The model may draft wording, vary creative angles, rewrite supported propositions, and order alternatives. It may not calculate metrics, create evidence, introduce unsupported claims, predict performance, treat competitor language as a first-party fact, or represent an account mutation as performed.

Application code owns authorization, evidence selection, source labels, schemas, character counting, normalization, duplicate checks, evidence lookup, claim policy, final validation, storage, and fallback behavior. Generated copy is always labeled a creative suggestion—not a measured conclusion. Crush does not say one draft will outperform another or forecast CTR, CVR, CPA, ROAS, conversions, or revenue.

## RSA constraints and validation

The centralized limits follow [Google Ads Help's current responsive search ad limits](https://support.google.com/google-ads/answer/7684791?hl=en):

| Asset | Count per draft | Limit per asset |
| --- | ---: | ---: |
| Headlines | 3–15 | 30 characters |
| Descriptions | 2–4 | 90 characters |

Double-width Korean, Japanese, and Chinese characters count as two, matching Google's documented rule. Whitespace is NFKC-normalized and collapsed. Empty assets, over-limit text, case-insensitive duplicates, missing fields, unknown evidence IDs, competitor IDs used as claim support, and detectable unsupported high-risk claims are rejected. Text is never silently truncated.

The high-risk detector covers patterns such as rankings, percentages/discounts, prices, guarantees, star ratings, same-day promises, years of experience, certifications, awards, free shipping/consultations/estimates/trials/delivery, and broad shipping-coverage promises. Such language is allowed only when the detected claim appears in reusable first-party evidence. This is a bounded safeguard, not a substitute for legal, policy, or factual review.

## Missing data and failures

The workflow does not require every source. With validated first-party business language, a deterministic template can provide a conservative fallback when `OPENAI_API_KEY` is missing, the AI call fails, or output is malformed, over-limit, unsupported, or references unknown evidence. The AI status explains which path was used.

Search themes and competitor evidence alone are not enough to make responsible business claims. If no reusable first-party language exists, the result is `insufficient_data` and contains no candidates. The dashboard suggests running the existing landing-page analysis first.

## Demo behavior

The included Google Ads sample dataset and bundled Northstar landing/competitor fixtures remain fictional. A result that uses any sample or demo source is visibly labeled **Fictional/sample data**. For the richest credential-free demo, analyze the fictional Northstar landing page, optionally analyze its fictional competitors, and then generate drafts. These drafts are portfolio examples, not live client advertising.

## Specialist integration

The existing Paid Media specialist can describe the latest validated workspace draft and keeps measured asset counts separate from generated wording. “Write some Google Ads copy based on this account” routes to the PPC specialist and points to the stored draft workflow. Questions that ask whether copy will increase CTR or another performance metric are rejected as unsupported; the response requires an actual controlled advertising test.

## Current limitations

- The store is ephemeral, process-local, capped, and expires after 30 minutes.
- There is no brand claims library, policy approval engine, destination-page selector, pinning workflow, ad preview, or persistent draft history.
- Detectable-claim rules reduce obvious risk but cannot prove every sentence legally or factually safe; human review remains mandatory.
- RSA path fields, localized policy nuances, and account-specific Google Ads policy review are not implemented.
- There is no Google Ads mutation endpoint or publish/apply/upload action.

Run focused verification with `npm run verify:ad-copy-generation`.
