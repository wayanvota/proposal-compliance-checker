import { z } from "zod";
import { NOT_ASSESSED, PREPRINT_CAVEAT } from "./constants";

export type FindingStatus =
  | "PRESENT"
  | "MISSING"
  | "NON_COMPLIANT"
  | "NEEDS_HUMAN_REVIEW";

export type Requirement = {
  id: string;
  section: string;
  requirement: string;
  citation: string;
  category:
    | "narrative"
    | "budget"
    | "eligibility"
    | "format"
    | "attachment"
    | "biosketch"
    | "other";
};

export type RequirementSet = {
  requirements: Requirement[];
};

export type ProposalSection = {
  title: string;
  text: string;
  wordCount: number;
  estimatedPages: number;
};

export type Finding = {
  section: string;
  requirementId: string;
  requirement: string;
  status: FindingStatus;
  evidence: string;
  citedRequirement: string;
  humanReviewNote?: string;
};

export type ComplianceReport = {
  generatedAt: string;
  caveat: string;
  notAssessed: string[];
  sectionsReviewed: string[];
  findings: Finding[];
};

export type LlmCall = (messages: ReviewMessage[]) => Promise<string>;

export type ReviewMessage = {
  role: "system" | "user";
  content: string;
};

const requirementSchema = z.object({
  requirements: z
    .array(
      z.object({
        id: z.string().min(1),
        section: z.string().min(1),
        requirement: z.string().min(1),
        citation: z.string().min(1),
        category: z.enum([
          "narrative",
          "budget",
          "eligibility",
          "format",
          "attachment",
          "biosketch",
          "other"
        ])
      })
    )
    .min(1)
});

const findingSchema = z.object({
  findings: z.array(
    z.object({
      requirementId: z.string().min(1),
      requirement: z.string().min(1),
      status: z.enum([
        "PRESENT",
        "MISSING",
        "NON_COMPLIANT",
        "NEEDS_HUMAN_REVIEW"
      ]),
      evidence: z.string().min(1),
      citedRequirement: z.string().min(1),
      humanReviewNote: z.string().optional()
    })
  )
});

export async function reviewProposal({
  solicitationText,
  proposalText,
  callModel
}: {
  solicitationText: string;
  proposalText: string;
  callModel: LlmCall;
}): Promise<ComplianceReport> {
  const requirementSet = await extractRequirements(solicitationText, callModel);
  const proposalSections = splitProposalIntoSections(proposalText);
  const findings: Finding[] = [];

  for (const section of proposalSections) {
    const sectionRequirements = selectRequirementsForSection(
      requirementSet.requirements,
      section.title
    );
    const sectionFindings = await reviewSingleSection({
      section,
      requirements: sectionRequirements,
      callModel
    });
    findings.push(...sectionFindings);
  }

  return {
    generatedAt: new Date().toISOString(),
    caveat: PREPRINT_CAVEAT,
    notAssessed: NOT_ASSESSED,
    sectionsReviewed: proposalSections.map((section) => section.title),
    findings
  };
}

export async function extractRequirements(
  solicitationText: string,
  callModel: LlmCall
): Promise<RequirementSet> {
  const content = await callModel([
    {
      role: "system",
      content:
        "You extract grant solicitation requirements. Return JSON only. Do not judge proposal quality, clarity, persuasiveness, score, odds, or likely outcome."
    },
    {
      role: "user",
      content: `Extract every compliance and completeness requirement from this solicitation. Include narrative components, budget rules, eligibility, page or format limits, required attachments, and bio sketch requirements.

Return this JSON shape:
{
  "requirements": [
    {
      "id": "R1",
      "section": "Project Narrative",
      "requirement": "Specific requirement in plain language",
      "citation": "Exact or close solicitation text supporting the requirement",
      "category": "narrative|budget|eligibility|format|attachment|biosketch|other"
    }
  ]
}

Solicitation:
${trimForPrompt(solicitationText)}`
    }
  ]);

  return requirementSchema.parse(parseJson(content));
}

export async function reviewSingleSection({
  section,
  requirements,
  callModel
}: {
  section: ProposalSection;
  requirements: Requirement[];
  callModel: LlmCall;
}): Promise<Finding[]> {
  const content = await callModel([
    {
      role: "system",
      content:
        "You perform a pre-submission compliance check for one proposal section only. Return JSON only. Flag completeness and compliance. Do not score quality, judge persuasiveness, judge clarity, predict outcomes, or decide whether to submit."
    },
    {
      role: "user",
      content: `Review only this proposal section against only these requirements. Mark each requirement PRESENT, MISSING, NON_COMPLIANT, or NEEDS_HUMAN_REVIEW. Cite the solicitation requirement behind every finding.

Section title: ${section.title}
Estimated pages: ${section.estimatedPages}
Word count: ${section.wordCount}

Requirements:
${JSON.stringify(requirements, null, 2)}

Proposal section:
${trimForPrompt(section.text)}

Return this JSON shape:
{
  "findings": [
    {
      "requirementId": "R1",
      "requirement": "Requirement text",
      "status": "PRESENT|MISSING|NON_COMPLIANT|NEEDS_HUMAN_REVIEW",
      "evidence": "Short evidence from the draft or what is missing",
      "citedRequirement": "Solicitation text or requirement citation",
      "humanReviewNote": "Optional note for the reviewer"
    }
  ]
}`
    }
  ]);

  const parsed = findingSchema.parse(parseJson(content));
  return parsed.findings.map((finding) => ({
    section: section.title,
    ...finding
  }));
}

export function splitProposalIntoSections(proposalText: string): ProposalSection[] {
  const normalized = proposalText.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const headingPattern =
    /^(#{1,3}\s+.+|[A-Z][A-Za-z0-9 &,/()'-]{2,80}:?|[0-9]+[.)]\s+[A-Z].{2,80})$/gm;
  const matches = Array.from(normalized.matchAll(headingPattern)).filter(
    (match) => (match.index ?? 0) === 0 || normalized[(match.index ?? 1) - 1] === "\n"
  );

  if (matches.length < 2) {
    return [makeSection("Full draft", normalized)];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const contentStart = start + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const title = cleanHeading(match[0]);
    const text = normalized.slice(contentStart, end).trim();
    return makeSection(title, text || match[0]);
  });
}

export function selectRequirementsForSection(
  requirements: Requirement[],
  sectionTitle: string
): Requirement[] {
  const title = sectionTitle.toLowerCase();

  if (title === "full draft") {
    return requirements;
  }

  const matched = requirements.filter((requirement) => {
    const section = requirement.section.toLowerCase();
    return section.includes(title) || title.includes(section);
  });

  if (matched.length > 0) {
    return matched;
  }

  return requirements.filter((requirement) =>
    ["eligibility", "format", "attachment", "biosketch", "budget", "other"].includes(
      requirement.category
    )
  );
}

export function parseJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1] ?? trimmed;
  return JSON.parse(jsonText);
}

function makeSection(title: string, text: string): ProposalSection {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    title,
    text,
    wordCount,
    estimatedPages: Math.max(1, Math.ceil(wordCount / 500))
  };
}

function cleanHeading(heading: string): string {
  return heading
    .replace(/^#{1,3}\s+/, "")
    .replace(/^[0-9]+[.)]\s+/, "")
    .replace(/:$/, "")
    .trim();
}

function trimForPrompt(text: string): string {
  const limit = 45_000;
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n\n[Truncated for prompt length. Review may be incomplete.]`;
}
