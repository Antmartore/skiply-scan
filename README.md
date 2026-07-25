# Skiply Scan — MVP

Point a phone at a shoe. In seconds: what it is, what it's worth, where it goes. All AI runs on-device — no API keys, no per-scan cost, works offline after first load.

**IDENTIFY · VALUE · ROUTE**

## Develop & build

The app is a Vite project (vanilla JS, no framework) that builds to a fully static bundle.

```bash
npm install
npm run dev        # local dev server (camera needs HTTPS or localhost)
npm run build      # static bundle → dist/
npm run preview    # serve the built bundle locally
```

To test on your phone during development: `npm run dev -- --host`, then open your laptop's LAN IP on the same wifi. (Camera access over plain HTTP works only on localhost — for LAN testing either use the Upload photo fallback or a tunnel like `npx localtunnel`.)

## Deploy (GitHub Pages)

Pushes to `main` build and deploy `dist/` automatically via `.github/workflows/deploy.yml`.

One-time setup: repo **Settings → Pages → Source: "GitHub Actions"** (not "Deploy from a branch"). The live URL is `https://<username>.github.io/skiply-scan/`. The build uses a relative base path, so the same bundle also deploys unchanged to Vercel or any static host later.

## Offline / install (PWA)

The app is a full PWA: the service worker precaches the app shell at first visit and caches the Transformers.js runtime + ONNX model files as they download. After one load on wifi, **airplane mode → the app opens and scans**.

- **Install on iPhone:** open the live link in Safari → Share → *Add to Home Screen*. Launches full-screen, black theme, Skiply icon.
- **Install on Android:** Chrome shows an install prompt, or ⋮ → *Add to Home screen*.
- Icons are generated from the SVG wordmark by `scripts/gen_icons.py` (Pillow) into `public/icons/`.

## Reference image DB (Stage 2 — colorway-level ID)

Stage 1 identifies by matching scans against *text descriptions*. Stage 2 matches against *real product photos*: colorway-level ID with year + MSRP from your own reference set.

```bash
pip install pillow numpy open_clip_torch          # or: transformers torch
python3 scripts/build_reference_db.py \
    --images ./reference_images --products ./products.csv
```

- Photos organized `reference_images/<brand>/<model>/<colorway>/*.jpg` (scraped product shots, StockX/eBay-style listings — 3–8 per colorway is plenty).
- `products.csv` columns: `brand,model,colorway,year,msrp,demand` (optional `category,repairable`). Template: `scripts/products.example.csv`. Folder names match CSV rows case-insensitively.
- Output `public/refdb.json`: int8-quantized embeddings, ~700 bytes/image → 10K images ≈ 7MB (<15MB target). Use `--dry-run` to validate the folder/CSV layout first.
- Default embedding model is **Marqo/marqo-fashionCLIP** (best-in-class fashion retrieval; ships ONNX, so the *browser loads the same model* and embeddings share one space). Fallbacks: `--model fashion-clip`, `--model clip-b32`. Building with `clip-b32` keeps today's exact in-app model — zero added latency on older WASM phones; fashionCLIP (ViT-B/16) is heavier, fine on WebGPU.

When `refdb.json` is deployed, the app matches scans against reference photos (result shows **colorway + year**, conf chip shows `REF`) and the correction sheet lists refdb products. No refdb → text zero-shot, exactly as before. If the refdb's model can't load in a browser, the app drops the refdb and falls back — shipping a refdb can never break scanning.

## Before the NuShoe pitch — checklist

1. Open the live link on your demo phone **on wifi once** — this downloads the model (~90MB, one time) and caches it.
2. Scan 2–3 real shoes at the hotel to warm it up and sanity-check reads.
3. Know the fallback: the **▶ Demo scan** button cycles four polished scans — Air Jordan 1 (RESALE), Samba (RESALE), worn Hoka Clifton (DONATE), and a Red Wing Iron Ranger that routes to **REPAIR → NuShoe**. End on that one.
4. The talk track: *"No cloud, no API, no per-scan cost. The AI runs on the phone — that's why it's this fast, and why it works on a warehouse floor with no wifi."*

## What's inside

- **Identify** — zero-shot CLIP (Hugging Face `Xenova/clip-vit-base-patch32`, runs in-browser via Transformers.js, WebGPU when available) matched against a 55-silhouette catalog: Nike, Adidas, New Balance, Hoka, On, Asics, Brooks, Allbirds + Red Wing/Ecco/Mephisto boots for the NuShoe tier.
- **Grade** — 3-angle guided capture (side/sole/toe, Face ID-style), condition classes → A/B/C/D + 0–100 score.
- **Value** — `MSRP × GradeFactor × BrandDemand × Market` per the Skiply spec, shown as a today range.
- **Route** — decision tree → RESALE / REPAIR (NuShoe) / DONATE (Soles4Souls, Goodwill) / RECYCLE, with runner-up.
- **Training flywheel** — every "Not right?" correction is logged; Settings → Export CSV is your labeled training data.

## Code map

```
index.html            app shell markup (screens, sheets)
src/main.js           UI wiring: capture flow, scan pipeline, results, settings
src/engine.js         on-device CLIP engine (Transformers.js, WebGPU→WASM)
src/catalog.js        55-silhouette catalog + condition classes
src/refdb.js          reference-image DB decode + nearest-photo matching
src/valuation.js      MSRP × GradeFactor × Demand × Market
src/routing.js        RESALE / REPAIR / DONATE / RECYCLE decision tree
src/demo.js           pitch demo scans + result illustrations
src/store.js          localStorage helper
src/styles.css        Skiply brand system (navy void, mono data labels)
public/               static assets: favicon, PWA icons
scripts/gen_icons.py  renders PWA icons from the SVG wordmark
scripts/build_reference_db.py   embeds product photos → public/refdb.json
.github/workflows/    GitHub Pages deploy on push to main
```

Full roadmap: `Skiply_MVP_Build_Plan.md`. Original handoff prompt: `CLAUDE_CODE_PROMPT.md`.
