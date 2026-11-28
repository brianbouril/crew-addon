# Server and product rules

Stable rules an agent can break by accident. The dated source is the decision table in `CLAUDE.md`. This file does not replace a spec. Specs live in `specs/` and a builder does not start one until its status is `ready`.

## Platform

- Shipped packs use stable Script API only: `@minecraft/server` 2.2.0 and `@minecraft/server-ui` 2.0.0. No beta modules, no experiment toggles (`CLAUDE.md` rule 7).
- `@minecraft/server-net` is discussed in `docs/PLAN.md` as a later option. It is not in `crew_bp/manifest.json`. Do not add it to the shipped pack.
- GameTest and any test pack stay out of `crew_bp/` and `crew_rp/` and off the live server.
- `min_engine_version` is `[1, 21, 110]` in both manifests.
- Mock tests: `node tools/sim/run.mjs`. A new `@minecraft/server` or `@minecraft/server-ui` call needs a mock under `tools/sim/mock/` in the same change (`CLAUDE.md` rule 5).

## Product rules already in the code

- A worker is built from a barrel with 1–5 tools and a carved pumpkin on top. No iron block (decision 2). Spawn path: `spawnWorker` in `workers.js`.
- The first tool in the barrel sets the role: pickaxe Miner, shovel Digger, axe Woodcutter, hoe Farmer (`ROLES` in `tools.js`, decision 32).
- Hard split: `quarry` is Digger-only. `branch_mine` is Miner-only and `hidden: true` (not offered in the menu, stake, or commands). `come`, `stop`, `resume`, `status`, `drop_off`, `set_home`, and `clear_home` have no `roles` list, so every role can take them (`catalog.js`).
- There is no Fast pace order. `CLAUDE.md` decision 30 removed it. The mock harness can still set `globalThis.crewTestFast`. Do not add a player-facing fast pace back.
- Pack version changes go through `python tools/bump_version.py`. Never hand-edit the triplet. See `knowledge/skills/version-and-release.md`.
- Personal information stays out of the repo (`CLAUDE.md` rule 11): no IP addresses other than `127.0.0.1`, no email, phone, Xbox id, gamertag, or real name other than "Brian". Write "Brian", "a friend", "the live server".

## Servers

The live server is Brian's. Do not copy packs to it or reload it without his OK for that update. Staging is the place new builds can be installed. Machine paths and the restart commands are in `CLAUDE.md` under "Servers"; they are not copied here.

README's dedicated-server steps are the player-facing install: stop, back up, replace `crew_bp` and `crew_rp`, append the pack UUIDs to the world's pack lists, set `texturepack-required=true`, start, and look for `[Crew] v<version> loaded`.

## What `main` means for the game

`CLAUDE.md` rule 1: `main` stays playable. Mock tests pass. Unfinished features stay off `main`.

`CLAUDE.md` rules 2 and 3: a game feature is built on `feat/<name>` (the spec name) and a fix on `fix/<name>`, then opened as a pull request. It merges only when the mock tests, the reviewer, the changelog, and `docs/QA.md` are done. The pull request title uses `feat(pack):` or `fix(pack):` (`AGENTS.md`). Knowledge, agent-instruction, and evaluation changes use their own branches and pull requests. None of them are pushed straight to `main`. Those branches do not waive the UUID, mock, changelog, or stable-API rules.

## Player-visible changes

`CLAUDE.md` rule 6: the same change updates `CHANGELOG.md` under "Unreleased" and `docs/QA.md` under "Next release". If players see it, edit `crew_bp/scripts/guide_pages.js` and run `node tools/make_guide.mjs`.

`README.md` is behind that standard. It still says the shovel, axe, and hoe roles have no jobs, and its known-limits list says Digger has no jobs. `PLAYER_GUIDE.md` and `catalog.js` do not. It also has no settlement or bell text, while `CHANGELOG.md` and `guide_pages.js` ("Your settlement") do, after commit `6ef219c`. Both are flagged. Do not "fix" the README from a curator run, and do not revert the Digger split.

Settlement facts taken from `settlement.js` and `specs/settlement-layer.md` (Brian, 2026-11-16 and 2026-11-17). The spec is the decision list. This is only what those files already say:

- A settlement is founded at a vanilla bell the player placed (`minecraft:bell`). There is no new bell item.
- The player-facing group name is "settlement". The `crew:` prefix and `/crew:` commands stay.
- `crew:cap` defaults to 6. An operator changes it in the settlement menu or with `/crew:cap`. The command is registered in `commands.js`.

## Open questions

1. `docs/PLAN.md` "Open settings" still says Fast pace is available to everyone. Decision 30 and the code say it was removed. Which paragraph should the curator treat as current is obvious (the decision and the code). Whether PLAN's roadmap sections get a knowledge-only correction, or wait for a docs pass Brian asked for, is open. Day 0 did not edit `docs/PLAN.md`.
2. `docs/PLAN.md` still describes a 27-slot inventory. `worker.json` sets `inventory_size` to 36, and the guide says 36 slots. Same open question: do not change PLAN.md inside a knowledge bootstrap unless the curator is explicitly sent to do that doc pass.
