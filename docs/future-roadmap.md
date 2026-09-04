# Crush post-V1 future roadmap

> **Status: future work.** Everything in this document is a proposed post-V1
> capability. It is not a claim that the feature is currently available in
> Crush, and the phases are sequencing guidance rather than release dates or
> commitments.

## V1 baseline

Crush V1 is a working, single-workspace marketing analysis application. It uses
fictional Google Ads data by default and can load read-only live Google Ads
reporting plus optional GA4 context. The current application provides
deterministic metrics and audits, evidence-grounded recommendations, bounded
specialist workflows, completed-period daily analysis, and saved weekly reports.

The present architecture has several useful extension points:

- server-only Google Ads and GA4 adapters isolate credentials and source errors;
- Google Ads rows are normalized before the dashboard, audit, chat, and reporting
  workflows consume them;
- deterministic calculations, materiality rules, evidence IDs, Zod schemas, and
  output validation constrain AI-assisted prioritization;
- Next.js Route Handlers and runner modules orchestrate interactive and scheduled
  workflows; and
- local private JSON or private Vercel Blob stores dated daily and weekly results.

Those strengths should remain. New providers will require a more
provider-neutral domain model, and agency use will require authentication,
tenancy, durable account-scoped storage, and operational controls that V1 does
not yet provide.

## Capability and trust levels

The roadmap deliberately separates four trust levels. A later level must not be
presented as an automatic consequence of completing an earlier one.

| Level | Meaning | Examples in this roadmap |
| --- | --- | --- |
| Read-only analysis | Ingest or observe data and calculate findings without changing a marketing platform | Ads/Search Console integrations, rank tracking, page analysis, forecasting, anomaly alerts |
| Recommendation | Propose a bounded next step for human review; no external account is changed | Negative-keyword candidates and forecast-based budget recommendations |
| Generated content | Produce a draft asset that remains unpublished until reviewed | Ad copy and landing-page drafts |
| Account-modifying action | Send a validated write request to an advertising platform | Carefully controlled Google Ads changes after explicit approval |

Client workspaces, the agency dashboard, and PDF reports are productization and
delivery capabilities rather than permission to cross any of these trust
boundaries. A generated report is also distinct from generative marketing
content: it packages source-linked facts and approved narrative; it does not
publish or modify campaigns.

## Phase 2 — Additional marketing data sources

Build common source contracts and provenance first so later intelligence can
operate across platforms without erasing differences in attribution, naming, or
metric definitions.

### Search Console integration

- **What:** Add read-only query, page, country, device, click, impression, CTR,
  and average-position reporting for verified properties.
- **Why:** Close the evidence gap explicitly reported by the current SEO
  specialist and support defensible organic-search analysis.
- **Dependencies:** Google Search Console API, OAuth or service-account access
  where supported, verified property permissions, reporting dates, and query/page
  dimension handling.
- **Considerations:** Preserve Search Console and GA4 as separate sources; account
  for delayed/finalized data, aggregation differences, row limits, anonymized
  queries, and property-level access. The integration remains read-only.
- **Architecture fit:** Follow the GA4 adapter/status pattern, add source-labeled
  SEO types and evidence, and expose them to reporting and the SEO specialist
  without weakening its missing-data safeguards.

### Microsoft Ads integration

- **What:** Load read-only Microsoft Advertising account, campaign, keyword,
  search-term, conversion, device, geography, and daily performance where the API
  supports the required dimensions.
- **Why:** Extend paid-search analysis beyond Google while allowing useful
  cross-platform review.
- **Dependencies:** Microsoft Advertising API access, OAuth, developer credentials,
  customer/account identifiers, reporting jobs, and provider-specific quotas.
- **Considerations:** Do not force Microsoft definitions into Google-only fields;
  retain source currency, timezone, attribution, conversion, campaign-type, and
  freshness metadata. Partial source failure must not disable other platforms.
- **Architecture fit:** Introduce a paid-media provider adapter interface and
  normalized core metrics with provider-specific extensions, then reuse the
  deterministic calculation, evidence, dashboard, and report layers.

### Meta Ads integration

- **What:** Load read-only Meta campaign, ad set, ad, spend, delivery, click, and
  conversion reporting.
- **Why:** Add paid-social context and let marketers compare channel contribution
  without switching products.
- **Dependencies:** Meta Marketing API, app review and permissions, Business
  Manager/ad-account access, access-token lifecycle management, insights
  endpoints, breakdowns, and rate-limit handling.
- **Considerations:** Meta attribution and entity hierarchy differ materially from
  paid search. Preserve attribution windows, action types, modeled results,
  currency, timezone, and data freshness; avoid misleading direct comparisons.
- **Architecture fit:** Add a source-specific adapter into a provider-neutral
  marketing dataset, while keeping Meta entities and evidence provenance visible
  through dashboards, specialists, daily analysis, and reports.

