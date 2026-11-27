# Repository agent instructions

Shared entry point for every assistant that works in this repo (Claude, Grok, Cursor, or anything else). Read this file before changing code, copy, textures, or knowledge.

The Minecraft add-on is the sandbox. `crew_bp/` is the behavior pack and `crew_rp/` is the resource pack. The Knowledge Factory docs under `docs/grok/` call those folders `behavior_packs/` and `resource_packs/`. Use the names that exist here.

## 1. Consult the shared knowledge first

Before generating code, configuration, copy, or visual assets, read the relevant files in:

- `knowledge/skills/` — how to change the packs, scripts, and release
- `knowledge/domain/` — product rules and visual identity, including `knowledge/domain/visual-identity.md`
- `knowledge/data-access/` — where the live facts actually sit
- `knowledge/assets/examples/` — annotated Do/Don't images, when any exist

Compare any visual work to `knowledge/domain/visual-identity.md` and to the textures already in `crew_rp/textures/`.

`CLAUDE.md` is the Crew software-factory rulebook (specs, mock tests, pack UUIDs, the `crew:` namespace). Follow it for those rules. Where it disagrees with this file, see "Conflicts" below and do not guess.

## 2. Authority hierarchy

When two inputs disagree, higher authority wins. Log the loser. Do not apply it.

`art-director` > `official-docs` > `contributor` > `player-feedback`

| Rank | Who it is in this repo |
| --- | --- |
| `art-director` | Brian, the product owner. A dated decision in `CLAUDE.md` or a spec marked `ready` is his call. |
| `official-docs` | Shipped files (`crew_bp/`, `crew_rp/`, `tools/make_textures.mjs`) and the docs they are generated from (`guide_pages.js`). Official Minecraft documentation linked from `knowledge/data-access/`. |
| `contributor` | A builder, lead session, or other teammate writing a suggestion that Brian has not accepted. |
| `player-feedback` | Notes in `inbox/player-feedback.md`, including the day-0 samples. |

Lower-authority input that conflicts with a higher-authority rule is recorded (in the curator commit message, or as a line in `inbox/knowledge-flags.jsonl`). It does not edit `knowledge/domain/` or the packs.

## 3. Direct-to-main commit prefixes

This Knowledge Factory POC commits on `main`. Use these prefixes:

| Change | Prefix |
| --- | --- |
| Worker code or asset changes (`crew_bp/`, `crew_rp/`, player-facing guide) | `feat(pack):` or `fix(pack):` |
| Curator updates to `knowledge/`, `AGENTS.md`, or `inbox/` state | `chore(knowledge):` |
| Curator edits to `knowledge/agents/*.md` (self-tuning) | `meta(agents):` |
| Friction Observer entries in `EVALUATION-NOTES.md` | `docs(eval):` |

One concern per commit. Do not mix a pack change and a knowledge change in the same commit.

Pack commits still obey `CLAUDE.md` rules 4, 5, 6, 7, and 11: never change pack UUIDs or the `crew:` namespace, add a mock for every new Script API call, update `CHANGELOG.md` and `docs/QA.md` (and `guide_pages.js` plus `node tools/make_guide.mjs` when players will see it), stay on `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0, and commit no personal information.

## 4. Roles

If you are running as a pipeline agent, load your file and follow it:

| Role | File |
| --- | --- |
| Worker (`@AddonWorker`) | `knowledge/agents/worker-agent.md` |
| Curator (`@KnowledgeCurator`) | `knowledge/agents/curator-agent.md` |
| Friction Observer (`@FrictionObserver`) | `knowledge/agents/friction-observer.md` |

The worker does not edit `knowledge/`. The observer does not edit packs or `knowledge/`. The curator does not edit pack code.

## 5. Flag a gap instead of inventing a rule

Append one JSON object per line to `inbox/knowledge-flags.jsonl` when a rule is missing, stale, or contradicted. Do not invent a standard to fill the hole.

Day 0 writes both field sets because the charter and the bootstrap brief name different keys. Keep both until Brian picks one:

- Brief: `ts`, `source`, `path`, `gap`, `severity` (`low`, `medium`, `high`)
- Charter (`docs/grok/POC-KNOWLEDGE-FACTORY-v5.md`): `timestamp`, `category` (`skills`, `domain`, or `data-access`), `authority`, `source`, `issue_summary`, `evidence`, `suggested_fix`

`ts` and `timestamp` are the same UTC time. `gap` and `issue_summary` describe the same hole. `path` and `evidence` point at the file.

## 6. Conflicts (do not silently pick a side)

1. **Pull requests vs direct-to-main.** `docs/grok/POC-KNOWLEDGE-FACTORY-v5.md`, `PROJECT-BRIEF-KNOWLEDGE-FACTORY-v5.md`, and `TEAM-INTAKE-BRIEF-KNOWLEDGE-FACTORY-v2.md` say knowledge updates go through a pull request and that agents must not push to `main`. `docs/grok/DAY1-SETUP-GUIDE-v3.md` and Brian's day-0 bootstrap say the opposite: commit on `main` with the prefixes in section 3. This POC follows direct-to-main. The PR workflow is not deleted from those docs; it is not the rule for this sandbox until Brian says so.
2. **Feature branches vs `feat(pack):` on main.** `CLAUDE.md` rules 2 and 3 say game features land on `feat/<name>` or `fix/<name>`, with a reviewer sign-off, and never go straight onto `main`. Section 3 tells the worker to commit pack changes on `main`. Both stand. A worker does not ignore the test, changelog, UUID, or API rules while this is open. See the open question in `knowledge/agents/worker-agent.md`.
3. **Folder names.** Factory docs say `behavior_packs/` and `resource_packs/`. This repo's source trees are `crew_bp/` and `crew_rp/`. README installs them by copying those folders into a server's `behavior_packs/` and `resource_packs/` directories. Do not rename the source trees.
4. **Curator watermark field names.** The charter's sample state uses `last_processed_commit_sha` and `last_run_timestamp`. The day-0 file `inbox/.curator-state.json` uses `last_processed_sha` and `last_processed_flag_line` only. Use the file that is in the repo.
