# Visual identity

What the shipped resource pack actually looks like. Sources: `tools/make_textures.mjs` (the generator; its comment says the art is drawn from scratch, no third-party art), the PNGs under `crew_rp/`, `crew_rp/models/entity/worker.geo.json`, and `crew_rp/entity/worker.entity.json`. Hex values below were checked against those PNGs on day 0. Colors that appear only as a generator constant are marked.

Brian's decision 12 (`CLAUDE.md`): a villager-style model (big head, nose) with working arms and a hard hat, one skin per role (Miner, Digger, Woodcutter, Farmer), picked by the `crew:role` entity property.

## Style

- Pixel art. The generator paints whole texels. No anti-aliased edges in the tool that draws the textures.
- Villager-like worker: a tall head (geometry cube 8×10×8), a separate nose cube (2×4×2), a hard-hat dome plus brim and a small lamp cube. Arms and legs are separate bones so they animate.
- One skin per role. The client picks the texture with `query.property('crew:role')` (`crew_rp/render_controllers/worker.render_controllers.json`). Index order is Miner, Digger, Woodcutter, Farmer, the same order as `ROLE_LIST` in `crew_bp/scripts/tools.js`.
- Shared body: the four skins use the same face, nose, hair, and (for Miner and Woodcutter) the same jeans. The hat, shirt, and overalls change with the role.
- Shading is a base color plus a darker shade, with a few speckles (`(x + y) % 6` on hat tops, `(x + y) % 5` on the Miner vest). It is not a flat 4-shade limit. The Miner texture has 18 distinct colors; Digger and Farmer have 14.

## Resolution

| Asset | Size | Evidence |
| --- | --- | --- |
| Role skins `crew_rp/textures/entity/worker_<role>.png` | 64×64 | PNG header, and `texture_width` / `texture_height` 64 in `worker.geo.json` |
| Pack icons `crew_bp/pack_icon.png` and `crew_rp/pack_icon.png` | 64×64, byte-identical | PNG header |
| Survey Stake item `crew_rp/textures/items/crew_survey_stake.png` | 16×16 | PNG header. `stake()` in the generator builds a 16×16 canvas |

**Item icons are 16×16.** Do not replace `crew_survey_stake.png` with a 32×32 icon unless Brian changes this and the generator.

Entity skins stay 64×64 and on the UV layout commented at the top of `tools/make_textures.mjs` (head at (0,0), nose at (24,0), hat dome at (32,0), body at (16,20), arms at (44,20), legs at (0,22), brim patch at (28,46), lamp patch at (40,46)). Redraw by editing the generator and running `node tools/make_textures.mjs`. A PNG edited by hand will not match the next run of that script.

## Palette

Role hard-hat colors (generator `ROLES.*.hat` / `hatD`, confirmed in the PNG histograms):

| Role | File | Hat | Hat shade |
| --- | --- | --- | --- |
| Miner | `textures/entity/worker_miner.png` | `#f5c414` | `#cd9b0a` |
| Digger | `textures/entity/worker_digger.png` | `#ececec` | `#c4c4c4` |
| Woodcutter | `textures/entity/worker_woodcutter.png` | `#de5420` | `#b43e14` |
| Farmer | `textures/entity/worker_farmer.png` | `#dec070` | `#ba9c4e` |

**Hat colors are role identity.** Each role keeps its own hat color. Do not repaint every role's hard hat the same color. Do not move the Miner hat off `#f5c414` / `#cd9b0a`.

Miner lamp (the only lamp that is not just the hat color): generator `[255, 250, 200]` = `#fffac8`.

Other generator colors confirmed as frequent PNG pixels:

| Use | Hex | Where |
| --- | --- | --- |
| Skin | `#be8c69` | all four entity textures |
| Hair | `#553a24` | all four entity textures (generator `HAIR` is `[85, 58, 36]`) |
| Miner vest orange | `#ff7a16` | `worker_miner.png` (generator light orange `[255, 122, 22]`) |
| Miner shirt / sleeve blue | `#345caa` | `worker_miner.png` (generator `[52, 92, 170]`) |
| Digger overalls | `#785634` | `worker_digger.png` (generator `[120, 86, 52]`) |
| Digger shirt | `#a83a30` | `worker_digger.png` (generator `[168, 58, 48]`) |
| Farmer overalls | `#487a3e` | `worker_farmer.png` |
| Farmer shirt | `#e4dec4` | `worker_farmer.png` |
| Survey Stake flag | `#ff7814` / `#dc5a0a` | `crew_survey_stake.png` |
| Survey Stake wood | `#8c5f32` / `#644123` | `crew_survey_stake.png` |
| Pack-icon background | `#282e3c` | both `pack_icon.png` files (generator `[40, 46, 60]`) |

Spawn egg on the client entity: `"base_color": "#ff7814"` (same orange as the stake flag and the pack-icon stripe), `"overlay_color": "#f5c414"` (Miner hat).

**Observed, and treated as a constraint until Brian says otherwise:** none of the six PNGs contain a `#000000` pixel or a `#00ff00` / `#ff00ff` / `#00ffff` pixel. The generator never writes those values. Do not add a pure-black outline or a neon-green accent. Whether Brian wants that as a permanent ban is an open question (below). It is not a license to invent a different palette.

The muted medieval palette in the sample `visual-identity.md` inside `docs/grok/POC-KNOWLEDGE-FACTORY-v5.md` (`#3B322C`, `#6E5D4F`, `#A89984`, `#D4A359`, "max 4 shades") is the charter's blank template. It is not this pack's palette. Do not apply it here.

## Naming

- Role texture files: `crew_rp/textures/entity/worker_<role>.png` with role in lowercase: `miner`, `digger`, `woodcutter`, `farmer`.
- Item texture file: `crew_rp/textures/items/crew_survey_stake.png`. The short name in `crew_rp/textures/item_texture.json` is `crew_survey_stake` (no path, no `crew:` colon). The item's `minecraft:icon` uses that short name.
- Geometry id: `geometry.crew_worker`. Animation ids: `animation.crew_worker.look`, `.walk`, `.mine`, `.sleep`, `.eat`. Render controller: `controller.render.crew_worker`.
- Display names in `en_US.lang`: "Crew Worker", "Survey Stake" (title case). Interact lines are sentence case: "Manage worker", "Give tool", "Give torches".

## Voice

Player text is the pages in `crew_bp/scripts/guide_pages.js` (regenerated into `PLAYER_GUIDE.md` by `node tools/make_guide.mjs`). Observed traits, not a word-count rule:

- Short steps, second person, plain words ("Place a barrel", "Crouch and tap it").
- Guide headings are sentence case ("Build a worker"), drawn in-game with `§l§6` and highlights with `§e`.
- No slang in those pages.

The charter template's "descriptions stay under 12 words" and "titles use Title Case" rules are not how this guide is written. Guide titles are sentence case. Item names are title case. Do not impose the 12-word cap.

## Open questions

1. Is "no `#000000` and no neon green" a permanent art rule, or only a description of today's generator? Day 0 treats it as a constraint because every shipped PNG follows it. `inbox/player-feedback.md` SAMPLE-1 asks for `#00FF00` hats and must not be applied while this stands.
2. Intended on-screen height is not one number. Decision 12 says about 1.75 blocks tall and 2 blocks of headroom. `crew_bp/entities/worker.json` sets `minecraft:collision_box` height to `1.8` and width to `0.6`. The client entity sets `"scale": "0.8"`. Those are not reconciled in one place.
3. `knowledge/assets/examples/` has no Do/Don't PNGs yet. The live references are the files under `crew_rp/textures/`.
