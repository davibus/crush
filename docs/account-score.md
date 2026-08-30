# Marketing account score

The Crush marketing account score is a deterministic, explainable assessment built on the account audit in `lib/account-audit.ts`. It uses the audit's calculated Google Ads metrics, section coverage, findings, evidence, and rule IDs. It does not call an LLM, use random values, or depend on the current time.

The primary API is `calculateAccountScore(input)`, which accepts the same `AccountAuditInput` as `runAccountAudit`. `scoreAccountAudit(audit, availability)` is also available when the caller already has an audit result and explicit dataset-availability information.

## Overall score and weights

Every component and the overall result is constrained to 0-100 and rounded to the nearest whole point. The overall score is the weighted sum of the rounded component scores:

| Component | Weight |
| --- | ---: |
| Performance | 30% |
| Efficiency | 25% |
| Waste control | 20% |
| Growth opportunity | 10% |
| Tracking and data quality | 15% |
| **Total** | **100%** |

The weights are exported as `ACCOUNT_SCORE_WEIGHTS`. Higher is better for every component. In particular, a high growth-opportunity score means the data supports credible actions or measured scaling; it does not mean the account has more problems.

## Components

### Performance

Performance starts at 100 when measurable campaign activity is present. It reflects conversion outcomes, conversion rate, measured ROAS, and the audit's strong- and weak-campaign findings.

| Rule | Effect |
| --- | ---: |
| Account conversion rate below 1% with at least the audit's minimum click threshold | -15 |
| Account conversion rate from 1% to below 2% with at least the minimum click threshold | -8 |
| Measured ROAS below 1.0 when spend and conversion value are present | -15 |
| Measured ROAS from 1.0 to below 2.0 | -8 |
| Audit `analyzer-low_conversion_rate` finding | -12 each |
| Audit `analyzer-high_spend_low_conversions` finding | -18 each |
| Audit `account-zero-conversions` finding | -25 each |
| Audit `analyzer-strong_performer` finding | Reported as a positive factor; no extra points because the component already starts at 100 |

If no measurable campaign activity exists, performance is `insufficient_data` and receives the documented neutral score of 50 rather than an invented performance judgment.

### Efficiency

Efficiency starts at 100 when spend exists. It relies on the audit's relative CPA, conversion-efficiency, CPC/spend context, device, geography, and budget-allocation rules instead of assuming a universal good CPA or CPC.

| Audit rule | Effect |
| --- | ---: |
| `analyzer-high_cpa` | -12 each |
| `analyzer-high_spend_low_conversions` | -18 each |
| `high-cpa` for a keyword or landing page | -8 each |
| `high-cpa-location` | -8 each |
| `low-conversion-rate-device` | -6 each |
| `analyzer-device_performance_difference` | -6 each |
| `concentrated-high-cpa-spend` | -15 each |
| `material-spend-without-conversions` | -25 each |
| `analyzer-strong_performer` | Reported as a positive factor; no extra points |

With zero spend, CPA and spend allocation cannot be evaluated, so the component is `insufficient_data` and uses the neutral score of 50.

### Waste control

Waste control starts at 100 when spend exists. A higher score means less supported waste was found. Deductions come directly from audit findings and are additive before the 0-100 bound is applied.

| Audit rule | Effect |
| --- | ---: |
| `analyzer-search_term_waste` | -12 each |
| `analyzer-negative_keyword_opportunity` | -8 each |
| `spend-without-conversions` for a keyword or landing page | -12 each |
| `broad-match-concentration` | -8 each |
| `analyzer-high_spend_low_conversions` | -15 each |
| `material-spend-without-conversions` | -20 each |

Missing keyword or search-term data marks the component `partial`; it does not prove that waste is absent. Dataset coverage is deducted in tracking/data quality. With zero spend, waste is unevaluable and receives a neutral 50.

### Growth opportunity

Growth opportunity starts at a neutral 50. Supported opportunities add points, while a small set of readiness blockers deducts points. This is intentionally different from the other health components: finding a sound opportunity improves the score rather than punishing the account for having room to grow.

| Supported audit factor | Effect |
| --- | ---: |
| `analyzer-strong_performer` | +10 each |
| `analyzer-budget_opportunity` | +10 each |
| `analyzer-geographic_opportunity` | +8 each |
| `analyzer-device_performance_difference` | +4 each |
| `low-conversion-rate-device` | +4 each |
| Landing-page or keyword `spend-without-conversions` | +5 each as a supported optimization opportunity |
| Landing-page or keyword `high-cpa` | +5 each as a supported optimization opportunity |
| `account-zero-conversions` blocker | -20 each |
| `material-spend-without-conversions` blocker | -15 each |
| `conversion-total-mismatch` blocker | -10 each |
| `analyzer-high_spend_low_conversions` blocker | -10 each |

Missing geography, device, or landing-page data marks this component `partial`, but the missing coverage itself is handled by tracking/data quality.

### Tracking and data quality

Tracking/data quality starts at 100 and measures whether important account areas can be evaluated consistently.

| Rule | Effect |
| --- | ---: |
| Each optional dataset not provided | -6 |
| Each optional dataset provided with zero rows | -4 |
| Campaign data with no measurable activity | -30 |
| Audit `conversion-total-mismatch` finding | -20 |
| Audit `account-zero-conversions` finding | -10 |
| Conversions present but aggregate conversion value is zero | -8 |

The six optional/supporting datasets are conversions, geographies, devices, keywords, search terms, and landing pages. A missing dataset means `undefined`; an explicitly supplied empty array is treated as known but insufficient and therefore has a smaller deduction. Missing conversion value is not deducted when no conversions exist, and ROAS is not scored without measured conversion value.

## Explanations and evidence

Every component returns:

- its numeric score, starting score, and coverage status;
- a human-readable explanation;
- ordered deductions with point values and reasons;
- ordered opportunities or positive factors where supported;
- audit finding IDs, audit rule IDs, and source evidence when a factor came from the audit; and
- a stable list of supporting rule IDs.

The top-level result also aggregates all deductions and opportunities so a caller can explain the overall result without reverse-engineering the formula.

## Deterministic guarantees

The methodology uses only fixed exported weights, thresholds, deductions, bonuses, and the deterministic account audit. Factors are sorted by stable IDs, scores use explicit nearest-whole-point rounding, and all scores are bounded to 0-100. There are no LLM calls, random values, timestamps, network calls, or environment-dependent scoring branches. Equivalent input row ordering produces the same output.

Changing a fixed rule, threshold, weight, formula, missing-data treatment, or interpretation requires a methodology version change. The current version is exported as `ACCOUNT_SCORE_METHODOLOGY_VERSION` and is **1.0.0**.
