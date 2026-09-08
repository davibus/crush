# Landing-page analysis

Crush provides a read-only, tenant-scoped review of one explicitly selected landing page at a time. It combines deterministic static-HTML evidence with available GA4 landing-page rows and Google Ads final-URL mappings, then proposes bounded CRO experiments. It never changes a website, campaign, analytics property, CMS, form, or experiment.

The feature is for investigation: observations describe retrieved evidence, while page explanations and experiments remain hypotheses unless a controlled measurement proves an effect.

## Deterministic checks and evidence

Application code retrieves and parses the page before any optional model call. The versioned `landing-page-analysis.v1` Zod contract records the requested and final URL, retrieval time, content type, byte count, redirect count, title, and source status. Deterministic evidence includes:

- title, meta description, H1/H2 text, and a bounded visible-text excerpt;
- named button, submit-control, and action-oriented link candidates;
- link, button, navigation-link, form, and observable non-hidden field counts;
- image and missing-alt counts, H1 count, heading-level skips, explicit form-label/ARIA naming signals, and unnamed button/link signals;
- exact-path or exact-URL GA4 landing-page sessions and key events when present; and
- exact Google Ads final-URL mappings and associated loaded search terms when present.

The HTML checks are deliberately basic. Regex-based static extraction can miss malformed markup and client-rendered elements. Image-alt results cannot decide whether an image should be descriptive or decorative, and form checks never read or submit field values.

Every observation, issue, strength, and experiment references deterministic evidence IDs. The schema rejects unknown evidence IDs and duplicate evidence records. GA4, Google Ads, live page HTML, and fictional demo-fixture evidence retain separate source labels.

## AI role and grounding

OpenAI is optional. The model receives only a bounded structured projection and may return an ordering of existing deterministic issue and experiment IDs. Application-owned wording, facts, severity, evidence, and experiments are not model-generated or editable by the selection response. Unknown IDs, duplicates, malformed output, API errors, and a missing `OPENAI_API_KEY` all return the complete deterministic analysis in its original order with an explicit AI status.

Retrieved page content is untrusted data. The model instruction explicitly says to ignore instructions, roles, requests, or policies embedded in the page. Page content is placed only in the evidence payload and cannot become a system or developer instruction. ID allowlisting prevents the model from introducing a new finding or experiment.

## URL retrieval security

The server-only adapter accepts absolute HTTP or HTTPS URLs with no embedded credentials and only standard ports. The submitted URL is the single explicitly selected target; Crush does not discover links or crawl additional pages.

Before every request and redirect, Crush resolves the host and rejects the whole resolution set if any address is loopback, private, link-local, carrier-grade NAT, multicast, or another reserved range. The request connects to the validated IP while preserving the original HTTP Host header and HTTPS SNI name, reducing DNS-rebinding exposure. Redirects are revalidated and limited to three.

Retrieval uses an eight-second timeout and a 1,000,000-byte maximum. It accepts HTML, XHTML, or plain text, sends no cookies, authorization, application session, or user credentials, asks for no compression, executes no JavaScript, and submits no forms. Non-success HTTP status, DNS failure, timeout, oversized body, unsupported content type, invalid redirect, and blocked targets produce safe status messages. Retrieved HTML is not cached.

This bounded fetcher is not an unrestricted crawler. Operators should still confirm they are permitted to retrieve a chosen public URL and comply with the target's access rules.

## Tenant isolation and specialist use

The Route Handler validates the request and calls the central `resolveApiWorkspace` authorization boundary. An unknown workspace and another tenant's workspace remain indistinguishable. Server-only integration configuration never enters the response.

After a successful analysis, only the validated analysis—not raw HTML—is held for 30 minutes in an in-process map keyed by a validated workspace ID. Starting another analysis clears that workspace's prior value. There is no cross-workspace key or retrieval cache. The deployment may lose this optional ephemeral context between server instances or restarts.

The existing CRO specialist can use the current workspace's validated page issues and experiments. It keeps recommendations hypothesis-linked and reports absent GA4 or Ads mapping. With no current page analysis, it explicitly says no page was analyzed and falls back to existing GA4-only behavior. Page retrieval errors are shown in the page-analysis panel and do not break other workspace features.

## GA4 and Google Ads relationship

Crush does not fabricate page/campaign joins. Live Ads context requires a loaded landing-page row whose normalized final URL exactly matches the retrieved final URL. GA4 context requires either an exact normalized URL or an exact landing-page path. Ads conversions and GA4 key events stay separate.

The fictional Northstar fixture contains an explicit demo-only campaign declaration used to demonstrate message-match review. It is labeled as fixture evidence and is not presented as a live Google Ads mapping. Missing GA4 data, no mapping, and a sparse matched GA4 sample are disclosed as limitations. A page-level rate indicates where to investigate, not what caused an outcome.

## Demo behavior and limitations

Choose **Analyze fictional Northstar demo page** to load bundled `data/northstar-landing-page.html`. The fictional fixture intentionally contains reviewable CTA, navigation, form-label, form-length, and image-alt signals. It needs no public website or OpenAI key.

Crush does not render JavaScript, take screenshots, measure speed or layout, inspect consent behavior, certify WCAG conformance, crawl competitors, forecast lift, generate pages, publish content, write to a CMS, deploy an A/B test, or mutate Google Ads/GA4/Search Console. Visual hierarchy, trust quality, keyboard behavior, responsive layout, and dynamic forms require manual or specialized testing.

## Verification

Run the focused deterministic suite:

```bash
npm run verify:landing-page-analysis
```

It covers the fixture, content/message extraction, accessibility signals, deterministic CRO rules, schema and evidence-ID enforcement, mocked AI ordering, missing/failed/malformed AI fallbacks, invalid/unreachable targets, SSRF and mixed-DNS rejection, oversized/non-HTML responses, prompt-injection containment, missing/sparse GA4, missing Ads mapping, tenant-isolated context, and protected route source checks.

## Browser test steps

1. Put `AUTH_ALLOW_DEV_LOGIN=true` and a valid `AUTH_SECRET` in `.env.local`; `OPENAI_API_KEY` is optional.
2. Run `npm run dev`, open `http://localhost:3000`, and choose **Open local demo**.
3. Open the fictional demo workspace from `/agency`, then scroll to **AI analysis → Landing-page analysis**.
4. Confirm the **Read-only analysis** label and the hypothesis/not-proven-cause disclosure.
5. Choose **Analyze fictional Northstar demo page**. Confirm the four source cards, deterministic observations, prioritized issues, test hypotheses, evidence links, and limitations. Confirm GA4 is unavailable unless configured and the demo mapping is described as fictional fixture evidence.
6. Follow an evidence chip and confirm it lands on the source-labeled evidence record.
7. In **Ask your data**, select **CRO Analyst** and ask “What landing-page experiment should we review?” Confirm it cites deterministic page signals, labels the recommendation as hypothesis-led, and does not promise lift.
8. Enter `http://127.0.0.1` and confirm the request is rejected as a private target. Enter an invalid or unreachable public URL and confirm the retrieval failure is contained in this panel.
9. Optionally enter one public landing-page URL you are authorized to inspect. Confirm the displayed final URL/retrieval time and that absent exact GA4/Ads matches are disclosed rather than inferred.
10. Remove or invalidate `OPENAI_API_KEY`, restart, and rerun the demo. Confirm deterministic results still render and AI is shown as not configured or failed.
