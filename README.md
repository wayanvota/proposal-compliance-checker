# Proposal Completeness & Compliance Checker

A single-page pre-submission grant proposal checker. It compares a draft proposal against a funder solicitation, section by section, and flags missing or non-compliant items with cited solicitation requirements.

## What it does

- Extracts requirements from a solicitation.
- Reviews each proposal section in its own focused model pass.
- Reports each requirement as `PRESENT`, `MISSING`, `NON_COMPLIANT`, or `NEEDS_HUMAN_REVIEW`.
- Keeps argument strength, clarity, persuasiveness, and funding likelihood in the human-review bucket.

## What it does not do

- It does not judge proposal quality.
- It does not assess clarity or persuasiveness.
- It does not estimate likelihood of funding.
- It does not make a submission decision.

## Research caveat

Architecture and scope are grounded in a single 6-proposal preprint ([arXiv 2603.08281](https://arxiv.org/abs/2603.08281), not peer-reviewed). The tool checks completeness and compliance only.

## Render deployment

Deploy as a Render Web Service, not a Static Site.

Settings:

```text
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm run start
```

Environment variables:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
NODE_VERSION=22.16.0
```
