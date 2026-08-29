import "server-only";

import { randomUUID } from "node:crypto";
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
import {
  extractOpenAIStructuredResponse,
  type OpenAIStructuredResponse,
} from "@/lib/openai-structured-response";

const MODEL = "gpt-4o-mini";
const MAX_PROMPT_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 5000;
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

function diagnosticId() {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function logResponseFailure(
  reference: string,
  response: OpenAIStructuredResponse,
  details: Record<string, unknown>,
) {
  console.error(
    `AI marketing insight response rejected ${JSON.stringify({
      reference,
      model: MODEL,
      responseId: response.id,
      status: response.status,
      incompleteReason: response.incomplete_details?.reason,
      outputTextLength:
        typeof response.output_text === "string"
          ? response.output_text.length
          : undefined,
      outputItems: (response.output ?? []).map((item) => ({
        type: item.type,
        status: item.status,
        contentTypes: (item.content ?? []).map((content) => content.type),
      })),
      ...details,
    })}`,
  );
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

  if (analysis.candidates.length === 0) {
    const insufficient = validateCampaignAnalysisResponse(
      { insights: [] },
      analysis,
    );

    if (insufficient.success) {
      return Response.json({
        insights: insufficient.insights,
        status: insufficient.status,
        ...(insufficient.status === "insufficient_data"
          ? { reason: insufficient.reason }
          : {}),
        analysis: analysisSummary(),
      });
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return errorResponse(
      "AI is not configured. Add OPENAI_API_KEY to .env.local and restart the development server.",
      503,
    );
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.parse({
      model: MODEL,
      instructions:
        "You are selecting paid-media insights, not creating them. The prepared deterministic candidates are the only source of truth. Copy every selected candidate's entity, severity, finding, action, expected impact, and required evidence exactly. Never invent or change metrics, values, entities, findings, explanations, or recommendations. Never claim causes the supplied data does not prove. Return an empty insights array when the candidates do not support the request. Return no more than five insights.",
      input: buildCampaignAnalysisPrompt(analysis, prompt),
      text: {
        format: zodTextFormat(
          marketingInsightsResponseSchema,
          "marketing_insights",
          {
            description:
              "Up to five evidence-grounded paid-media insights selected verbatim from deterministic candidates.",
          },
        ),
      },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      store: false,
    });
    const extracted = extractOpenAIStructuredResponse(response);

    if (!extracted.success) {
      const reference = diagnosticId();
      logResponseFailure(reference, response, {
        extractionFailure: extracted.reason,
        extractedOutputTextLength: extracted.outputTextLength,
      });

      if (extracted.reason === "incomplete") {
        return errorResponse(
          `The AI analysis was cut off before it could complete the required format. Please try again. Reference: ${reference}.`,
          502,
        );
      }

      return errorResponse(
        `The AI did not return a complete structured analysis that could be safely validated. Please try again. Reference: ${reference}.`,
        502,
      );
    }

    const validation = validateCampaignAnalysisResponse(
      extracted.value,
      analysis,
    );

    if (!validation.success) {
      const reference = diagnosticId();
      logResponseFailure(reference, response, {
        parsedSource: extracted.source,
        extractedOutputTextLength: extracted.outputTextLength,
        validationError: validation.error,
        schemaIssues: "issues" in validation ? validation.issues : undefined,
      });
      return errorResponse(
        `The AI returned an analysis that could not be safely validated against the sample data. Please try again. Reference: ${reference}.`,
        502,
      );
    }

    return Response.json({
      insights: validation.insights,
      status: validation.status,
      ...(validation.status === "insufficient_data"
        ? { reason: validation.reason }
        : {}),
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
      const reference = diagnosticId();
      console.error(
        `AI marketing insight processing failed ${JSON.stringify({
          reference,
          model: MODEL,
          errorName: error instanceof Error ? error.name : "UnknownError",
        })}`,
      );
      return errorResponse(
        `The AI response could not be processed safely. Please try again. Reference: ${reference}.`,
        502,
      );
    }

    return errorResponse(
      "The AI service could not complete the request. Please try again.",
      502,
    );
  }
}