## Phase 3 — Intelligence, forecasting, and monitoring

These capabilities are read-only analyses. They may produce recommendations or
alerts, but they do not publish content or modify an advertising account.

### Campaign anomaly alerts

- **What:** Detect material deviations in spend, delivery, efficiency,
  conversions, or tracking and notify a reviewer with supporting evidence.
- **Why:** Move the existing completed-period analysis toward timely monitoring
  while reducing manual checks.
- **Dependencies:** Reliable scheduled ingestion, historical baselines, timezone
  and freshness metadata, notification adapters, and delivery preferences.
- **Considerations:** Use minimum-volume and absolute-plus-relative thresholds,
  seasonality-aware baselines, deduplication, severity rules, cooldowns, and clear
  missing-data states to control false alarms. An alert is not proof of cause.
- **Architecture fit:** Extend the daily-analysis runner, deterministic candidate
  model, source statuses, dated storage, and protected cron pattern; add delivery
  only after alert validity is established.

### SEO rank tracking

- **What:** Track selected keyword rankings by search engine, locale, device, and
  date, then show movement and relevant landing pages.
- **Why:** Add longitudinal visibility that Search Console average position alone
  cannot provide.
- **Dependencies:** A compliant rank-tracking/SERP data provider, explicit keyword
  sets, location/device configuration, Search Console context, and historical
  storage.
- **Considerations:** Respect provider and search-engine terms, control query cost,
  distinguish observed ranks from Search Console position, handle personalization
  and SERP features, and never infer rankings for untracked keywords.
- **Architecture fit:** Add scheduled, source-labeled snapshots and deterministic
  comparisons that feed the SEO specialist, charts, anomalies, and reports.

### Landing-page AI analysis

- **What:** Evaluate selected landing pages for message match, content clarity,
  conversion friction, accessibility signals, and test hypotheses alongside Ads
  and GA4 outcomes.
- **Why:** Turn current page-level performance flags into specific, reviewable CRO
  investigations.
- **Dependencies:** Allowlisted page retrieval or supplied page content,
  page/campaign mappings, GA4 landing-page metrics, optional performance and
  accessibility tooling, and a structured AI analysis schema.
- **Considerations:** Treat explanations as hypotheses unless measurement proves
  them; defend against prompt injection in page content, avoid collecting
  sensitive form data, respect robots/access rules, and record retrieval time.
- **Architecture fit:** Create a server-only page-evidence adapter, deterministic
  checks, and bounded CRO candidates before AI synthesis, reusing current schema
  validation and evidence-linking patterns.

### Budget forecasting

- **What:** Model likely delivery and outcome ranges under proposed budget
  scenarios at account or campaign scope.
- **Why:** Help a marketer compare allocation options before making a change.
- **Dependencies:** Sufficient historical spend and outcomes, budget history,
  campaign status, goals and constraints, calendar/seasonality context, and
  optionally platform planning estimates.
- **Considerations:** Show ranges, assumptions, confidence, and backtests; account
  for saturation, learning effects, and sparse data. Forecasts are decision
  support, not guarantees or authorization to change budgets.
- **Architecture fit:** Add a deterministic forecasting service and versioned
  forecast schema that consume normalized time series and emit evidence-linked
  scenarios for the dashboard and reports.

### Conversion forecasting

- **What:** Estimate future conversions and conversion value for defined periods
  under stated traffic, spend, and conversion-rate assumptions.
- **Why:** Support planning, pacing, and early identification of target risk.
- **Dependencies:** Clean conversion definitions, historical Google Ads and/or GA4
  series, attribution and reporting-lag metadata, targets, and calendar context.
- **Considerations:** Keep Ads conversions and GA4 key events separate, model
  reporting lag and uncertainty, reject forecasts with inadequate data, and avoid
  fabricated precision or causal claims.
- **Architecture fit:** Reuse completed-period collection and deterministic metric
  contracts, adding source-specific forecast inputs, validation, backtesting, and
  persisted forecast versions.

### Competitor analysis

- **What:** Summarize observable competitor ads, positioning, keywords, landing
  pages, and visibility from approved sources.
- **Why:** Give campaign and content decisions external market context that V1
  account data cannot supply.
- **Dependencies:** User-declared competitor domains, licensed search/advertising
  intelligence sources, public and allowlisted page retrieval, and snapshot
  storage.
- **Considerations:** Respect terms, copyright, robots, privacy, and rate limits;
  distinguish observed facts from inference, timestamp evidence, and never claim
  access to competitor accounts, budgets, conversions, or confidential data.
- **Architecture fit:** Keep competitor evidence in a distinct source domain, then
  let bounded strategist and content workflows reference it through explicit IDs
  rather than merging it into first-party performance metrics.

## Phase 4 — Generative marketing workflows

