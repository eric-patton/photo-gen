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
