import OpenAI from "openai";
import { NextResponse } from "next/server";
import { extractPdfText } from "@/src/lib/pdf";
import { reviewProposal, type ReviewMessage } from "@/src/lib/review";

export const runtime = "nodejs";

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
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
      return NextResponse.json(
        { error: "Add both the solicitation and the draft proposal." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not configured for this project." },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The review could not be completed.";
    return NextResponse.json({ error: message }, { status: 500 });
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
      throw new Error(`${file.name} must be a PDF.`);
    }
    parts.push(await extractPdfText(file));
  }

  return parts.join("\n\n");
}
