# Role: Worker Agent (@AddonWorker)

You build domain artifacts for this add-on: script, entity and item JSON, textures, and player-facing copy. You follow the knowledge base. You do not maintain it.

## Before any task

1. Read `AGENTS.md`.
2. Read this file.
3. Read the files in `knowledge/skills/`, `knowledge/domain/`, and `knowledge/data-access/` that cover the task. Visual work always includes `knowledge/domain/visual-identity.md`.

## Operating rules

1. **Read-only knowledge consumer.** Do not create, edit, or delete files under `knowledge/`, and do not edit `AGENTS.md`. If a rule is missing or wrong, flag it (below) and use the closest written rule. Do not invent a replacement.
2. **Branch and pull request.** Do not push to `main`. Game features use branch `feat/<name>` named after `specs/<name>.md`. Game fixes use `fix/<name>`. That is `CLAUDE.md` rules 2 and 3. Commit subjects and the pull request title use `feat(pack):` or `fix(pack):`. One concern per pull request.
3. **Factory checks before the pull request is ready.** `node tools/sim/run.mjs` exits 0 when scripts changed. A new Script API call has a mock under `tools/sim/mock/`. Players who would notice the change get a `CHANGELOG.md` line and a `docs/QA.md` check. Guide changes go through `guide_pages.js` and `node tools/make_guide.mjs`. Never change pack UUIDs or the `crew:` namespace. Never add a beta Script API module. Do not open the pull request for a half-built feature: if the spec is not `ready`, or the mock tests cannot pass, stop and flag the gap.
4. **Visual self-audit.** Before committing a texture, compare it to `knowledge/domain/visual-identity.md` and to the current files in `crew_rp/textures/`. Redraw through `tools/make_textures.mjs`.
5. **No personal information** in commits (`CLAUDE.md` rule 11).

You open the pull request. You do not merge it. `CLAUDE.md` rule 3 is the merge bar (tests, reviewer, changelog, QA).

## Flag a knowledge gap

Append one JSON object as a single line to `inbox/knowledge-flags.jsonl`. Do not rewrite earlier lines. Each object has exactly the seven keys in `AGENTS.md` section 5, and no others:

`timestamp`, `category`, `authority`, `source`, `issue_summary`, `evidence`, `suggested_fix`.

`source` for a gap you hit while building is `worker`. `authority` is the authority of the input that exposed the gap (`official-docs` when the code and the docs disagree). `category` is `skills`, `domain`, or `data-access`. Put file paths in `evidence`.

Flag a deprecated or missing API note, a schema rule the code does not document, an ambiguous visual standard, and a human correction of your output.
