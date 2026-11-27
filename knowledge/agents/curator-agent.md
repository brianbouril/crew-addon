# Role: Curator Agent (@KnowledgeCurator)

You turn flags, diffs, feedback, and doc changes into updates of `knowledge/`. You open a pull request. You do not push to `main`, and you do not change `crew_bp/` or `crew_rp/`.

## Before any run

Read `AGENTS.md` and this file. Authority order is `art-director` > `official-docs` > `contributor` > `player-feedback`. A lower-authority note that conflicts with a higher-authority rule is named in the pull request under `Needs human decision` and left unapplied.

## Watermark

`inbox/.curator-state.json` has exactly three keys:

- `last_processed_commit_sha` — full SHA of the `main` commit already considered. The value in the repo is `8c171ddf4463dbe61c6081707197cdc6ed39541e`, the `main` HEAD before the day-0 bootstrap. No curator pull request has processed `main` since that commit. Keep it until a curator pull request that has done the pass is merged.
- `last_processed_flag_line` — non-empty flag lines already handled. `0` means the seed lines are unread.
- `last_run_timestamp` — UTC ISO-8601 of the last write of this file. The alignment write is not a finished curator pass.

Do not add keys. Do not rename these keys.

The watermark advances when a curator pull request that contains the updated file is merged. The SHA written into that pull request is `origin/main` at the start of the run (the commits you considered). A pull request cannot contain the merge commit that merges it. The dirty check below treats that already-merged curator pull request as idle.

## Dirty check (first action, every run)

Use `origin/main` after `git fetch origin main`. Do not use the SHA of a working branch.

1. Read `inbox/.curator-state.json` from `origin/main`. If it is missing or not valid JSON, stop. Do not invent keys.
2. `main_sha` = `git rev-parse origin/main`.
3. `flag_lines` = the number of non-empty lines in `inbox/knowledge-flags.jsonl` on `origin/main` (`git show origin/main:inbox/knowledge-flags.jsonl`). A missing file is 0. Ignore uncommitted local edits.
4. If `main_sha` equals `last_processed_commit_sha` and `flag_lines` equals `last_processed_flag_line`, stop. Do not edit files and do not open a pull request.
5. If the flag counts match, also stop when all of the following are true:
   - `last_processed_commit_sha` is an ancestor of `main_sha`
   - every commit reachable from `main_sha` but not from `last_processed_commit_sha` is a merge of a pull request, or a commit whose subject starts with `chore(knowledge):`, `meta(agents):`, or `docs(eval):`
   - `git diff --name-only <last_processed_commit_sha> origin/main` lists only paths under `knowledge/`, `inbox/`, `AGENTS.md`, `EVALUATION-NOTES.md`, or `docs/grok/`
   - the copy of `inbox/.curator-state.json` on `origin/main` already stores this same `last_processed_commit_sha`
   That delta is a curator or observer pull request that already merged and recorded the `main` SHA it started from. Opening another pull request would loop.
6. Otherwise there is work. If you already have an open curator pull request whose branch contains the current `main_sha`, push new commits to that branch instead of opening a second pull request.

`approved-exports/` and `inbox/player-feedback.md` are intake. A commit that changes them on `main` moves `main_sha`, so step 4 sees it. You do not keep a second watermark for those paths.

## Intake, when the dirty check says to work

1. Branch from `origin/main`. Knowledge updates use `chore/knowledge-<topic>`.
2. Read flags from line `last_processed_flag_line + 1` through `flag_lines` on the `main` you branched from. The file is append-only. Do not renumber or rewrite old lines.
3. Read `git diff <last_processed_commit_sha> <main_sha>` and `git log <last_processed_commit_sha>..<main_sha>`.
4. Read new material in `inbox/player-feedback.md` and new files in `approved-exports/` that are on `main`.
5. Official documentation moves are in `knowledge/data-access/external-sources.md`. Fetch one of those URLs only when a flag or a diff says the pinned Script API behavior is in doubt. Do not browse for new standards.
6. **Silent edits.** If `approved-exports/` contains a file that corresponds to a texture or string under `crew_rp/`, describe the difference in a `knowledge/` note. Do not overwrite the pack.
7. **Authority.** Apply the higher-authority source. When `player-feedback` or `contributor` conflicts with `knowledge/domain/` or with the packs, do not change the rule to match them. Name the conflict in the pull request under `Needs human decision`.
8. **Do not invent.** If the packs and the docs do not support a sentence, leave an open question in the knowledge file.
9. **Packs stay put.** Do not edit `crew_bp/`, `crew_rp/`, `README.md`, `docs/PLAN.md`, or the manifests from a curator run. Record new drift as a flag with the seven keys in `AGENTS.md`. A pack edit is the worker's `feat(pack):` or `fix(pack):` pull request on `feat/<name>` or `fix/<name>`.

## Pull request

- Knowledge and watermark updates: branch `chore/knowledge-<topic>`, commits and title `chore(knowledge):`.
- In that branch set `last_processed_commit_sha` to the `main_sha` from step 2 of the dirty check, `last_processed_flag_line` to the non-empty line count you have now handled, and `last_run_timestamp` to the run time in UTC ISO-8601. Those three keys only.
- If the only action is to record that a non-curator range taught you nothing, the pull request still updates the watermark the same way, with subject `chore(knowledge): advance curator watermark`.
- Edits to `knowledge/agents/*.md` are a **separate** pull request on `meta/agents-<topic>` with `meta(agents):` commits. Do not put them in the knowledge pull request. Do not open that pull request from a routine flag pass unless this run was asked to tune a miss.
- Do not merge your own pull request.

## What you may edit

On the knowledge branch: `knowledge/**` except `knowledge/agents/`, `AGENTS.md` when the shared rules themselves change, `inbox/.curator-state.json`, and new lines in `inbox/knowledge-flags.jsonl`. `docs/grok/` only when the task is to correct those briefs.

On the self-tuning branch: `knowledge/agents/*.md` only.

You may not edit `crew_bp/`, `crew_rp/`, `CHANGELOG.md`, `PLAYER_GUIDE.md`, `tools/`, or `EVALUATION-NOTES.md`.
