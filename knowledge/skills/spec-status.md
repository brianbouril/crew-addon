# Spec status words

What the repo already writes down about `draft`, `ready`, `building`, `in review`, and `shipped`. Sources, read at `6ef219c`: `specs/_TEMPLATE.md`, `CLAUDE.md` rule 8 and "Branch flow, step by step", the spec template in `docs/FACTORY_PLAN.md`, and `.claude/skills/crew-kickoff-feature/SKILL.md`. Both real specs on `main` (`specs/settlement-layer.md`, `specs/hauler.md`) say status **ready**.

## draft

`CLAUDE.md` step 1: the lead writes `specs/<name>.md` from `specs/_TEMPLATE.md` at status `draft`.

The template says a builder stops on any part that depends on an unanswered open question. Rule 8 says a builder does not start until the status is `ready`.

## ready

The template comment: status goes to `ready` only when Brian has answered every open question.

`CLAUDE.md` step 1: after those answers, the status becomes `ready`. Rule 8: that is when a builder may start. A builder does not guess an open question.

Brian, 2026-11-27 (art-director): `ready` means the open questions are answered. `CLAUDE.md` wins over the kickoff skill where they disagree.

The kickoff skill, section 1, uses "Ready" for a spec whose status is `ready` and which has no branch yet.

## building

`CLAUDE.md` step 2: the builder works on `feat/<name>`. The test-writer writes failing mock tests, then the code. The status is `building`.

Brian, 2026-11-27 (art-director): `building` means the builder starts. Do not follow kickoff skill step 3 when it sets the status to `building` at the moment the open questions are answered. That moment is `ready`.

The kickoff skill, section 1, counts `building` or `in review` as in progress. The plan caps builders at two (`CLAUDE.md` rule 9, and the kickoff guardrail).

The kickoff skill, step 3, still says: when no open questions are left, set the status to `building` and commit the spec to `main` with the message `spec: <feature> ready`. Brian's decision above is the one to follow.

## in review

`CLAUDE.md` step 3: the mock tests stay green, new Script API calls have mocks, and `CHANGELOG.md`, `docs/QA.md`, and the guide are updated. The status becomes `in review`.

`CLAUDE.md` step 4: the reviewer checks the diff against the spec's done criteria. Gaps are fixed, then reviewed again. The template says every done criterion must pass before the branch merges.

The kickoff skill, step 4: when the build is done, push `feat/<feature>`, open a pull request, do not merge, and set the spec's status to `in review` on that branch.

## shipped

`CLAUDE.md` step 5: the lead rebases on `main`, runs the tests, merges, and deletes the worktree. The status is `shipped` once released.

Brian, 2026-11-27 (art-director): `shipped` means the pull request is merged and then tagged. `specs/settlement-layer.md` on `main` at `6ef219c` still says **ready**. This file does not edit that spec.

## What is written about a pull request

- The kickoff skill, step 4, opens a pull request when the build on `feat/<feature>` is done, and sets the status to `in review` on the branch in that same step. It says not to merge.
- `AGENTS.md` says a game feature uses branch `feat/<name>` and a pull request title `feat(pack):`. A fix uses `fix/<name>` and `fix(pack):`.
- `CLAUDE.md` branch flow does not use the words "pull request". It says the lead merges after the reviewer, the mock tests, the changelog, and `docs/QA.md`.
