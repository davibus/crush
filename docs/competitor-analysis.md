# Competitor analysis

Crush provides a bounded, read-only comparison of one to three public competitor pages explicitly selected by an authenticated workspace user. It records observable static-HTML evidence, compares supported page signals, and proposes clearly labeled investigation hypotheses. It never discovers competitors, crawls linked pages, authenticates to a site, or changes a website or marketing account.

## Evidence and fact-versus-hypothesis model

The versioned `competitor-analysis.v1` Zod contract separates:

- `observations`: facts from each successfully retrieved page;
- `patterns`: deterministic comparisons across retrieved pages and, when available, the stored workspace page;
- `opportunities` and `hypotheses`: evidence-linked ideas requiring manual research or a controlled test; and
- `limitations`: unavailable evidence and parser boundaries.

For each page, Crush reuses the landing-page parser to capture the requested/final URL, retrieval time, title, meta description, H1/H2 text, bounded visible-text excerpt, action-oriented CTA candidates, form and field counts, page-structure counts, trust/reassurance terms, and basic image/heading signals. It also detects a small, application-owned vocabulary of repeated public messaging themes such as free offers, guarantees/warranties, bundles, expert guidance, and immediacy.

Every finding cites one or more `ca:*` evidence IDs. Each evidence record includes its own-page or competitor scope, source type, competitor ID where applicable, final retrieved URL, retrieval timestamp, observable value, and classification. The schema rejects duplicate or unknown evidence IDs and prevents fact sections from containing hypothesis-classified findings (and vice versa).

Static absence is never presented as proof that content does not exist. Crush makes no claims about visual prominence, design quality, page speed, UX quality, conversion rate, traffic, ad spend, CTR, CPA, ROAS, revenue, profitability, customer counts, rankings, authority, or market share. Those private or unavailable metrics are not inferred from webpage copy.

## Retrieval security and access scope

Competitor retrieval delegates to the Issue #7 server-only adapter. It accepts only absolute HTTP/HTTPS URLs without embedded credentials and only standard ports. Before every request and redirect, all DNS results are checked; loopback, private, link-local, carrier-grade NAT, multicast, documentation, and reserved ranges are rejected. Requests connect to the validated address while retaining the original Host header and HTTPS SNI name to reduce DNS-rebinding exposure.

Retrieval is limited to three redirects, eight seconds for the complete operation, and 1,000,000 response bytes. Only HTML, XHTML, and plain text are accepted. Requests send no cookie, authorization header, application session, or user credential; execute no JavaScript; submit no form; and do not follow page links. HTTP/access-control failures, timeouts, unsupported content, oversized responses, DNS errors, and unsafe redirects become per-source failures. Crush does not bypass login, paywall, robots, rate-limit, or anti-bot controls. Operators remain responsible for selecting public URLs they are permitted to retrieve.

## Own-page comparison and partial data

If the workspace has a valid landing-page analysis from the prior 30 minutes, competitor analysis reuses its validated evidence. It does not select or silently retrieve an own-site URL, and it does not add GA4 or Google Ads mappings beyond what that existing analysis already validated. Without that snapshot, competitor-only analysis still succeeds and explicitly says direct first-party comparison is unavailable.

Each submitted competitor is retrieved independently. One unreachable source does not discard valid results; the response records its supplied and normalized URL, safe error code/detail, and failed status. If every source fails, the analysis still returns source statuses and limitations, with no fabricated pattern. Raw HTML is not stored.

The validated result is held for 30 minutes in an in-process map keyed only by the centrally authorized workspace ID. It may disappear on restart or differ across server instances. Durable snapshots and retention controls are future work.

## AI and prompt-injection safeguards

OpenAI is optional. Deterministic extraction and comparison are complete without `OPENAI_API_KEY`. When configured, the model receives only a bounded projection and can reorder existing pattern, opportunity, and hypothesis IDs. It cannot write findings, alter classifications, introduce evidence, or change application-authored wording. Duplicate IDs, unknown IDs, malformed output, timeout/API failure, or missing configuration leaves deterministic ordering intact with an explicit status.

Retrieved webpage text is untrusted data. The model instruction says to ignore any instruction, role, policy, or request embedded in page content. Evidence is data in a serialized payload, never a system/developer/user instruction, and ID allowlisting prevents injected text from creating a result.

## Specialist and demo behavior

The existing CRO Analyst handles competitor/message/positioning questions because the evidence concerns landing-page copy, offers, CTAs, and test hypotheses. It cites competitor evidence IDs, discloses missing own-page context, and never treats competitor wording as performance proof. The SEO specialist does not receive speculative SEO conclusions from static competitor pages.

**Analyze fictional Northstar competitors** loads three bundled, visibly fictional pages without network or AI credentials. They demonstrate different value propositions, CTAs, offers, audiences, form structures, reassurance language, repeated themes, and possible differentiation tests. They are never mixed with live evidence.

## Verification

Run:

```bash
npm run verify:competitor-analysis
```

The focused suite covers deterministic extraction, multiple sources, own-page and missing-own behavior, evidence grounding, fact/hypothesis enforcement, hostile page instructions, unsupported-metric safeguards, invalid/duplicate/missing URLs, SSRF and mixed-DNS defenses, size/content limits, partial and total retrieval failure, fictional labels, AI validation/fallbacks, workspace isolation, and protected Route Handler wiring. Landing-page retrieval tests additionally exercise redirect limits and failures, timeouts, and response validation.

## Browser test steps

1. Configure the development login as described in the README, run `npm run dev`, sign in, and open a workspace.
2. Under **AI analysis**, run **Landing-page analysis** on the fictional Northstar page to enable own-page comparison.
3. In **Competitor analysis**, choose **Analyze fictional Northstar competitors**. Confirm all sources say fictional demo data and show retrieval timestamps.
4. Confirm observable facts and cross-competitor patterns use evidence chips, while differentiation ideas have a **Hypothesis** badge.
5. Follow evidence chips and verify source type, retrieved value, and limitation text. Confirm no private performance metrics appear.
6. Enter one valid public URL and one unreachable public URL. Confirm the valid result remains and the failed source is isolated.
7. Try an invalid, duplicate, localhost, or private-network URL and confirm server-side rejection.
8. Ask the CRO Analyst “How does our landing-page messaging differ from the competitors we reviewed?” Confirm it cites available evidence and labels strategic interpretation as hypothesis.
9. Restart without `OPENAI_API_KEY` and confirm the same deterministic analysis renders with AI marked not configured.

## Current limitations and future work

The parser does not render JavaScript, inspect screenshots/styles, certify accessibility, measure performance, or determine true visual prominence. The theme vocabulary is deliberately small. This version has no scheduled snapshots, licensed advertising/search intelligence, multi-page crawling, automatic discovery, change history, or durable database storage. Future work may add compliant licensed sources and durable snapshots while retaining explicit provenance and the current fact/hypothesis boundary.
