import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  AI_INSIGHT_SECTIONS,
  buildAiInsightSections,
  formatConfidence,
  formatEvidenceValue,
  getAiInsightSection,
} from "../lib/ai-insight-presentation.ts";
import type { MarketingInsight } from "../lib/marketing-insights.ts";

const baseInsight: MarketingInsight = {
  problemOpportunity: "CPA is materially above the account benchmark.",
  severity: "high",
  affectedEntity: {
    type: "campaign",
    id: "campaign-1",
    name: "Competitor Search",
  },
  evidence: [
    {
      metric: "CPA",
      value: 82.5,
      unit: "currency",
      context: "Campaign metrics; account CPA is 54.20.",
    },
  ],
  recommendedAction: "Reduce inefficient targeting or bids before adding spend.",
  expectedImpact: "Improve cost efficiency while monitoring conversion volume.",
  confidenceScore: 0.91,
};

assert.deepEqual(
  AI_INSIGHT_SECTIONS.map(({ title }) => title),
  [
    "Critical issues",
    "Opportunities",
    "Budget recommendations",
    "Keyword recommendations",
    "Landing-page recommendations",
  ],
  "Every required AI insight section must be present.",
);

assert.equal(getAiInsightSection(baseInsight), "critical");
assert.equal(
  getAiInsightSection({
    ...baseInsight,
    severity: "medium",
    recommendedAction:
      "Test a measured budget reallocation while monitoring marginal CPA and ROAS.",
  }),
  "budget",
);
assert.equal(
  getAiInsightSection({
    ...baseInsight,
    recommendedAction: "Review query intent, ads, and landing-page alignment.",
  }),
  "landing-page",
);
assert.equal(
  getAiInsightSection({
    ...baseInsight,
    affectedEntity: {
      type: "search_term",
      id: "term-1",
      name: "free google ads help",
    },
  }),
  "keyword",
);
assert.equal(
  getAiInsightSection({ ...baseInsight, severity: "medium" }),
  "opportunities",
);

const sections = buildAiInsightSections([baseInsight]);
assert.equal(sections.length, 5, "Empty categories must still render safely.");
assert.equal(
  sections.find(({ id }) => id === "critical")?.insights[0]
    ?.problemOpportunity,
  baseInsight.problemOpportunity,
  "A structured insight was not preserved by the presentation layer.",
);
assert.equal(
  sections.filter(({ insights }) => insights.length === 0).length,
  4,
  "The panel did not retain empty sections.",
);
assert.deepEqual(
  buildAiInsightSections(undefined).map(({ insights }) => insights.length),
  [0, 0, 0, 0, 0],
  "Unavailable insight data must not crash section building.",
);
assert.deepEqual(
  buildAiInsightSections([null, {}, { severity: "urgent" }]).map(
    ({ insights }) => insights.length,
  ),
  [0, 0, 0, 0, 0],
  "Malformed insight data must be ignored safely.",
);

assert.equal(formatEvidenceValue(baseInsight.evidence[0]!, "USD"), "$82.50");
assert.equal(formatConfidence(baseInsight.confidenceScore), "91%");

const componentSource = await readFile(
  new URL("../app/components/ai-insights-panel.tsx", import.meta.url),
  "utf8",
);
for (const label of [
  "Evidence",
  "Confidence",
  "Recommended action",
  "Expected impact",
]) {
  assert.ok(componentSource.includes(label), `The panel is missing ${label}.`);
}
assert.ok(
  !componentSource.includes("JSON.stringify"),
  "The human-readable insight panel must not depend on raw JSON.",
);

console.log(
  "Verified all AI insight sections, deterministic categorization, human-readable evidence and confidence, empty states, and malformed-data safety.",
);
