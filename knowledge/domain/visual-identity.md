# Visual identity

What `crew_rp/` and `tools/make_textures.mjs` actually contain. The Knowledge Factory briefs call this tree `resource_packs/`. In this repo the folder is `crew_rp/`. Hex values are the generator's RGB constants converted to hex. Where a day-0 read of the PNG bytes found that color among the frequent pixels, the table says so.

The generator's own comment: it draws the textures from scratch, with no third-party art. Run `node tools/make_textures.mjs` from the repo root. It writes the four entity skins, the stake icon, and both pack icons (`crew_rp/pack_icon.png` and `crew_bp/pack_icon.png`).

Brian's decision 12 in `CLAUDE.md`: a villager-style model (big head, nose) with working arms and a hard hat, one skin per role (Miner, Digger, Woodcutter, Farmer), picked by the `crew:role` entity property.

## What the pictures are

Pixel art. `make_textures.mjs` paints whole texels. The tool has no anti-aliasing step.

The geometry in `crew_rp/models/entity/worker.geo.json` (`geometry.crew_worker`, texture 64×64) is a villager-like body:

- Head cube 8×10×8, UV at (0, 0)
- Nose cube 2×4×2, UV at (24, 0)
- Hard-hat dome, head-sized with `inflate` 0.5, UV at (32, 0), plus a brim and a 2×2×1 lamp
- Body 8×12×6 at UV (16, 20), arms 4×10×4 at UV (44, 20), legs 4×12×4 at UV (0, 22)

The generator comment matches those UVs and adds the brim patch at (28, 46) and the lamp patch at (40, 46).

One PNG per role. `crew_rp/entity/worker.entity.json` maps texture keys `miner`, `digger`, `woodcutter`, `farmer`. `crew_rp/render_controllers/worker.render_controllers.json` selects `Array.skins[query.property('crew:role')]` in that same order. `ROLE_LIST` in `crew_bp/scripts/tools.js` is Miner, Digger, Woodcutter, Farmer, index 0–3.

The four skins share one face, nose, and hair drawing. Miner and Woodcutter share jeans. Hat, sleeves, and torso colors change by role. The Miner is the only role whose lamp patch is not the hat color.

## Resolution

| File | Pixels | Where that size is set |
| --- | --- | --- |
| `crew_rp/textures/entity/worker_miner.png` | 64×64 | PNG, and `texture_width` / `texture_height` 64 in the geometry |
| `crew_rp/textures/entity/worker_digger.png` | 64×64 | same |
| `crew_rp/textures/entity/worker_woodcutter.png` | 64×64 | same |
| `crew_rp/textures/entity/worker_farmer.png` | 64×64 | same |
| `crew_rp/pack_icon.png` and `crew_bp/pack_icon.png` | 64×64, byte-identical | `icon()` builds a 64×64 canvas and writes both paths |
| `crew_rp/textures/items/crew_survey_stake.png` | 16×16 | `stake()` builds a 16×16 canvas |

Entity skins and pack icons in this pack are 64×64. The only item texture shipped is the Survey Stake, and it is 16×16. That is the item-icon size this repo has used. There is no second item icon to compare it with.

A hand edit of a PNG will not match the next run of `make_textures.mjs`. An optional script argument writes 8× preview PNGs. Those previews are not in the packs.

## Shading

The generator uses a base color and a darker partner, then a few speckles:

- Hat top: `(x + y) % 6 === 0` uses the darker hat color
- Miner vest: `(x + y) % 5 === 0` uses `[228, 98, 12]` (`#e4620c`) instead of `[255, 122, 22]` (`#ff7a16`)
- Legs: `x % 4 === 0` uses the darker pants color; the bottom two rows of the leg cube are boots
- Sleeves end in skin-colored hands (`y >= 7` on the arm cube)
- Woodcutter shirt and sleeves are a three-color plaid from `plaid()`

Day-0 PNG reads, counting distinct non-transparent colors: Miner 18, Woodcutter 16, Digger 14, Farmer 14, pack icon 8, stake 4. The stake uses exactly the four colors in the table below.

