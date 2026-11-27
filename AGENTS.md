# Repository agent instructions

Shared entry point for every assistant that works in this repo (Claude, Grok, Cursor, or anything else). Read this file before changing code, copy, textures, or knowledge.

The Minecraft add-on is the sandbox. `crew_bp/` is the behavior pack and `crew_rp/` is the resource pack. The Knowledge Factory docs under `docs/grok/` also say `behavior_packs/` and `resource_packs/`. In this repository those names are `crew_bp/` and `crew_rp/`. README copies those folders into a server's `behavior_packs/` and `resource_packs/` directories. Do not rename the source trees.

## 1. Consult the shared knowledge first

Before generating code, configuration, copy, or visual assets, read the relevant files in:

- `knowledge/skills/` — how to change the packs, scripts, and release
- `knowledge/domain/` — product rules and visual identity, including `knowledge/domain/visual-identity.md`
- `knowledge/data-access/` — where the live facts actually sit
- `knowledge/assets/examples/` — annotated Do/Don't images, when any exist

Compare any visual work to `knowledge/domain/visual-identity.md` and to the textures already in `crew_rp/textures/`.

`CLAUDE.md` is the Crew software-factory rulebook (specs, mock tests, pack UUIDs, the `crew:` namespace, and how game work reaches `main`). Follow it. Game branches are `feat/<name>` and `fix/<name>` (`CLAUDE.md` rules 2 and 3).

## 2. Authority hierarchy

When two inputs disagree, higher authority wins. Log the loser. Do not apply it.

`art-director` > `official-docs` > `contributor` > `player-feedback`

| Rank | Who it is in this repo |
| --- | --- |
| `art-director` | Brian, the product owner. A dated decision in `CLAUDE.md` or a spec marked `ready` is his call. |
| `official-docs` | Shipped files (`crew_bp/`, `crew_rp/`, `tools/make_textures.mjs`) and the docs they are generated from (`guide_pages.js`). Official Minecraft documentation linked from `knowledge/data-access/`. |
| `contributor` | A builder, lead session, or other teammate writing a suggestion that Brian has not accepted. |
| `player-feedback` | Notes in `inbox/player-feedback.md`, including the day-0 samples. |

Lower-authority input that conflicts with a higher-authority rule is recorded in the pull request description, or as a line in `inbox/knowledge-flags.jsonl`. It does not edit `knowledge/domain/` or the packs.

## 3. Pull requests

Every change reaches `main` through a branch and a pull request. That includes the worker, the curator, and the friction observer. Do not push to `main`.

The prefix is the commit subject and the pull request title. One concern per pull request. Do not mix a pack change and a knowledge change in the same pull request. Agent-instruction edits (`knowledge/agents/`) are their own pull request, separate from other knowledge updates.

| Change | Branch | Commit subject and PR title |
| --- | --- | --- |
| Game feature (`crew_bp/`, `crew_rp/`, player-facing guide) | `feat/<name>` after `specs/<name>.md` | `feat(pack):` |
| Game fix | `fix/<name>` | `fix(pack):` |
| Curator updates to `knowledge/`, `AGENTS.md`, `inbox/` state, or `docs/grok/` | `chore/knowledge-<topic>` | `chore(knowledge):` |
| Curator edits to `knowledge/agents/*.md` | `meta/agents-<topic>` | `meta(agents):` |
| Friction Observer entries in `EVALUATION-NOTES.md` | `docs/eval-<topic>` | `docs(eval):` |

Game work still follows `CLAUDE.md` rules 2 and 3 before merge: mock tests pass (`node tools/sim/run.mjs`), the reviewer has checked the spec, `CHANGELOG.md` and `docs/QA.md` are updated, and an unfinished feature does not land on `main`. Rules 4, 5, 6, 7, and 11 still apply on the branch: never change pack UUIDs or the `crew:` namespace, add a mock for every new Script API call, update the guide when players will see the change (`guide_pages.js`, then `node tools/make_guide.mjs`), stay on `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0, and commit no personal information.

## 4. Roles

If you are running as a pipeline agent, load your file and follow it:

| Role | File |
| --- | --- |
| Worker (`@AddonWorker`) | `knowledge/agents/worker-agent.md` |
| Curator (`@KnowledgeCurator`) | `knowledge/agents/curator-agent.md` |
| Friction Observer (`@FrictionObserver`) | `knowledge/agents/friction-observer.md` |

The worker does not edit `knowledge/`. The observer does not edit packs or `knowledge/`. The curator does not edit pack code.

## 5. Flag schema

Append one JSON object per line to `inbox/knowledge-flags.jsonl` when a rule is missing, stale, or contradicted. Do not invent a standard to fill the hole. Do not rewrite earlier lines.

Each line has exactly these seven keys and no others:

| Key | Value |
| --- | --- |
| `timestamp` | UTC ISO-8601 |
| `category` | `skills`, `domain`, or `data-access` |
| `authority` | `art-director`, `official-docs`, `contributor`, or `player-feedback` |
| `source` | Where the gap was noticed (`worker`, `day0-bootstrap`, `git-diff`, …) |
| `issue_summary` | One sentence |
| `evidence` | File paths and the fact that shows the gap. Put the path here. |
| `suggested_fix` | What a later change could do. Not permission to do it from a lower authority. |

There is no `ts`, `path`, `gap`, or `severity` key.

## 6. Curator watermark

`inbox/.curator-state.json` has exactly these three keys and no others:

| Key | Value |
| --- | --- |
| `last_processed_commit_sha` | Full git SHA of the `main` commit the curator has finished considering |
| `last_processed_flag_line` | How many non-empty flag lines are already handled |
| `last_run_timestamp` | UTC ISO-8601 of the last write of this file |

The day-0 value of `last_processed_commit_sha` stays `8c171ddf4463dbe61c6081707197cdc6ed39541e`, the `main` commit before the bootstrap. No curator pull request has processed `main` since then, and `last_processed_flag_line` stays `0`, so the seed flags are still unread. `last_run_timestamp` is when this schema was written, not a claim that a curator pass finished.

The watermark moves only when a curator pull request that updates this file is merged. The SHA stored in that pull request is the `origin/main` SHA the run started from. See `knowledge/agents/curator-agent.md`.
