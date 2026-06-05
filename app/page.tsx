"use client";

import { FormEvent, useMemo, useState } from "react";
import { ARXIV_SOURCE_URL, NOT_ASSESSED, PREPRINT_CAVEAT } from "@/src/lib/constants";
import type { ComplianceReport, FindingStatus } from "@/src/lib/review";

const statusLabels: Record<FindingStatus, string> = {
  PRESENT: "PRESENT",
  MISSING: "MISSING",
  NON_COMPLIANT: "NON-COMPLIANT",
  NEEDS_HUMAN_REVIEW: "NEEDS HUMAN REVIEW"
};

export default function Home() {
  const [solicitationText, setSolicitationText] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [solicitationFile, setSolicitationFile] = useState<File | null>(null);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = useMemo(
    () =>
      (solicitationText.trim() || solicitationFile) &&
      (proposalText.trim() || proposalFile) &&
      !isLoading,
    [isLoading, proposalFile, proposalText, solicitationFile, solicitationText]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReport(null);
    setIsLoading(true);

    const formData = new FormData();
    formData.append("solicitationText", solicitationText);
    formData.append("proposalText", proposalText);
    if (solicitationFile) formData.append("solicitationFile", solicitationFile);
    if (proposalFile) formData.append("proposalFile", proposalFile);

    try {
      const response = await fetch("/api/review", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The review failed.");
      setReport(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="title">
          <h1>Proposal Completeness & Compliance Checker</h1>
          <p>
            Run a pre-submission pass against a funder solicitation. The tool
            flags missing and non-compliant items, with the requirement behind
            each finding.
          </p>
        </div>
        <div className="source-note">
          Architecture: extract the requirement set first, then review each draft
          section in its own model pass. No persona panel is used.
          <br />
          <a href={ARXIV_SOURCE_URL} target="_blank" rel="noreferrer">
            arXiv 2603.08281
          </a>
        </div>
      </header>

      <div className="caveat">{PREPRINT_CAVEAT}</div>

      <section className="workspace" aria-label="Compliance checker workspace">
        <form className="panel" onSubmit={handleSubmit}>
          <h2>Documents</h2>
          <p>Paste text, upload PDFs, or use both. PDF text is extracted server-side.</p>

          <div className="input-group">
            <label htmlFor="solicitationText">
              Solicitation
              <span>NOFO, RFP, or funder guidelines</span>
            </label>
            <textarea
              id="solicitationText"
              value={solicitationText}
              onChange={(event) => setSolicitationText(event.target.value)}
              placeholder="Paste the solicitation text here."
            />
            <div className="file-row">
              <input
                aria-label="Upload solicitation PDF"
                type="file"
                accept="application/pdf"
                onChange={(event) => setSolicitationFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="proposalText">
              Draft proposal
              <span>Current working draft</span>
            </label>
            <textarea
              id="proposalText"
              value={proposalText}
              onChange={(event) => setProposalText(event.target.value)}
              placeholder="Paste the proposal draft here."
            />
            <div className="file-row">
              <input
                aria-label="Upload proposal PDF"
                type="file"
                accept="application/pdf"
                onChange={(event) => setProposalFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          <button className="primary" type="submit" disabled={!canSubmit}>
            {isLoading ? "Reviewing sections..." : "Run compliance review"}
          </button>

          {error ? <div className="error">{error}</div> : null}
        </form>

        <ReportPanel report={report} isLoading={isLoading} />

        <aside className="aside" aria-label="Not assessed by this tool">
          <h2>Not assessed by this tool</h2>
          <p>Read these yourself before any submission decision.</p>
          <ul>
            {NOT_ASSESSED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="aside-note">
            The model flags and lists. A human reviewer decides what matters,
            what needs revision, and whether the proposal is ready.
          </div>
        </aside>
      </section>
    </main>
  );
}

function ReportPanel({ report, isLoading }: { report: ComplianceReport | null; isLoading: boolean }) {
  return (
    <section className="report" aria-label="Section-by-section report">
      <div className="report-header">
        <div>
          <h2>Section-by-section report</h2>
          <p>
            Each requirement is marked against the relevant draft section with a
            cited solicitation requirement.
          </p>
        </div>
        <div className="report-meta">
          {report ? `${report.sectionsReviewed.length} sections reviewed` : "No report yet"}
        </div>
      </div>

      {!report ? (
        <div className="empty">
          <div>
            <strong>{isLoading ? "Review in progress" : "Ready for documents"}</strong>
            <p>
              {isLoading
                ? "The app is extracting requirements, then reviewing each draft section separately."
                : "Add a solicitation and draft proposal to generate the compliance report."}
            </p>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th>Requirement</th>
                <th>Status</th>
                <th>Evidence</th>
                <th>Human review</th>
              </tr>
            </thead>
            <tbody>
              {report.findings.map((finding, index) => (
                <tr key={`${finding.section}-${finding.requirementId}-${index}`}>
                  <td>{finding.section}</td>
                  <td>
                    <div className="requirement">{finding.requirement}</div>
                    <div className="citation">{finding.citedRequirement}</div>
                  </td>
                  <td>
                    <span className={`chip chip-${finding.status.toLowerCase().replaceAll("_", "-")}`}>
                      {statusLabels[finding.status]}
                    </span>
                  </td>
                  <td>{finding.evidence}</td>
                  <td>{finding.humanReviewNote ?? "No extra note."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
