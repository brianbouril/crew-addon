# Evaluation notes

The Friction Observer (`knowledge/agents/friction-observer.md`) appends entries here and opens a pull request from `docs/eval-<topic>` with `docs(eval):`. It does not push to `main`.

The observer does not edit pack code, `knowledge/`, or the inbox watermark. This file is the scorecard source named in `docs/grok/POC-KNOWLEDGE-FACTORY-v5.md` section 7.

## Template

Copy this shape. Times are UTC.

`- **[YYYY-MM-DD HH:MM]** | **Agent:** [Name] | **Type:** [Stall / Override / Hallucination / Token-Burn / PR-Rejection / Revert / Miss] | **Summary:** [1 sentence root cause]`

Types from the charter: Stall, Override, Hallucination, Token-Burn, PR-Rejection. Day 0 also allows Revert and Miss.

## Entries

- **[2026-11-27 02:05]** | **Agent:** KnowledgeCurator | **Type:** Override | **Summary:** The day 0 bootstrap (1e348157) committed directly to `main` as the bootstrap prompt asked, even though `docs/grok/POC-KNOWLEDGE-FACTORY-v5.md` said never to bypass pull requests, so Brian reversed the whole workflow to branches and pull requests in PR #1 (09d3dac4) about 40 minutes later.
- **[2026-11-27 02:05]** | **Agent:** KnowledgeCurator | **Type:** Override | **Summary:** The bootstrap's flag schema merged two field sets into eleven keys (`ts`, `path`, `gap`, `severity` plus the seven charter keys) instead of choosing one, and PR #1 (204da42c) had to cut it back to the seven-key schema by hand.
- **[2026-11-27 02:05]** | **Agent:** KnowledgeCurator | **Type:** Miss | **Summary:** PR #1 bundled a `chore(knowledge):` commit (204da42c) and a `meta(agents):` commit (87cee5c3) in one pull request, against the rule it introduced that agent-instruction edits go in their own pull request.
