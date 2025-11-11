# My Next Landing (Visual Studio friendly)

A clean Next.js 14 + Tailwind landing page with a cinematic video hero and sticky nav.
Open this folder directly in **Visual Studio** (or **VS Code**) and run:

```bash
npm install
npm run dev
```

## Replace media
- Put your background video at: `public/hero.mp4` (we intentionally do not include one here)
- Replace poster: `public/hero-poster.jpg`
- Replace split image: `public/sample-split.jpg`

## Notes
- Works great on desktop and iPadOS.
- The hero video is `muted`, `playsInline`, `autoPlay`, and `loop` for Safari compatibility.
- The header respects iOS safe areas via CSS env variables.