Generated assets are drafts. Their facts, brand constraints, destination URLs,
and policy-sensitive claims must be validated, and publishing remains outside
this phase.

### AI-generated ad copy

- **What:** Draft headlines, descriptions, calls to action, and structured variants
  for a selected campaign brief.
- **Why:** Speed up ideation while connecting copy to measured themes and approved
  offers.
- **Dependencies:** User-approved brief, brand voice and claims library, product
  facts, destination pages, channel format limits, policy rules, and optional
  performance evidence.
- **Considerations:** Require human review; deterministically validate character
  limits, URLs, prohibited claims, required disclosures, and factual grounding.
  Do not publish or imply platform approval.
- **Architecture fit:** Add a versioned content schema and draft store behind a
  Route Handler, using structured output and evidence validation while keeping
  drafts separate from account data and any future write API.

### AI-generated landing pages

- **What:** Produce editable landing-page briefs and page drafts or components
  grounded in an approved offer, audience, and brand system.
- **Why:** Shorten the path from a supported marketing hypothesis to a testable
  page variant.
- **Dependencies:** Approved content/assets, design system and page template,
  destination/analytics requirements, accessibility and performance checks,
  hosting/CMS integration if later added, and experiment definitions.
- **Considerations:** Default to preview-only; validate claims, links, forms,
  consent, accessibility, security, responsive behavior, and analytics tags.
  Publishing and traffic allocation require separate approval and rollback.
- **Architecture fit:** Store generated drafts as versioned artifacts, render them
  in an isolated preview, and connect approved experiments back to GA4 evidence
  without allowing page content to enter trusted instructions.

## Phase 5 — Controlled autonomous actions

This phase starts with recommendations and introduces account writes only behind
separate, explicit controls. It should proceed only after authentication,
account-scoped authorization, durable audit storage, idempotency, and production
observability exist.

### Automatic negative-keyword generation

- **What:** Turn qualifying search terms into proposed negative keywords with
  match type, level, rationale, and estimated affected traffic.
- **Why:** Reduce repetitive query review and make waste-control recommendations
  easier to evaluate.
- **Dependencies:** Google Ads search-term and conversion data, existing
  deterministic waste candidates, campaign/ad-group structure, current negative
  lists, keyword conflicts, and business exclusions/allowlists.
- **Considerations:** Recommendation-only by default. Validate intent, conversion
  lag, brand and strategic terms, duplicates, conflicts, scope, and projected
  impact. Batch review is required; generation alone never changes the account.
- **Architecture fit:** Extend the existing negative-keyword candidate pipeline
  into a typed proposal and validation service. Only separately approved proposals
  may be handed to the controlled Google Ads action layer.

### Carefully controlled Google Ads actions

- **What:** Apply a narrow allowlist of approved changes—beginning with reversible,
  low-blast-radius operations such as adding an approved negative keyword—through
  the Google Ads mutate API.
- **Why:** Remove manual transcription after Crush has produced, validated, and
  explained a recommendation.
- **Dependencies:** Google Ads mutate permissions, authenticated users and roles,
  account ownership/consent, current-state reads, proposal and approval records,
  idempotency keys, audit storage, and monitoring/rollback workflows.
- **Considerations:** Separate proposal, deterministic validation, approval,
  execution, and verification. Start with a tiny action allowlist; reject stale
  proposals or changed account state; treat partial API failure explicitly.
- **Architecture fit:** Add an isolated command boundary rather than expanding the
  read adapter. Route Handlers should call typed validators and an auditable
  executor; AI may draft a proposal but may never call unrestricted mutation
  tools or supply unverified entity IDs or values.

#### Mandatory Google Ads action safety principles

- **Read-only by default:** connecting an account grants analysis, not write
  authority; write access is an explicit, revocable elevation.
- **Deterministic validation before AI decisions:** code verifies entity identity,
  current state, constraints, policy, and proposed values before a proposal can
  reach approval or execution. AI output is untrusted input.
- **Explicit user approval before material account changes:** show the exact diff,
  rationale, evidence, expected impact, and affected entities immediately before
  execution. Approval must be attributable and expire when the proposal is stale.
- **Account and campaign scope controls:** permissions and allowlists bind every
  proposal to specific customer, campaign, ad-group, action, and user scopes.
- **Spend and budget guardrails:** enforce absolute and relative caps, pacing and
  currency checks, and organization policy independently of model output.
- **Audit logs:** durably record inputs, proposal versions, validation results,
  approver, executor, API response, timestamps, and post-change verification,
  with sensitive values redacted.
- **Reversible actions where possible:** capture before-state, prefer operations
  with a defined inverse, offer tested rollback, and label irreversible or
  lossy changes before approval.
- **No invented campaign or account data:** entity IDs, names, budgets, status,
  and metrics must come from a fresh authorized read; missing or ambiguous data
  blocks the action.
