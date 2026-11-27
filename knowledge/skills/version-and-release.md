# Skill: version and release

The version is one triplet in seven places. `python tools/bump_version.py` writes them together. Do not edit the numbers by hand.

Places it checks (`tools/bump_version.py`):

- `crew_bp/manifest.json` header, every module, and the dependency on the resource pack
- `crew_rp/manifest.json` header and every module
- `crew_bp/scripts/util.js` — `export const VERSION = "x.y.z";`

Commands:

```text
python tools/bump_version.py            # print the current versions
python tools/bump_version.py --check    # exit 1 if they disagree
python tools/bump_version.py X.Y.Z      # set them
```

The script does not change pack UUIDs.

On day 0 those places all read `0.4.0`. `CHANGELOG.md` has an "Unreleased" section on top of `v0.4.0`. That is the factory's normal state between releases, not a version mismatch. The mismatch that does exist is the BP manifest **description** string, which still says "v0.2". The version fields were not wrong; the sentence was left behind. Flagged. Do not "fix" it by bumping the version.

## Build

`python tools/build.py` checks the versions agree, runs `node tools/sim/run.mjs`, and writes `dist/crew-addon-<version>.mcaddon`. It does not bump. `--skip-tests` skips the mock run. `dist/` and `*.mcaddon` are gitignored.

## Release

`node tools/release.mjs X.Y.Z` on a clean tree: bump, turn "Unreleased" into that version, regenerate the guide, build, commit, and tag `vX.Y.Z`. `--build-only` bumps and builds without git.

A release is not a Knowledge Factory `chore(knowledge):` commit. Do not cut a release from a curator run.

Players keep a cached resource pack until the version changes, so a server update that changes `crew_rp/` needs a new triplet. Script-only experiments on staging are described in `CLAUDE.md`; do not invent a second version channel.

## README version snippets

`README.md` shows world pack-list entries at `[0, 4, 0]` and tells the reader to look for `[Crew] v0.4.0 loaded`. Those numbers match the manifests today.

`tools/release.mjs` rewrites the changelog heading, runs `make_guide.mjs`, and bumps the manifests and `util.js`. It does not edit `README.md`. The last line of a release only prints a reminder to set the new triplet in the world's pack lists. After the next release, someone has to update the README examples or they will lie. A flag records that. The examples are still true at `0.4.0`.
