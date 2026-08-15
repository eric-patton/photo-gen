# photo-gen

Local image generation and library tool for game development art, backed by OpenAI `gpt-image-2`.

- Generate and edit concept/final art with prompts, reference images, and painted inpainting masks
- Organize everything into projects, folders, and tags with full generation metadata and lineage
- Character turnaround boards: generate consistent multi-angle views of the same character by feeding approved angles back as references
- Cost tracking per generation and per project

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
