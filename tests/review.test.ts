import { describe, expect, it } from "vitest";
import {
  PREPRINT_CAVEAT,
  NOT_ASSESSED
} from "../src/lib/constants";
import {
  reviewProposal,
  selectRequirementsForSection,
  splitProposalIntoSections,
  type Requirement,
  type LlmCall,
  type ReviewMessage
} from "../src/lib/review";

describe("proposal compliance review architecture", () => {
  it("extracts requirements once, then reviews each proposal section in an independent pass", async () => {
    const calls: ReviewMessage[][] = [];
    const callModel: LlmCall = async (messages) => {
      calls.push(messages);
      const prompt = messages.map((message) => message.content).join("\n");

      if (prompt.includes("Extract every compliance")) {
        return JSON.stringify({
          requirements: [
            {
              id: "R1",
              section: "Project Narrative",
              requirement: "Include a dissemination plan.",
              citation: "Project Narrative must include a dissemination plan.",
              category: "narrative"
            },
            {
              id: "R2",
              section: "Budget",
              requirement: "Budget may not exceed $100,000.",
              citation: "Total budget must not exceed $100,000.",
              category: "budget"
            }
          ]
        });
      }

      if (prompt.includes("Section title: Project Narrative")) {
        expect(prompt).toContain("Proposal section:\nThis section has goals.");
        expect(prompt).not.toContain("The budget requests $120,000.");
        return JSON.stringify({
          findings: [
            {
              requirementId: "R1",
              requirement: "Include a dissemination plan.",
              status: "MISSING",
              evidence: "No dissemination plan is present.",
              citedRequirement: "Project Narrative must include a dissemination plan."
            }
          ]
        });
      }

      if (prompt.includes("Section title: Budget")) {
        expect(prompt).toContain("The budget requests $120,000.");
        expect(prompt).not.toContain("This section has goals.");
        return JSON.stringify({
          findings: [
            {
              requirementId: "R2",
              requirement: "Budget may not exceed $100,000.",
              status: "NON_COMPLIANT",
              evidence: "The draft requests $120,000.",
              citedRequirement: "Total budget must not exceed $100,000."
            }
          ]
        });
      }

      throw new Error("Unexpected model call");
    };

    const report = await reviewProposal({
      solicitationText:
        "Project Narrative must include a dissemination plan. Total budget must not exceed $100,000.",
      proposalText:
        "Project Narrative\nThis section has goals.\n\nBudget\nThe budget requests $120,000.",
      callModel
    });

    expect(calls).toHaveLength(3);
    expect(report.sectionsReviewed).toEqual(["Project Narrative", "Budget"]);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "MISSING", requirementId: "R1" }),
        expect.objectContaining({ status: "NON_COMPLIANT", requirementId: "R2" })
      ])
    );
  });

  it("includes the fixed caveat and the fixed human-review blind spots", async () => {
    const callModel: LlmCall = async (messages) => {
      const prompt = messages.map((message) => message.content).join("\n");
      if (prompt.includes("Extract every compliance")) {
        return JSON.stringify({
          requirements: [
            {
              id: "R1",
              section: "Full draft",
              requirement: "Attach resumes.",
              citation: "Applicants must attach resumes.",
              category: "attachment"
            }
          ]
        });
      }
      return JSON.stringify({
        findings: [
          {
            requirementId: "R1",
            requirement: "Attach resumes.",
            status: "NEEDS_HUMAN_REVIEW",
            evidence: "Attachments were not included in the pasted text.",
            citedRequirement: "Applicants must attach resumes."
          }
        ]
      });
    };

    const report = await reviewProposal({
      solicitationText: "Applicants must attach resumes.",
      proposalText: "Proposal text.",
      callModel
    });

    expect(report.caveat).toBe(PREPRINT_CAVEAT);
    expect(report.notAssessed).toEqual(NOT_ASSESSED);
  });

  it("splits obvious proposal headings into separate review sections", () => {
    const sections = splitProposalIntoSections(
      "Project Narrative\nThe plan.\n\nBudget\nThe budget.\n\nEvaluation\nThe measures."
    );

    expect(sections.map((section) => section.title)).toEqual([
      "Project Narrative",
      "Budget",
      "Evaluation"
    ]);
  });

  it("reviews a full-draft proposal against all extracted requirements", () => {
    const requirements: Requirement[] = [
      {
        id: "R1",
        section: "Project Narrative",
        requirement: "Include a dissemination plan.",
        citation: "The proposal must include a dissemination plan.",
        category: "narrative"
      },
      {
        id: "R2",
        section: "Budget",
        requirement: "Budget may not exceed $100,000.",
        citation: "The total budget may not exceed $100,000.",
        category: "budget"
      }
    ];

    expect(selectRequirementsForSection(requirements, "Full draft")).toEqual(
      requirements
    );
  });

  it("reviews requirements without a matching proposal section in one full-draft pass", async () => {
    const calls: ReviewMessage[][] = [];
    const callModel: LlmCall = async (messages) => {
      calls.push(messages);
      const prompt = messages.map((message) => message.content).join("\n");
      if (prompt.includes("Extract every compliance")) {
        return JSON.stringify({ requirements: [
          {
            id: "R1",
            section: "Project Narrative",
            requirement: "Include goals.",
            citation: "The narrative must include goals.",
            category: "narrative"
          },
          {
            id: "R2",
            section: "Attachments",
            requirement: "Attach resumes.",
            citation: "Applicants must attach resumes.",
            category: "attachment"
          }
        ] });
      }
      const isFullDraft = prompt.includes("Section title: Full draft");
      return JSON.stringify({ findings: [{
        requirementId: isFullDraft ? "R2" : "R1",
        requirement: isFullDraft ? "Attach resumes." : "Include goals.",
        status: isFullDraft ? "NEEDS_HUMAN_REVIEW" : "PRESENT",
        evidence: isFullDraft ? "Attachment not visible." : "Goals are present.",
        citedRequirement: isFullDraft ? "Applicants must attach resumes." : "The narrative must include goals."
      }] });
    };

    const report = await reviewProposal({
      solicitationText: "The narrative must include goals. Applicants must attach resumes.",
      proposalText: "Project Narrative\nGoals are present.\n\nBudget\n$10,000",
      callModel
    });

    expect(report.sectionsReviewed).toEqual(["Project Narrative", "Budget", "Full draft"]);
    expect(report.findings.map((finding) => finding.requirementId)).toEqual(["R1", "R2"]);
    expect(calls).toHaveLength(3);
  });
});
