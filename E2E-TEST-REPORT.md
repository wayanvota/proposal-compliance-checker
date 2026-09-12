# Proposal Compliance Checker end-to-end test report

## Scope

The Playwright harness runs the production Next.js application against the real
multipart review route. A local HTTP fixture replaces only the OpenAI service.
Requirement extraction, section splitting, Zod validation, reporting, upload
validation, request limits, error handling, and React rendering remain active.
No credential or public service is required in CI.

## Required categories

| ID | Category | Expected behavior |
| --- | --- | --- |
| U01 | Public boundary | Human authority and exclusions render |
| U02 | Input readiness | Review waits for both documents |
| U03 | Pasted review | Browser-to-route flow produces findings |
| U04 | Missing item | Missing narrative requirement is explicit |
| U05 | Budget limit | Over-limit budget is non-compliant |
| U06 | Section coverage | Reviewed sections remain visible |
| U07 | Requirement citation | Every finding keeps solicitation support |
| U08 | Attachment uncertainty | Upload-package check routes to a human |
| U09 | Revision | Corrected draft replaces the earlier report |
| U10 | Research caveat | Preprint limit and source stay visible |
| A01 | Empty request | API rejects missing documents |
| A02 | Partial request | One document cannot start review |
| A03 | File type | Non-PDF upload receives a bounded 400 |
| A04 | Request size | Oversized input is rejected before model work |
| A05 | Malformed model JSON | UI shows a bounded recovery message |
| A06 | Invalid model category | Schema prevents invalid status rendering |
| A07 | Provider failure | Manual-review route remains usable |
| A08 | Active HTML | Model evidence renders as inert text |
| A09 | Route abuse | Unknown route and method fail closed |
| A10 | Error disclosure | Failure omits secrets/stacks and sets headers |

## Verification record

Status: local gate and GitHub Actions run 34664728549 passed on 2026-09-11.

- Existing tests: 6 passed, including a new regression case for unmatched
  requirements in sectioned drafts.
- TypeScript and the Next.js 16.3.3 production build: passed on Node 22.16.0.
- End-to-end suite: 20 of 20 passed, covering U01-U10 and A01-A10.
- Dependency audit: 0 vulnerabilities.
- Authorized live-provider smoke: the production route returned HTTP 200 with
  two schema-valid findings and a solicitation citation for each finding.

The first browser run found unstable form-label selectors. After those were
corrected, the suite exposed a production coverage defect: attachment and other
requirements without a matching proposal heading were never reviewed. The
review loop now sends every unmatched requirement through one full-draft pass.
The complete combined gate then passed.

```bash
npm ci
npx playwright install chromium
npm run test:ci
npm audit --audit-level=high
```

The deterministic fixture uses a fake local API key. An authorized live OpenAI
smoke remains separate from the required CI gate, and no real key is persisted.
