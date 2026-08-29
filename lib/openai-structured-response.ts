export type StructuredResponseFailureReason =
  | "incomplete"
  | "refusal"
  | "missing_output"
  | "invalid_json";

type ResponseContent = {
  type?: string;
  parsed?: unknown;
  text?: string;
};

type ResponseOutputItem = {
  type?: string;
  status?: string | null;
  content?: ResponseContent[];
};

export type OpenAIStructuredResponse = {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_parsed?: unknown;
  output_text?: string;
  output?: ResponseOutputItem[];
};

export type ExtractedStructuredResponse =
  | {
      success: true;
      value: unknown;
      source: "output_parsed" | "content_parsed" | "output_text";
      outputTextLength: number;
    }
  | {
      success: false;
      reason: StructuredResponseFailureReason;
      outputTextLength: number;
    };

function outputText(response: OpenAIStructuredResponse): string {
  if (typeof response.output_text === "string") return response.output_text;

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter(
      (content): content is ResponseContent & { text: string } =>
        content.type === "output_text" && typeof content.text === "string",
    )
    .map((content) => content.text)
    .join("");
}

export function extractOpenAIStructuredResponse(
  response: OpenAIStructuredResponse,
): ExtractedStructuredResponse {
  const rawText = outputText(response);

  if (response.status === "incomplete") {
    return {
      success: false,
      reason: "incomplete",
      outputTextLength: rawText.length,
    };
  }

  const content = (response.output ?? []).flatMap((item) => item.content ?? []);
  if (content.some((item) => item.type === "refusal")) {
    return {
      success: false,
      reason: "refusal",
      outputTextLength: rawText.length,
    };
  }

  if (response.output_parsed !== null && response.output_parsed !== undefined) {
    return {
      success: true,
      value: response.output_parsed,
      source: "output_parsed",
      outputTextLength: rawText.length,
    };
  }

  const parsedContent = content.find(
    (item) => item.parsed !== null && item.parsed !== undefined,
  )?.parsed;
  if (parsedContent !== undefined) {
    return {
      success: true,
      value: parsedContent,
      source: "content_parsed",
      outputTextLength: rawText.length,
    };
  }

  if (!rawText.trim()) {
    return {
      success: false,
      reason: "missing_output",
      outputTextLength: 0,
    };
  }

  try {
    return {
      success: true,
      value: JSON.parse(rawText) as unknown,
      source: "output_text",
      outputTextLength: rawText.length,
    };
  } catch {
    return {
      success: false,
      reason: "invalid_json",
      outputTextLength: rawText.length,
    };
  }
}
