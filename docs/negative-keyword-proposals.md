# Negative-keyword review proposals

Issue #11 is recommendation-only. It creates structured review artifacts and performs no Google Ads mutation, keyword removal, publishing, bidding, budget, or campaign-status operation. “Accept for future review” and “Reject proposal” are browser-local labels; acceptance does not mean a negative was added.

## Architecture and deterministic rules

`POST /api/negative-keyword-proposals` validates a workspace ID, resolves the authenticated membership through the centralized authorization layer, and only then loads that workspace's normalized marketing data. The server creates a version `1.0` result whose proposals, evidence, scope, metrics, timestamps, limitations, AI state, recommendation-only flag, and `googleAdsChangesMade: false` boundary are validated with Zod. Search terms are treated as untrusted data.

Rows are grouped by normalized search term, campaign, and ad group. Duplicate rows become one candidate with summed historical metrics and separate evidence IDs. A completed period requires at least 30 clicks, $100 spend, and 2% of its mapped campaign's spend. A rolling/recent live period uses the stricter floor of 60 clicks, $150 spend, and 3% of campaign spend. The term must have zero recorded conversions and no positive recorded conversion value. This deliberately does not flag every zero-conversion term.

The normalized source does not expose conversion timestamp or click-to-conversion lag. Sample data is an old fixed completed period. Live windows are conservatively labeled `may_include_recent_data`, use the higher thresholds, and warn that conversions may not have reported yet. Offline imports and attribution definitions still require review even for completed periods.

## Protection and conflicts

The generator withholds:

- every term in a campaign whose name explicitly identifies it as Brand;
- terms with conversions or positive conversion value;
- terms substantially identical to an enabled keyword in the same campaign/ad group;
- terms containing or substantially identical to an explicit `NEGATIVE_KEYWORD_PROTECTED_TERMS` entry or a conservative workspace/account-name brand token;
- exact proposals that would block an intentionally targeted exact keyword;
- duplicates within the generated set or a supplied existing-negative set.

Protected terms use normalized Unicode/case/punctuation comparisons, not AI judgment. Workspace-specific allowlists are configured server-side as comma-separated business terms or phrases. A phrase or broad proposal conflict check is implemented for validated future inputs, but unsafe conflicts are withheld.

The current Google Ads read adapter does not retrieve existing negative keywords. Results therefore say `existingNegativeKeywordCoverage: unavailable`; duplicate detection covers the generated set, not the complete account. The adapter was not expanded and remains read-only.

## Match type, scope, and impact

The schema accepts Google Ads negative exact, phrase, and broad match types. Automatic generation currently selects exact only. This limits the affected query to the observed normalized search term and avoids turning weak performance into an aggressive phrase or broad exclusion. Phrase and broad remain explicit supported model values for a later human-authored/revalidated workflow.

An ad-group name produces an ad-group-level proposal; a missing ad-group name falls back to campaign level. Account-wide scope is not claimed. Historical affected traffic is the deterministic sum of the proposal's source rows: spend, clicks, impressions, conversions, optional conversion value, and CPA only when conversions make it mathematically meaningful. These values are historical observations, not a forecast or guaranteed future savings.

## Evidence, AI, isolation, and missing data

Each proposal cites workspace-namespaced evidence IDs that resolve to actual normalized search-term rows, campaign/ad-group context, source metrics, and the analysis-period label. Unknown evidence IDs fail result validation.

OpenAI is optional and receives a bounded projection of already-approved deterministic proposals. It may only return an ordering of known proposal IDs. It cannot add candidates, rewrite terms or rationale, change match type/scope/metrics, override protection checks, or execute actions. Unknown IDs, duplicates, malformed output, missing configuration, and service failures preserve the deterministic proposals and ordering. OpenAI storage is disabled.

No proposal data is durably stored. The route is private/no-store and membership resolution occurs before data loading. Credentials remain in existing server-only adapters and are absent from the DTO. Empty search-term data returns `insufficient_evidence`; nonqualifying, zero-spend, protected, or conflicted data returns `no_candidates`; missing conversion value remains explicitly `null`. Live Google Ads failure retains the existing visibly labeled sample fallback behavior.

## Demo and verification

The fictional Northstar fixture contains three modest, clearly nonconverting career/training-intent rows that meet the materiality floor. Existing brand, targeted, and converted rows remain protected; the fixture was not inflated to create a large proposal set.

Run:

```bash
npm run verify:negative-keywords
```

The verifier covers deterministic thresholds, protected and converted terms, duplicate aggregation, match types, evidence, historical metrics, missing and zero data, recent-period uncertainty, existing-negative awareness, bounded AI fallback, workspace isolation, unauthorized/foreign access, secret boundaries, and the absence of a Google Ads mutation path.
