# Assets

Static assets for the browser game including images, sounds, and other media files.

## Purpose

This package contains game assets including:
- Sprite sheets and textures
- Audio files (sound effects, music)
- Fonts and typography resources
- Configuration files and data
- Static media resources

## Licensing & Attributions

All third‑party assets included in this repository must be documented here with provenance, SPDX license identifier, and any required attribution or redistribution restriction. Full license texts (when required by the license) must be placed in the centralized licenses directory: `assets/LICENSES/` and linked below.

Third‑party assets (examples and placeholders — replace with actual entries)
- Example: Kenney Game Assets — 2D Platformer Pack
  - Source / provenance: https://kenney.nl/assets/2d-platformer-pack
  - SPDX: CC0-1.0
  - Attribution / restrictions: Public domain (no attribution required). Full license file: [`assets/LICENSES/kenney-2d-platformer-CC0.txt`](assets/LICENSES/kenney-2d-platformer-CC0.txt:1)
- Example: FreeSound effect "coin.wav" by Jane Doe
  - Source / provenance: https://freesound.org/people/janedoe/sounds/12345/
  - SPDX: CC-BY-4.0
  - Attribution text (required): "coin.wav by Jane Doe (https://freesound.org), licensed under CC BY 4.0"
  - Redistribution: Permitted with attribution. Full license file: [`assets/LICENSES/CC-BY-4.0.txt`](assets/LICENSES/CC-BY-4.0.txt:1)
- [Replace with actual asset name]
  - Source / provenance: [URL]
  - SPDX: [SPDX identifier]
  - Attribution / restrictions: [Required attribution text or redistribution restrictions]
  - Full license file: [`assets/LICENSES/<asset>-LICENSE.txt`](assets/LICENSES/<asset>-LICENSE.txt:1)

Where to put full license text
- Add full license text files into `assets/LICENSES/`. Use a clear filename pattern: `<asset-or-pack>-LICENSE-<SPDX>.txt`. Link to those files from this README (example links above).

Contributor checklist / required metadata for new assets
When adding any new asset or asset pack, include the following metadata in the same commit and update this README with the asset entry:
- Asset filename(s) and path(s)
- Human‑readable name of the asset or pack
- Source / provenance URL (where it was downloaded or purchased)
- Author / copyright holder
- SPDX license identifier (see https://spdx.org/licenses/)
- Exact attribution text to display (if required)
- Redistribution restrictions (if any)
- Path to full license text in `assets/LICENSES/` (if required)

Suggested PR checklist (add to PR template or mention in CONTRIBUTING):
- [ ] Added asset files under `assets/` in appropriate subdirectory
- [ ] Added license metadata entry to `assets/README.md` (this section)
- [ ] Added full license text file to `assets/LICENSES/` when required
- [ ] Verified license compatibility with project distribution policy

Incompatible licenses and escalation steps
- Licenses that are potentially incompatible with distributing the project (examples — evaluate on a case-by-case basis):
  - AGPL (e.g., AGPL-3.0-only or AGPL-3.0-or-later) — strong copyleft affecting network distribution
  - GPL variants (depending on how project is distributed)
  - Proprietary or "no redistribution" licenses that forbid bundling or re‑licensing
- If you suspect an asset's license is incompatible or unclear:
  1. Do not merge or publish a build that includes the asset.
  2. Remove the asset from the branch / stop the distribution workflow.
  3. Open a GitHub issue titled "Asset license review: <asset-name>" and include the asset metadata and links.
  4. Tag the maintainers and legal reviewer (if available). If no explicit maintainers are listed, contact the repository owner or open a support issue on this repository.
  5. Proposed actions after review: obtain a compatible license, replace the asset, obtain permission from the author, or remove the asset.

Contact / maintainers
- Use GitHub Issues for formal license/escalation requests. If immediate attention is required, mention the repository maintainers or use the project's designated contact channel. Replace this line with an actual maintainer or team contact if known.

## Development

*To be implemented*