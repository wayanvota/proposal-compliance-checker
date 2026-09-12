import OpenAI from "openai";
import { NextResponse } from "next/server";
import { extractPdfText } from "@/src/lib/pdf";
import { reviewProposal, type ReviewMessage } from "@/src/lib/review";

export const runtime = "nodejs";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 1024 * 1024;

class InputError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer"
    }
  });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new InputError("The submitted documents are too large.", 413);
    }
    const formData = await request.formData();
    const submittedBytes = Array.from(formData.values()).reduce(
      (total, value) => total + (typeof value === "string" ? Buffer.byteLength(value) : value.size),
      0
    );
    if (submittedBytes > MAX_REQUEST_BYTES) {
      throw new InputError("The submitted documents are too large.", 413);
    }
    const solicitationText = await readDocumentInput(
      formData,
      "solicitationText",
      "solicitationFile"
    );
    const proposalText = await readDocumentInput(
      formData,
      "proposalText",
      "proposalFile"
    );

    if (!solicitationText.trim() || !proposalText.trim()) {
      return jsonResponse(
        { error: "Add both the solicitation and the draft proposal." },
        400
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse(
        { error: "OPENAI_API_KEY is not configured for this project." },
        503
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined
    });
    const report = await reviewProposal({
      solicitationText,
      proposalText,
      callModel: async (messages: ReviewMessage[]) => {
        const response = await client.chat.completions.create({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages
        });
        return response.choices[0]?.message.content ?? "{}";
      }
    });

    return jsonResponse(report);
  } catch (error) {
    if (error instanceof InputError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    console.error("Proposal review failed", error);
    return jsonResponse(
      { error: "The review could not be completed. Try again or review the documents manually." },
      502
    );
  }
}

async function readDocumentInput(
  formData: FormData,
  textKey: string,
  fileKey: string
): Promise<string> {
  const text = formData.get(textKey);
  const file = formData.get(fileKey);
  const parts: string[] = [];

  if (typeof text === "string" && text.trim()) {
    parts.push(text);
  }

  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf") {
      throw new InputError(`${file.name} must be a PDF.`, 400);
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new InputError(`${file.name} is too large. Use a PDF smaller than 1 MB.`, 413);
    }
    parts.push(await extractPdfText(file));
  }

  return parts.join("\n\n");
}