## Palette

Shared colors from the generator. "In the PNGs" means a day-0 histogram of the shipped files showed that hex among the most common pixels.

| Use | RGB in `make_textures.mjs` | Hex | In the PNGs |
| --- | --- | --- | --- |
| Skin | `[190, 140, 105]` | `#be8c69` | all four entity skins |
| Skin shade | `[160, 112, 82]` | `#a07052` | all four entity skins |
| Nose | `[172, 122, 90]` | `#ac7a5a` | generator only; not in the top histogram rows checked on day 0 |
| Hair | `[85, 58, 36]` | `#553a24` | all four entity skins |
| Brow | `[70, 45, 30]` | `#462d1e` | generator only; not confirmed in the top rows |
| Eye white | `[235, 235, 235]` | `#ebebeb` | generator only; not confirmed in the top rows |
| Eye | `[40, 120, 60]` | `#28783c` | generator only; not confirmed in the top rows |
| Jeans (Miner, Woodcutter) | `[45, 65, 115]` | `#2d4173` | Miner and Woodcutter |
| Jeans shade | `[35, 50, 92]` | `#23325c` | generator only; not confirmed in the top rows |
| Boots | `[92, 60, 34]` | `#5c3c22` | generator only; not confirmed in the top rows |
| Belt | `[66, 44, 26]` | `#422c1a` | Miner histogram included `#422c1a` |

Role hats (`ROLES` in the generator) and the torso colors the histograms confirmed:

| Role | File | Hat | Hat shade | Other colors confirmed in that PNG |
| --- | --- | --- | --- | --- |
| Miner | `worker_miner.png` | `#f5c414` `[245, 196, 20]` | `#cd9b0a` `[205, 155, 10]` | Vest `#ff7a16`. Sleeve / shirt blue `#345caa` `[52, 92, 170]`. Lamp `[255, 250, 200]` = `#fffac8` (generator; not in the top rows checked). |
| Digger | `worker_digger.png` | `#ececec` `[236, 236, 236]` | `#c4c4c4` `[196, 196, 196]` | Overalls `#785634` `[120, 86, 52]`. Shirt `#a83a30` `[168, 58, 48]`. Darker overalls `#62462a` `[98, 70, 42]`. Lamp is the hat color. |
| Woodcutter | `worker_woodcutter.png` | `#de5420` `[222, 84, 32]` | `#b43e14` `[180, 62, 20]` | Plaid `#962020` `[150, 32, 32]`, `#c4302c` `[196, 48, 44]`, `#461414` `[70, 20, 20]`. Lamp is the hat color. |
| Farmer | `worker_farmer.png` | `#dec070` `[222, 192, 112]` | `#ba9c4e` `[186, 156, 78]` | Overalls `#487a3e` `[72, 122, 62]`. Shirt `#e4dec4` `[228, 222, 196]`. Darker overalls `#3a6432` `[58, 100, 50]`. Pants match the overalls, not the jeans. Lamp is the hat color. |

The four hats are four different colors. The Miner hat is the yellow pair above.

Survey Stake (`stake()`), all four colors present in the 16×16 PNG:

| Use | Hex | RGB |
| --- | --- | --- |
| Flag | `#ff7814` | `[255, 120, 20]` |
| Flag shade | `#dc5a0a` | `[220, 90, 10]` |
| Wood | `#8c5f32` | `[140, 95, 50]` |
| Wood shade | `#644123` | `[100, 65, 35]` |

Pack icon (`icon()`), confirmed in both icon PNGs: background `#282e3c` `[40, 46, 60]`, face `#d6a078` `[214, 160, 120]`, hat `#f5c414`, hat shade `#d6a00a` `[214, 160, 10]`, eyes `#281e1e` `[40, 30, 30]`, mouth `#965a46` `[150, 90, 70]`, stripe `#ff7814`, stripe highlight `#f0f0c8` `[240, 240, 200]`. The icon face `#d6a078` is not the entity skin `#be8c69`.

