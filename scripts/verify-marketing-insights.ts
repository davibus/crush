import {
  validateMarketingInsights,
  type MarketingInsightsResponse,
} from "../lib/marketing-insights.ts";

const validPayload = {
  insights: [
    {
      problemOpportunity: "Campaign CPA is above the account average.",
      severity: "high",
      affectedEntity: {
        type: "campaign",
        id: "campaign-1",
        name: "Brand Search",
      },
      evidence: [
        {
          metric: "CPA",
          value: 82.5,
          unit: "currency",
          context: "The account average CPA is $54.20.",
        },
      ],
      recommendedAction: "Review search terms and add negative keywords.",
      expectedImpact: "Reduce wasted spend and move CPA toward the account average.",
      confidenceScore: 0.91,
    },
  ],
} satisfies MarketingInsightsResponse;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assert(validateMarketingInsights(validPayload).success, "Valid payload was rejected.");

const missingEvidence = structuredClone(validPayload) as Record<string, unknown>;
delete (missingEvidence.insights as Array<Record<string, unknown>>)[0].evidence;
assert(
  !validateMarketingInsights(missingEvidence).success,
  "Payload without evidence was accepted.",
);

const invalidConfidence = structuredClone(validPayload);
invalidConfidence.insights[0].confidenceScore = 1.01;
assert(
  !validateMarketingInsights(invalidConfidence).success,
  "Out-of-range confidence was accepted.",
);

const invalidSeverity = structuredClone(validPayload) as Record<string, unknown>;
(invalidSeverity.insights as Array<Record<string, unknown>>)[0].severity = "urgent";
assert(
  !validateMarketingInsights(invalidSeverity).success,
  "Arbitrary severity was accepted.",
);

const unknownField = {
  ...validPayload,
  commentary: "This arbitrary prose must not be accepted.",
};
assert(
  !validateMarketingInsights(unknownField).success,
  "Unknown response fields were accepted.",
);

console.log("Marketing insight schema verification passed.");
