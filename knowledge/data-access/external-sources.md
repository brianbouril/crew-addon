# External sources

Where to read facts. This repo does not connect to SharePoint, Figma, or a DAM. Those names in `docs/grok/` are the enterprise metaphor. The stand-in for a human-edited export is `approved-exports/`. At `1b8d87a` that folder still has only `.gitkeep`. No silent-edit diff in `6ef219c..1b8d87a`.

Do not copy personal data, server allow-lists, or credentials into `knowledge/`. `CLAUDE.md` rule 11.

## In this repo (authoritative for the add-on)

| Question | Read |
| --- | --- |
| What may an agent do? | `AGENTS.md`, then `knowledge/agents/` if you are that role |
| Product rules and dated decisions | `CLAUDE.md` decision table. Specs in `specs/` when status is `ready` |
| What players can order | `crew_bp/scripts/catalog.js` `JOBS`. Settlement-wide orders are `orders.js` `SETTLEMENT_ORDERS`, not extra catalog names. |
| Settlement save data and rules | `crew_bp/scripts/settlement.js`. Spec: `specs/settlement-layer.md`. |
| What the guide says | `crew_bp/scripts/guide_pages.js` (source). `PLAYER_GUIDE.md` is generated |
| What shipped | `CHANGELOG.md`. What to retest: `docs/QA.md` |
| Visuals | `knowledge/domain/visual-identity.md`, `tools/make_textures.mjs`, `crew_rp/textures/` |
| Versions and UUIDs | The manifests and `crew_bp/scripts/util.js`. Procedure: `knowledge/skills/version-and-release.md` |
| Script API surface we mock | `tools/sim/mock/@minecraft/server/index.js`, `tools/sim/mock/@minecraft/server-ui/index.js` |
| Full design history | `docs/PLAN.md`, `docs/FACTORY_PLAN.md` |
| Which pull request the auto-merge job will merge | `.github/workflows/auto-merge-knowledge.yml`. Curator path rules are already in `AGENTS.md` section 3. |

`docs/PLAN.md` has drifted from the code in at least two places (27-slot inventory vs `inventory_size` 36; Fast pace still listed as an open setting). Prefer `catalog.js`, `worker.json`, and the `CLAUDE.md` decision table when they disagree. The drift is flagged. Do not treat every paragraph of PLAN as current.

## Minecraft documentation this repo already cites

From `docs/PLAN.md` "Sources":

- Custom commands: https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/custom-commands
- `@minecraft/server-net` (not shipped): https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server-net/minecraft-server-net
- Scripting on BDS: https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/scripting
- `@minecraft/server` on npm: https://www.npmjs.com/package/@minecraft/server

From `docs/FACTORY_PLAN.md` (GameTest is cited as something this pack does **not** ship):

- https://learn.microsoft.com/minecraft/creator/scriptapi/mojang-gametest/mojang-gametest
- https://learn.microsoft.com/en-us/minecraft/creator/documents/gametestgettingstarted
- https://wiki.bedrock.dev/meta/gametest-qna

When a page and the manifest disagree, the manifest's module versions win for what this pack may import. Official docs win over `contributor` and `player-feedback` notes. They do not win over a dated Brian decision about this add-on (he can choose a stricter subset, and he has: stable 2.2.0 / 2.0.0 only).

## Named docs that are not in git

`CLAUDE.md` "Keeping others in sync" names a Google Doc "Crew Workers Roadmap", a Google Doc "Crew Addon Status", and a Google Drive folder "Crew Addon Sync". No URLs for them are stored in the repo. Do not invent the links. Do not change game code to refresh that snapshot.

## Auto-merge job

`.github/workflows/auto-merge-knowledge.yml` (commit `19291ed`, merge `e3df8ff`) is the job. These are the facts in that file, not a new policy:

- It runs on `pull_request_target` for `opened`, `synchronize`, and `reopened`. The comment at the top says the copy on the base branch runs, the job does not check out the pull request, and a change to this file is refused because `.github/` is not an allowed path.
- Permissions on the job are `contents: write` and `pull-requests: write`.
- Changed paths come from the pull request files API, 100 per page, every page.
- A path is allowed only when it is exactly `EVALUATION-NOTES.md`, or it starts with `knowledge/skills/`, `knowledge/data-access/`, or `inbox/`. A path that starts with `/`, contains a backslash, contains a `..` segment, or is `.github` or under `.github/` is not allowed. A rename is allowed only when `filename` and `previous_filename` are both allowed. A rename with no previous name fails the job.
- If the pull request body matches `Needs Human Decision` without regard to case, the job does not approve and does not merge.
- An API error, a payload that is not a list of files, or an empty file list fails the job and does not merge.
- When every path is allowed, the job approves and runs `gh pr merge --auto --squash`.

`AGENTS.md` section 3 does not name a branch or a commit prefix for `.github/` edits. The workflow change used branch `fix/automerge-allowlist` and the subject `fix(ci): auto-merge only allow-listed knowledge paths`. That records the commit. It does not add a required prefix.

## Intake queues

| Signal | Path |
| --- | --- |
| Structured gaps | `inbox/knowledge-flags.jsonl` |
| Feedback threads | `inbox/player-feedback.md` |
| Human-edited exports | `approved-exports/` |
| Curator watermark | `inbox/.curator-state.json` |
| Friction log | `EVALUATION-NOTES.md` |

## Open questions

1. No URL is stored for the Google Docs. Whether the curator should ever fetch them is unanswered. Day 0 does not.
2. npm and Microsoft Learn can move. The versions pinned in `crew_bp/manifest.json` are the ones this pack builds against, not "whatever latest is".
