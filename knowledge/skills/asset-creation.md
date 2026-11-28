# Skill: asset creation

How to add or change an entity, item, texture, or string. Visual rules: `knowledge/domain/visual-identity.md`. Ids and `format_version`: `knowledge/domain/pack-conventions.md`.

## Textures

1. Edit `tools/make_textures.mjs`. Do not treat a one-off PNG edit as the source of truth.
2. Run `node tools/make_textures.mjs` from the repo root. It rewrites:
   - `crew_rp/textures/entity/worker_miner.png`
   - `crew_rp/textures/entity/worker_digger.png`
   - `crew_rp/textures/entity/worker_woodcutter.png`
   - `crew_rp/textures/entity/worker_farmer.png`
   - `crew_rp/textures/entity/worker_hauler.png`
   - `crew_rp/textures/entity/worker_sifter.png`
   - `crew_rp/textures/items/crew_survey_stake.png`
   - `crew_rp/textures/items/crew_sieve.png` and `crew_rp/textures/blocks/crew_sieve.png`
   - `crew_rp/pack_icon.png`
3. The same `icon()` call writes both `crew_rp/pack_icon.png` and `crew_bp/pack_icon.png`. On day 0 those two files are byte-identical. Keep it that way: do not paint one icon by hand.
4. An optional argument is a preview directory of 8× enlarged PNGs. Those previews are not part of the packs. Do not commit a preview folder unless Brian asks.
5. Check the result against `knowledge/domain/visual-identity.md` before committing. Hat colors stay per role. Entity skins stay 64×64 on the existing UV layout. The Survey Stake item icon and the sieve item and block icons are 32×32 with a `#000000` outline (`stake()` and `sieveIcon()`). Do not paint that outline onto the role skins.

`knowledge/assets/examples/` is empty on purpose (`.gitkeep` only). There is no approved/rejected PNG pair yet. `approved-exports/` is the place for a human-edited v2 image the curator may diff later. It is also empty.

## New item (the Survey Stake is the only example)

Follow `crew_bp/items/survey_stake.json` and `crew_bp/recipes/survey_stake.json`:

- Identifier `crew:<snake_case>`.
- Item `format_version` string `"1.21.0"` unless you are copying a newer file that landed later.
- Shaped recipe `format_version` `"1.20.10"`, `tags: ["crafting_table"]`, result item `crew:<id>`.
- 16×16 texture at `crew_rp/textures/items/crew_<name>.png`, drawn by the generator.
- Add a key to `crew_rp/textures/item_texture.json` `texture_data`. The item's `minecraft:icon` value is that key, not a file path. `resource_pack_name` is `"crew"` and `texture_name` is `"atlas.items"`.
- Lang line `item.crew:<id>.name=` in both `crew_bp/texts/en_US.lang` and `crew_rp/texts/en_US.lang`.

## New or changed entity visuals

- Behavior: `crew_bp/entities/worker.json` (`format_version` `"1.20.80"`). Identifier, properties, and component groups stay on `crew:`.
- Client: `crew_rp/entity/worker.entity.json` (`format_version` `"1.10.0"`). Texture keys, geometry `geometry.crew_worker`, animations `animation.crew_worker.*`, render controller `controller.render.crew_worker`.
- A new role skin has to be added in three places that already agree: `ROLE_LIST` in `tools.js`, the `crew:role` int range (today 0–3), the client `textures` map, and `Array.skins` in the render controller. Same order in all of them.
- Geometry edits stay in `crew_rp/models/entity/worker.geo.json` (`format_version` `"1.12.0"`, texture 64×64). If UVs move, update the comment and the `box()` calls in `make_textures.mjs` in the same change.
- Animations stay in `crew_rp/animations/worker.animation.json` (`format_version` `"1.8.0"`). The client entity already maps property `crew:anim` value 2 to mine, 3 to sleep, and 4 to eat.

## Strings

- Player guide: edit `crew_bp/scripts/guide_pages.js`, then `node tools/make_guide.mjs`. Do not hand-edit `PLAYER_GUIDE.md`.
- Keep sentences in the voice described in `knowledge/domain/visual-identity.md`.
- Changelog line and a `docs/QA.md` check go in the same pack commit when players will notice (`CLAUDE.md` rule 6).

## Branch and pull request

Asset changes go on `feat/<name>` or `fix/<name>` and open a pull request into `main`. The commit subject and the pull request title use `feat(pack):` or `fix(pack):`. Do not commit generated previews, `dist/`, or `*.mcaddon` (gitignored). Do not push to `main`.
