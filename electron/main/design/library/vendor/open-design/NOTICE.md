# Open-Design Vendor NOTICE

This directory holds resources imported from the open-source project **open-design**
(Anthropic Labs, Apache-2.0 licensed) and any third-party sub-resources it bundles.

## Upstream

- Project: open-design
- Upstream URL: https://github.com/anthropic-labs/open-design
- License: Apache-2.0 (see `LICENSE.txt` next to this file)
- Imported at: 2026-05-14
- Commit SHA: `7c8305f4862796cebe0e05b6fc6406823a8debf2`

## Scope of import

Resources mirrored into `electron/main/design/library/`:

| Category | Path in this repo | Original path |
| --- | --- | --- |
| Device & deck frames | `frames/*.html` | `assets/frames/*.html`, `templates/{deck-framework,kami-deck}.html` |
| Design systems | `systems/<id>/DESIGN.md` | `design-systems/<id>/DESIGN.md` |
| Built-in skills (assets / references / example) | `skills/<id>/` | `skills/<id>/` (selected, IPO-curated) |
| Prompt templates | `media/{image,video}/*.md` | `prompt-templates/{image,video}/*.md` (loaded lazily in M3) |

Each imported file keeps a 4-5 line attribution comment at the top of the file
referencing its original path, license, and import commit. Files that originate
from third-party sources inside open-design (e.g. `guizang-ppt` MIT, `kami` MIT)
preserve their own LICENSE files in-tree.

## Compliance

The Apache-2.0 license requires:

1. Including the license text → see `LICENSE.txt`.
2. Stating significant modifications → tracked per-file via the attribution
   header; substantive changes are also recorded in `docs/changelog.md`.
3. Preserving NOTICE attributions where present → preserved verbatim in
   per-file headers.

## Sync mechanism

`sync.json` records the upstream path and SHA-256 of every imported file so
that `scripts/sync-open-design.mjs` (added in M4) can diff against future
upstream releases and surface drift.