- **No unrestricted autonomous budget changes:** AI cannot freely set or increase
  spend. Any future budget operation requires deterministic caps, fresh forecasts,
  explicit scoped approval, and a separately reviewed action policy.

## Phase 6 — Multi-client and agency productization

These capabilities turn the single-workspace prototype into a product that could
handle multiple organizations. They require a security and operations track, not
just additional dashboard components.

### Client accounts

- **What:** Provide authenticated, isolated client workspaces with users, roles,
  connected marketing accounts, goals, preferences, and data-retention controls.
- **Why:** Let consultants or teams use Crush for real accounts without mixing
  identity, credentials, data, approvals, or reports.
- **Dependencies:** Authentication, organization/tenant model, role-based access,
  encrypted credential management, durable database/object storage, consent and
  deletion flows, billing/limits if commercialized, and operational support.
- **Considerations:** Enforce tenant isolation at every read, cache, job, blob,
  log, export, and action boundary; use least privilege, secret rotation, secure
  invitations, and documented retention. Complete threat modeling and security
  review before onboarding real client data.
- **Architecture fit:** Replace process-wide environment/account selection and
  shared file prefixes with request-scoped workspace context, tenant-keyed jobs
  and storage, and server-enforced authorization while retaining normalized data
  and deterministic analysis services.

### Agency dashboard

- **What:** Present a permission-aware portfolio view of client health, anomalies,
  reporting status, pacing, and items awaiting review or approval.
- **Why:** Help an agency prioritize attention across accounts without opening each
  workspace separately.
- **Dependencies:** Client accounts, normalized cross-provider health summaries,
  job/integration status, account targets, role assignments, and scalable query
  and cache infrastructure.
- **Considerations:** Avoid ranking accounts on incomparable metrics, expose
  freshness and source failures, restrict sensitive client detail by role, and
  make bulk operations opt-in and independently scoped.
- **Architecture fit:** Build read-optimized tenant/account summaries above the
  existing score, daily analysis, and weekly report outputs; drill-down should
  enter the same account-scoped dashboard rather than duplicate calculations.

### PDF marketing reports

- **What:** Export a branded, accessible PDF version of a selected, source-linked
  marketing report for a defined client and period.
- **Why:** Provide a portable stakeholder deliverable while preserving Crush's
  evidence and limitation labels.
- **Dependencies:** Stable report schema, client branding and locale settings,
  server-side HTML/PDF rendering, chart/image assets, artifact storage, and secure
  download or delivery controls.
- **Considerations:** Pin the report version and data period, prevent cross-tenant
  leakage, escape untrusted content, label missing/stale sources, test pagination
  and accessibility, and never invent data to fill a template.
- **Architecture fit:** Render from the validated weekly-report domain object (and
  future provider-aware extensions), store the immutable artifact under tenant
  and report IDs, and keep generation separate from email or other delivery.

## Recommended implementation order

The phases are the primary order. Within them, the recommended sequence balances
user value, fit with V1, complexity, and the risk of crossing a trust boundary:

1. **Build the source foundation, then Search Console.** Define provenance and
   provider-neutral contracts while closing the clearest documented evidence gap.
2. **Add Microsoft Ads, then Meta Ads.** Microsoft paid-search semantics should
   exercise reuse of the current paid-media model before the larger hierarchy and
   attribution differences introduced by Meta.
3. **Ship anomaly alerts and SEO rank tracking.** Alerts reuse current daily
   materiality logic; rank history builds directly on the Search Console/SEO path.
4. **Add landing-page analysis.** Reuse GA4 landing-page context, but establish
   safe page retrieval and untrusted-content handling before AI review.
5. **Develop and backtest budget and conversion forecasts.** Release only when
   uncertainty, data sufficiency, and source boundaries are visible.
6. **Add competitor analysis.** Its value is real, but external data licensing,
   provenance, cost, and compliance make it a later analytical source.
7. **Introduce ad-copy drafts, then landing-page drafts.** Copy has a smaller
   surface area; page generation needs preview isolation plus broader security,
   accessibility, analytics, and publishing controls.
8. **Generate negative-keyword proposals without writes.** This closely matches
   an existing V1 deterministic candidate and provides a safe approval workflow
   to test.
9. **Pilot a narrow Google Ads action allowlist.** Begin only after the full action
   safety foundation is independently tested; expand by action type, never by
   giving a model general mutation access.
10. **Productize client accounts, then the agency dashboard and PDF reports.**
    Tenant isolation and authorization are prerequisites for cross-account views
    and client artifacts. Report export can follow once account-scoped data and
    stable report schemas exist.

Each phase should have measurable exit criteria: source accuracy and freshness,
grounding/validation coverage, failure isolation, user-review quality, and—before
any write capability—authorization, approval, audit, idempotency, rollback, and
post-change verification tests.
