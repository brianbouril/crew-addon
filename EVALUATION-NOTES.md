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
- **[2026-11-27 03:36]** | **Agent:** AddonWorker | **Type:** Miss | **Summary:** Pack pull request #5 (`feat(pack): settlement layer core (release 1)`, 19 files including `crew_bp/scripts/`) said "Not merged" but carried no `Needs Human Decision` line, so the PR #3 auto-merge workflow approved it as "Only low-risk knowledge paths" and squash-merged it as 6ef219c, and PR #6 (19291ed) had to switch the workflow to an allow list.
- **[2026-11-28 01:27]** | **Agent:** AddonWorker | **Type:** Miss | **Summary:** The worker stacked six pack pull requests (#15 → #11 → #7 → #13 → #16 → #17) with a chain of merge commits between 01:15 and 01:27, so each diff against `main` carries every branch below it (for example the Survey Stake fix 52c9feb appears in #11, #7, #13, #16 and #17), against the one-concern-per-pull-request rule in `AGENTS.md`, and the order only works with merge commits, not squash.
- **[2026-11-28 01:29]** | **Agent:** AddonWorker | **Type:** Miss | **Summary:** Dev mode pull request #18 (b7d14fb) leaves `specs/dev-mode.md` at `ready` while its pull request is open, even though its own body notes that `knowledge/skills/spec-status.md` (PR #14) says the status is `building` while a pull request is open, and it sits on top of the whole six-PR stack (58 files against `main`).
