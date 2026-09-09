# AI landing-page drafting

Crush creates tenant-scoped, evidence-grounded landing-page **copy drafts** for an editable, in-dashboard preview. The workflow never creates HTML from model output, publishes a page, provisions a public URL, connects to a CMS, deploys to Vercel, allocates traffic, or changes Google Ads. Every result is labeled **DRAFT / PREVIEW ONLY**, and human review is required before the copy is used elsewhere.

## Architecture

`POST /api/landing-page-generation` validates a versioned brief, then resolves the submitted workspace selector through the authenticated user's server-side membership. The selector is not authorization. Only after authorization does the route load workspace-scoped marketing data and recent tenant-keyed landing-page analysis, competitor analysis, and ad-copy draft context.

The server builds a bounded evidence pack, optionally asks OpenAI for one structured draft, treats that response as untrusted, and runs deterministic validation. A validated result is retained in a workspace-keyed in-memory store for 30 minutes so the existing specialist workflow can discuss the artifact. The store rejects a result whose embedded workspace does not match its key. It is not durable approval or publishing storage.

The browser parses the response schema again and renders React components from structured text fields. It does not render model HTML. Local copy editing uses browser component state; edits are not sent back to the server, saved, published, or converted into evidence.

## Input schema

`landing-page-brief.v1` is strict and includes:

- page or campaign name;
- offer, product, or service;
- target audience;
- primary conversion goal;
- optional existing or destination HTTP(S) URL;
- optional brand/message guidance;
- optional explicit factual claims, one bounded item at a time; and
- optional CTA preference.

Name, offer, audience, and conversion goal are required. The optional URL rejects credentials, non-HTTP protocols, nonstandard ports, localhost, `.local`, and recognizable private-network literals. Generation does not retrieve that URL. If a future workflow retrieves it, the existing DNS-resolution and redirect SSRF checks in the landing-page retriever still apply.

User-provided factual claims are source-labeled input, not independently verified facts. Crush will not fill missing prices, terms, availability, credentials, customer counts, performance, or other business facts.

## Grounding model

The `landing-page-draft.v1` evidence pack keeps three scopes separate:

- `first_party`: explicit brief facts, validated workspace page observations, and workspace performance evidence;
- `competitor`: observable external analysis, always `differentiation_only`; and
- `generated`: prior Crush ad-copy themes, always `theme_only` and never factual support.

First-party inputs use either `claim_support` or `theme_only`. Offer, audience, goal, explicit claims, observed first-party page language, and bounded measured context can support a cited statement. Search terms, Search Console queries, brand direction, CTA preferences, and campaign themes can shape language but cannot prove a business fact. Generated ad copy remains untrusted even though Crush produced it. Crush does not currently have an ad-copy approval lifecycle, so a stored generated ad draft is never described as approved evidence.

Competitor patterns may inform structure or differentiation. They cannot be cited as the sole support for a copy block and cannot become a claim about the workspace. First-party, competitor, and generated items retain distinct IDs, scopes, sources, policies, and fictional/demo labels in the response and UI.

## Output schema

The strict `landing-page-draft.v1` result contains workspace identity, brief, source statuses, evidence, AI/fallback status, limitations, and immutable safety flags: `draftOnly: true`, `previewOnly: true`, and `published: false`.

Its draft contains:

- page title;
- hero headline, subheadline, primary CTA, and optional secondary CTA;
- one or more benefit/value-proposition blocks;
- one or more supporting proof/message blocks;
- objection-handling FAQs;
- a final CTA block;
- SEO title and meta description;
- first-party evidence and inspiration rationale; and
- warnings plus a deterministic validation record.

Each visible copy block is a `{ copy, evidenceIds }` object. No arbitrary HTML, JavaScript, form definition, analytics tag, style payload, CMS instruction, or deployment configuration is accepted.

## Deterministic validation

Application code, not the model, enforces:

- strict input, evidence-pack, AI-output, and final-result schemas;
- required sections, item counts, non-empty normalized text, and bounded lengths;
- unique and existing evidence IDs;
- at least one reusable first-party claim-support reference for every copy block;
- cited-evidence checks for detectable high-risk claims;
- separation of competitor and generated inspiration from first-party support;
- rejection of uncited or unsupported metrics, percentages, prices, discounts, guarantees, rankings, awards, ratings, customer/review counts, certifications, years-in-business claims, delivery promises, and performance outcomes;
- rejection of instruction-like page/brief content and publication, deployment, secret-extraction, tenant-access, tool-use, or account-mutation language; and
- safe URL syntax and destination constraints.

The high-risk detector is deliberately conservative and bounded. It does not replace legal, policy, substantiation, accessibility, security, SEO, or human factual review. Explicit user claims can pass the mechanical grounding check because they are traceable to the user input; that does not make them independently true.

## AI failure and fallback

When `OPENAI_API_KEY` is absent, the AI call fails, or model output is malformed or rejected, Crush attempts a deterministic template made only from the safe explicit page name, offer, audience, goal, and optional CTA. The fallback receives the same validation as AI output and is clearly identified as `deterministic_fallback`.

If safe offer and audience claim-support evidence is unavailable, or a valid fallback cannot be built, the result is `insufficient_data` with no draft. Missing information is never silently invented.

## Specialist relationship

The CRO specialist can report that a validated workspace draft exists, its section counts, its preview-only status, and the review needed before a separately designed test. It treats only artifact metadata as known. Generated headlines, benefits, FAQs, and CTAs do not become measured findings, proof of business facts, or evidence of expected conversion/SEO performance.

Landing-page analysis remains a separate read-only observation workflow. Its validated first-party page language may enter the generation evidence pack. Generation does not overwrite that analysis or turn generated copy into analyzed page evidence. The ad-copy workflow likewise remains separate; its generated assets can supply theme-only context but no claim support.

## Known limitations

- Draft retention is process-local and expires after 30 minutes; there is no history, approval workflow, or durable artifact record.
- Local UI edits disappear on navigation or refresh and are not revalidated server-side.
- The preview evaluates copy hierarchy, not responsive production design, accessibility, form behavior, consent, privacy, analytics, Core Web Vitals, security headers, or browser compatibility.
- No assets, images, design tokens, forms, legal disclosures, tracking, experiments, CMS integration, hosting, publishing, or traffic allocation are implemented.
- Source availability varies by workspace. Demo evidence is fictional and labeled.
- The claim detector reduces common fabrication risks but cannot establish legal substantiation or catch every semantic implication.

## Verification

Run `npm run verify:landing-page-generation`. The script covers versioned schemas, required sections and lengths, safe URLs, evidence IDs, unsupported claims, competitor/generated-source separation, deterministic fallback, insufficient data, tenant-keyed storage, preview-only flags, specialist-safe treatment, and the absence of publishing or mutation paths.
