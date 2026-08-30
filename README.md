# photo-gen

**A local image-generation pipeline for game art, built around what an image model will not do.**

`gpt-image-2` produces large opaque pictures. A game needs small assets with alpha, at several
sizes, on a consistent grid, in one style across dozens of items. Everything here is the distance
between those two facts: generate large on a flat background, flood-fill the background out, trim
to the alpha bounds, resample down with Lanczos, snap to a true sprite grid, and trace to SVG when
a vector master is wanted. The prompt steering is written the same way, asking for bold silhouettes
and simplified detail because that is what survives being scaled to 64 pixels.

- Generate and edit concept and final art with prompts, reference images, and painted inpainting masks
- Organize everything into projects, folders and tags, with full generation metadata and lineage
- Character turnaround boards: consistent multi-angle views of one character, by feeding approved
  angles back in as references so face, outfit and proportions do not drift between views
- A curated catalogue of game art styles, each recording how the look is actually built in a 3D
  pipeline rather than only what it looks like, with a fixed sample subject so previews compare
  like for like
- Cost tracking per generation and per project, priced from the published rate table

## Requirements

- Node.js 20+ (developed on 24)
- `OPENAI_API_KEY` environment variable

## Usage

```
npm install
npm run dev     # dev mode: server on :8787, UI on :5173 (proxied)
npm run build   # build the web UI + typecheck
npm start       # production mode: serves built UI at http://localhost:8787
```

The image library (SQLite DB + image files) lives in `./library` by default; override with the `PHOTO_GEN_LIBRARY` environment variable. The library folder is fully portable — DB and files together.

## Game-asset CLI (pgen)

`pgen.cmd` / `pgen` at the repo root drive the same library from the terminal, tuned for producing game assets (no server needed; safe alongside a running server).

```
pgen gen "a healing potion" -p MyGame --scaffold icon --style hand-painted-fantasy \
    --ref approved-icon.png --cutout -o out/
pgen gen "rune icons: fire, frost, thorns, ..." -p MyGame --sheet 3x3 --cutout
pgen slice sheet.png --grid 3x3 --key auto --trim --pad-to 128
pgen cutout art.png --key auto --pad 8      # flood-fill background removal + alpha trim
pgen resize icon.png --size 128,96,64       # lanczos, transparent padding
pgen pixel art.png --height 48 --colors 14  # snap onto a true sprite grid (crisp mode sampling)
pgen vector sprite-px48.png --raster 72,140 # pixel sprite to SVG master + crisp any-size rasters
pgen preview icon.png --sizes 128,96,64     # composited at game sizes over a panel color
pgen projects | pgen styles | pgen recent   # library info, style catalog, cost history
```

Generations record full lineage and cost in the library exactly like the UI; `--ref`/`--base` accept library image ids or files on disk (auto-imported). gpt-image-2 outputs neither transparency nor small images, so the intended flow is: generate large on a flat background, `--cutout`, then `resize` down.

## Building and testing

```
npm install
npm test          # 127 tests
npm run typecheck # every workspace, plus the tests
```

The tests cover the deterministic core, which is where the decisions live: the gpt-image-2 size
constraints and the presets that claim to satisfy them, cost estimation against the published
anchor table (including the pixel-scaling fallback for non-anchor sizes), the prompt composers for
character turnarounds and the asset scaffolds, and the style catalogue's own invariants. Anything
that calls OpenAI sits behind those and is not exercised here.

## License

[MIT](LICENSE).
