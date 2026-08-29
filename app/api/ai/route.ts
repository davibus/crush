import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import conversionData from "@/data/google-ads-conversions.json";
import geographyData from "@/data/google-ads-geography.json";
import keywordData from "@/data/google-ads-keywords.json";
import googleAdsData from "@/data/google-ads-sample.json";
import searchTermData from "@/data/google-ads-search-terms.json";
import {
  buildCampaignAnalysisPrompt,
  prepareCampaignPerformanceAnalysis,
  validateCampaignAnalysisResponse,
} from "@/lib/campaign-performance-analyzer";
import {
  type GoogleAdsConversion,
  type GoogleAdsGeography,
  type GoogleAdsKeyword,
  type GoogleAdsSampleData,
  type GoogleAdsSearchTerm,
} from "@/lib/google-ads";
import { marketingInsightsResponseSchema } from "@/lib/marketing-insights";

const MODEL = "gpt-4o-mini";
const MAX_PROMPT_LENGTH = 500;
const analysis = prepareCampaignPerformanceAnalysis({
  campaignData: googleAdsData as GoogleAdsSampleData,
  conversions: conversionData.conversions as GoogleAdsConversion[],
  geographies: geographyData.locations as GoogleAdsGeography[],
  keywords: keywordData.keywords as GoogleAdsKeyword[],
  searchTerms: searchTermData.searchTerms as GoogleAdsSearchTerm[],
});

type AiRequest = {
  prompt?: unknown;
};

function errorResponse(error: string, status: number) {
  return Response.json({ insights: [], error }, { status });
}

function analysisSummary() {
  return {
    candidateCount: analysis.candidates.length,
    candidateCategories: [
      ...new Set(analysis.candidates.map((item) => item.category)),
    ],
    unavailableDimensions: Object.entries(analysis.dimensionAvailability)
      .filter(([, available]) => !available)
      .map(([dimension]) => dimension),
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
        "You are a paid-media analyst. Return actionable marketing insights using only the prepared Google Ads analysis. Follow its candidate and evidence constraints exactly. Every insight must identify a problem or opportunity, recommend a specific action, describe the expected directional impact without inventing numbers, and express confidence from 0 to 1. Do not fabricate opportunities. Return no more than five insights.",
      input: buildCampaignAnalysisPrompt(analysis, prompt),
      text: {
        format: zodTextFormat(
          marketingInsightsResponseSchema,
          "marketing_insights",
        ),
      },
      max_output_tokens: 1200,
      store: false,
    });
    const validation = validateCampaignAnalysisResponse(
      response.output_parsed,
      analysis,
    );

    if (!validation.success) {
      return errorResponse(validation.error, 502);
    }

    return Response.json({
      insights: validation.insights,
      analysis: analysisSummary(),
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API request failed", {
        status: error.status,
        message: error.message,
        type: error.type,
        code: error.code,
        requestId: error.requestID,
        fullError: error,
      });
    }

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
