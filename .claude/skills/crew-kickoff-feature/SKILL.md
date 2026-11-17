---
name: "crew-kickoff-feature"
description: "Kick off the next Crew add-on feature: show what's in progress and next, settle the spec's open questions with Brian, then build it on its own branch."
---

# Kick off a Crew feature

Use in the Crew add-on repo when Brian says to start, kick off or pick up a feature. Works locally or in a Claude Code on the web session. Follow CLAUDE.md and docs/FACTORY_PLAN.md throughout; if either is missing, say so and stop.

## 1. Status first (read only)

- Fetch the remote. List every `feat/*` branch (local and remote) with its last commit date and whether it has an open PR.
- Read every file in `specs/` (skip `_TEMPLATE.md`) and note its Status line.
- Read the V1 schedule in docs/FACTORY_PLAN.md for the planned order.
- Show Brian a short status, nothing else yet:
  - **In progress:** specs with status building or in review, with their branch and last activity.
  - **Ready:** specs with status ready and no branch yet.
  - **Next up:** the earliest feature in the FACTORY_PLAN.md order that isn't shipped or in progress, and why it's next.
  - **Missing specs:** V1 features in FACTORY_PLAN.md with no spec file.
- Ask which feature to start, recommending the next-up one.

## 2. Guardrails before starting

- If two features are already building, say so and recommend waiting: the plan caps it at two builders.
- Compare the chosen spec's Touches list with every in-progress spec. If both touch the same file (especially `runner.js`), name the overlap and ask before going on.
- If the chosen feature has no spec, draft one from `specs/_TEMPLATE.md` using FACTORY_PLAN.md and the decisions already in CLAUDE.md, list every guess as an open question, and continue to step 3.

## 3. Open questions

- Ask Brian each open question one at a time, with your recommended answer and a one-line reason. Accept short answers.
- Never answer a question for him. If he skips one, leave it open and say the build will stop there.
- Write each answer into the Decisions section, dated, and remove it from Open questions.
- When none are left, set Status to building, commit the spec to main with message `spec: <feature> ready`, and push.

## 4. Build

- Create branch `feat/<feature>` from up-to-date main.
- Write mock tests from the done criteria first (see tools/sim), then the code. Keep `node tools/sim/run.mjs` passing.
- Touch only files in the spec's Touches list; if you need another, stop and ask.
- Never change pack UUIDs or `crew:` IDs. Every new Script API call gets a mock in `tools/sim/mock`. Add a CHANGELOG entry and any QA steps to QA.md on the branch.
- When done, run the reviewer subagent against the spec, fix what it finds, push the branch and open a PR. Do not merge to main.
- Set the spec's status to in review on the branch.

## 5. Report

End with: what was built, which done criteria pass in the mock sim, which still need the staging scenario test or Brian's playtest, anything left open, and the PR link.