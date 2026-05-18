# MindWhisper landing page

Marketing site for [MindWhisper](https://github.com/AllenGao6/mind-whisper). Built with Next.js 15 (App Router), Tailwind CSS v4, and TypeScript.

## Develop

```bash
# from repo root
pnpm install
pnpm dev:web         # → http://localhost:3000

# or from this directory
pnpm dev
```

## Build

```bash
pnpm build:web       # from repo root
pnpm start:web       # serve the production build locally
```

## Assets to provide

- `public/demo.mp4` — short looping screen recording of the hold-to-talk flow (HUD appears, transcript pastes). If the file is missing, the `<video>` element falls back to the poster image (`/master.png`).

The hero and how-it-works screenshots (`master.png`, `manubar.png`) are copied from the repo root into `public/` so the landing page is self-contained for static asset serving.

## Deploy

The site is Vercel-ready. Connect the repository in Vercel and set the project root to `apps/web/`.