Spawn egg on the client entity: `"base_color": "#ff7814"` (stake flag and icon stripe), `"overlay_color": "#f5c414"` (Miner hat and icon hat).

Day-0 pixel reads found no `#000000` pixel and no `#00ff00`, `#ff00ff`, or `#00ffff` pixel in the six PNGs. The generator does not write those values. Whether that is a standing ban is an open question below. It is a description of these files.

The sample palette in `docs/grok/POC-KNOWLEDGE-FACTORY-v5.md` (`#3B322C`, `#6E5D4F`, `#A89984`, `#D4A359`, a 4-shade cap, a 12-word blurb cap) is a blank example in that charter. Those hexes are not in `make_textures.mjs` or in these PNGs.

## File and texture names

- Role skins: `crew_rp/textures/entity/worker_<role>.png` with `<role>` lowercase: `miner`, `digger`, `woodcutter`, `farmer`.
- Item texture path: `crew_rp/textures/items/crew_survey_stake.png`.
- `crew_rp/textures/item_texture.json`: `resource_pack_name` is `"crew"`, `texture_name` is `"atlas.items"`, and the short name is `crew_survey_stake` (no directory, no `crew:` colon). The item's `minecraft:icon` in `crew_bp/items/survey_stake.json` is that short name.
- Geometry: `geometry.crew_worker`. Animations: `animation.crew_worker.look`, `.walk`, `.mine`, `.sleep`, `.eat`. Render controller: `controller.render.crew_worker`. Material on the client entity: `entity_alphatest`.
- Client entity `scripts.scale` is `"0.8"`. Behavior-pack collision box in `crew_bp/entities/worker.json` is width `0.6`, height `1.8`. See open questions.

## Names and copy

Lang files (`crew_rp/texts/en_US.lang`, and the same lines in `crew_bp/texts/en_US.lang` except the last one):

| Key | String |
| --- | --- |
| `entity.crew:worker.name` | Crew Worker |
| `item.spawn_egg.entity.crew:worker.name` | Spawn Crew Worker |
| `item.crew:survey_stake.name` | Survey Stake |
| `action.interact.crew_manage` | Manage worker |
| `action.interact.crew_give_tool` | Give tool |
| `action.interact.crew_give_torches` | Give torches |

`Give torches` is only in the resource-pack lang file. The behavior-pack file does not have that line. The entity uses the key as `interact_text`. Both `languages.json` files list only `en_US`.

The item JSON display name is also `"Survey Stake"`. Menu category is `equipment`. There is no flavor-text component on the item.

The player guide is `crew_bp/scripts/guide_pages.js`, regenerated to `PLAYER_GUIDE.md` by `node tools/make_guide.mjs`. What those pages show:

- The worker is described as a little worker in a hard hat, owned by the player who built it.
- Role names in the guide are Digger, Miner, Woodcutter, and Farmer. A shovel is a Digger, a pickaxe is a Miner. Axes and hoes are named as later jobs.
- Page titles in that file are sentence case ("Build a worker", "Talk to your worker"). In-game headings use `§l§6`. Highlighted words use `§e`.
- Steps are short and in the second person ("Place a barrel", "Crouch and tap it").

Item and entity names in lang are title case. Interact lines are sentence case. The guide titles are sentence case. Nothing in these files sets a word-count cap.

## Open questions

1. Nose, brow, eye, jeans-shade, and boot colors are in the generator. Day 0 did not confirm each of them in the most common PNG pixels. They are painted; they are small.
2. No `#000000` and no `#00ff00` in the current PNGs is an observation. No dated decision says new art must stay that way.
3. Decision 12 says the worker is about 1.75 blocks tall and needs 2 blocks of headroom. The collision box height is `1.8`. The client entity scale is `0.8`. The files do not say which number is the intended on-screen height.
4. `knowledge/assets/examples/` has no annotated Do/Don't PNGs. The pictures to compare against are the files under `crew_rp/textures/`.
5. There is no lore file beyond the lang strings and the guide pages. The guide does not give the workers a backstory.
