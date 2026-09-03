import "server-only";

import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  buildCampaignAnalysisPrompt,
  prepareCampaignPerformanceAnalysis,
  type PreparedCampaignPerformanceAnalysis,
  validateCampaignAnalysisResponse,
} from "@/lib/campaign-performance-analyzer";
import {
  marketingChatRequestSchema,
  marketingChatResponseSchema,
  type MarketingChatRequest,
} from "@/lib/marketing-data-chat";
import { marketingInsightsResponseSchema } from "@/lib/marketing-insights";
import { getMarketingData } from "@/lib/marketing-data-source";
import { buildPaidMediaAnalyticsContext } from "@/lib/paid-media-context";
import {
  extractOpenAIStructuredResponse,
  type OpenAIStructuredResponse,
} from "@/lib/openai-structured-response";
import { executeSpecialistWorkflow } from "@/lib/specialist-analysis";

const MODEL = "gpt-4o-mini";
const MAX_PROMPT_LENGTH = 500;
const MAX_OUTPUT_TOKENS = 5000;
type AiRequest = Record<string, unknown>;

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

function analysisSummary(analysis: PreparedCampaignPerformanceAnalysis) {
  return {
    candidateCount: analysis.candidates.length,
    candidateCategories: [
      ...new Set(analysis.candidates.map((item) => item.category)),
    ],
    unavailableDimensions: Object.entries(analysis.dimensionAvailability)
      .filter(([, available]) => !available)
      .map(([dimension]) => dimension),
    webAnalytics: analysis.webAnalytics
      ? {
          matchedCampaigns: analysis.webAnalytics.campaignComparisons.length,
          paidTrafficSources: analysis.webAnalytics.paidTrafficSources.length,
          sessions: analysis.webAnalytics.ga4Summary.sessions,
          keyEvents: analysis.webAnalytics.ga4Summary.keyEvents,
        }
      : undefined,
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Request body must be a JSON object.", 400);
  }

  const requestBody = body as AiRequest;
  const isChatRequest = "question" in requestBody || "history" in requestBody;
  let chatRequest: MarketingChatRequest | undefined;

  if (isChatRequest) {
    const parsed = marketingChatRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      return errorResponse(
        parsed.error.issues[0]?.message ?? "Chat request is invalid.",
        400,
      );
    }
    chatRequest = parsed.data;
  }

  if (!chatRequest && (typeof requestBody.prompt !== "string" || !requestBody.prompt.trim())) {
    return errorResponse("Prompt must be a non-empty string.", 400);
  }

  const prompt = chatRequest ? "" : (requestBody.prompt as string).trim();

  if (prompt.length > MAX_PROMPT_LENGTH) {
    return errorResponse(
      `Prompt must be ${MAX_PROMPT_LENGTH} characters or fewer.`,
      400,
    );
  }

  const marketingData = await getMarketingData();
  const webAnalytics =
    marketingData.ga4.status === "available"
      ? buildPaidMediaAnalyticsContext(
          marketingData.campaignData,
          marketingData.ga4.data,
        )
      : undefined;
  const analysis = prepareCampaignPerformanceAnalysis({
    campaignData: marketingData.campaignData,
    conversions: marketingData.conversions,
    devices: marketingData.devices,
    geographies: marketingData.geographies,
    keywords: marketingData.keywords,
    searchTerms: marketingData.searchTerms,
    webAnalytics,
  });

  if (chatRequest) {
    const specialistResult = executeSpecialistWorkflow(
      {
        analysis,
        dailyMetrics: marketingData.dailyMetrics,
        ga4: marketingData.ga4,
      },
      chatRequest,
    );
    const validated = marketingChatResponseSchema.safeParse(
      specialistResult.response,
    );
    if (!validated.success) {
      return errorResponse(
        "The prepared specialist answer failed structured validation.",
        500,
      );
    }
    return Response.json(validated.data);
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
        analysis: analysisSummary(analysis),
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
        `The AI returned an analysis that could not be safely validated against the loaded data. Please try again. Reference: ${reference}.`,
        502,
      );
    }

    return Response.json({
      insights: validation.insights,
      status: validation.status,
      ...(validation.status === "insufficient_data"
        ? { reason: validation.reason }
        : {}),
      analysis: analysisSummary(analysis),
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
