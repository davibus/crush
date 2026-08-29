import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import googleAdsData from "@/data/google-ads-sample.json";
import {
  aggregateGoogleAdsMetrics,
  calculateGoogleAdsMetrics,
  type GoogleAdsSampleData,
} from "@/lib/google-ads";
import {
  marketingInsightsResponseSchema,
  validateMarketingInsights,
} from "@/lib/marketing-insights";

const MODEL = "gpt-4o-mini";
const MAX_PROMPT_LENGTH = 500;
const data = googleAdsData as GoogleAdsSampleData;

type AiRequest = {
  prompt?: unknown;
};

function errorResponse(error: string, status: number) {
  return Response.json({ insights: [], error }, { status });
}

function representativeMarketingData() {
  const totals = aggregateGoogleAdsMetrics(
    data.campaigns.map((campaign) => campaign.metrics),
  );

  return {
    account: {
      name: data.account.name,
      currency: data.account.currency,
    },
    accountMetrics: totals,
    campaignSample: data.campaigns.slice(0, 2).map((campaign) => ({
      name: campaign.name,
      status: campaign.status,
      channel: campaign.channel,
      dailyBudget: campaign.dailyBudget,
      metrics: calculateGoogleAdsMetrics(campaign.metrics),
    })),
  };
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return errorResponse(
      "AI is not configured. Add OPENAI_API_KEY to .env.local and restart the development server.",
      503,
    );
  }

  let body: AiRequest;

  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return errorResponse("Prompt must be a non-empty string.", 400);
  }

  const prompt = body.prompt.trim();

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return errorResponse(
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      400,
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: MODEL,
      instructions:
        "You are a paid-media analyst. Return actionable marketing insights using only the supplied Google Ads data. Every insight must identify a problem or opportunity, use evidence from the supplied metrics, recommend an action, estimate the expected impact without inventing unsupported numbers, and express confidence from 0 (no confidence) to 1 (complete confidence). Return no more than five insights. Return an empty insights array when the data does not support an insight.",
      input: `${prompt}\n\nRepresentative Google Ads data:\n${JSON.stringify(representativeMarketingData())}`,
      text: {
        format: zodTextFormat(
          marketingInsightsResponseSchema,
          "marketing_insights",
        ),
      },
      max_output_tokens: 1200,
      store: false,
    });
    const validation = validateMarketingInsights(response.output_parsed);

    if (!validation.success) {
      return errorResponse(validation.error, 502);
    }

    return Response.json({ insights: validation.insights });
  } catch (error) {
    if (error instanceof OpenAI.RateLimitError) {
      if (error.code === "insufficient_quota") {
        return errorResponse(
          "The OpenAI account has no available API quota. Check billing and usage limits, then try again.",
          429,
        );
      }

      return errorResponse(
        "The AI service is temporarily rate limited. Please try again shortly.",
        429,
      );
    }

    if (error instanceof OpenAI.AuthenticationError) {
      return errorResponse(
        "The AI service could not authenticate. Check the server's OPENAI_API_KEY.",
        502,
      );
    }

    if (!(error instanceof OpenAI.APIError)) {
      return errorResponse(
        "The AI returned a malformed marketing insight response. Please try again.",
        502,
      );
    }

    return errorResponse(
      "The AI service could not complete the request. Please try again.",
      502,
    );
  }
}
