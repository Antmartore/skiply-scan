# Skiply — MVP Build Plan
*July 25, 2026 · for Anthony · pitch-ready for NuShoe (San Diego) next week*

## Where we are

You have a working MVP today (`MVP/index.html`): the Face ID-style scan flow from your Footwear Assessment Spec, running the full Identify → Grade → Value → Route pipeline with zero backend. It implements the exact valuation formula and routing tree from the spec, styled in Skiply navy-void with mono data labels.

The core architecture decision, made around your constraints (no API budget, latency is a dealbreaker, self-hosted):

**All AI runs on-device, in the browser.** A Hugging Face CLIP model downloads once (~90MB, cached), then every scan is local: about 1–3 seconds on a modern phone, faster on laptops with WebGPU. This directly fixes the 20-second latency that hurt the Mitsubishi demo, costs $0 per scan forever, and works offline on a warehouse floor. It's also Zeed's embedding architecture, just running client-side: catalog silhouettes are pre-embedded, each scan embeds the photo and matches by cosine similarity.

## The three-stage model strategy

**Stage 1 — now (shipped).** Zero-shot CLIP against 55 text-described silhouettes covering your Tier 1 brands (Nike AJ1/Dunk/AF1/Air Max, Adidas Samba/Gazelle/Ultraboost, NB 550/990/9060, Hoka, On, Asics, Brooks, Allbirds) and Tier 2 repairables (Red Wing, Ecco, Mephisto, Timberland, Docs). Honest read: brand and silhouette family are reliable; exact year/colorway comes from the matched catalog entry. Confidence is shown so low-certainty reads trigger the correction flow instead of a wrong answer delivered confidently.

**Stage 2 — image reference database (weeks 2–4).** Replace text embeddings with *image* embeddings: scrape ~10K shoe photos with prices (Amazon, StockX, eBay sold listings — Zeed's plan), embed them with a fashion-specialized model, and match scans against real product photos. This is where colorway-level ID becomes real. Candidate models to evaluate on Hugging Face:

| Model | Why |
|---|---|
| [Marqo/marqo-fashionCLIP](https://huggingface.co/Marqo/marqo-fashionCLIP) | Best-in-class fashion retrieval, drop-in CLIP replacement |
| [patrickjohncyh/fashion-clip](https://huggingface.co/patrickjohncyh/fashion-clip) | The original fashion CLIP, well documented |
| [Xenova/clip-vit-base-patch32](https://huggingface.co/Xenova/clip-vit-base-patch32) | What we run today — proven in-browser |
| [prithivMLmods/shoe-type-detection](https://huggingface.co/prithivMLmods/shoe-type-detection) | Cheap first-pass shoe-type gate |
| [dima806/footwear_image_detection](https://huggingface.co/dima806/footwear_image_detection) | Shoe/sandal/boot pre-filter |

I've suggested the **Hugging Face connector** in our chat — connect it and I can search, compare, and pull model details directly next session.

**Stage 3 — your proprietary model (months 2–3).** Every "Not right?" correction in the app is logged and exportable as CSV — real labeled data from real intake. Fine-tune the Stage 2 model on corrections + partner warehouse scans. That's the defensible asset: nobody else has ground-truth condition labels from NuShoe/Soles4Souls-scale intake.

## Valuation & routing (already live, tuneable)

- `EstValue = MSRP × GradeFactor × BrandDemandFactor × MarketFactor`, grade bands exactly per spec (A .55–.75 · B .40–.55 · C .15–.35 · D 0–.10).
- Demand factors are seeded from the spec's resale intel (AJ1 1.35, Samba 1.30, NB 550 1.15, Birkenstock Boston 1.10…). Stage 2 replaces these with live comps.
- Routing: RESALE (grade A/B, value ≥ $30) → REPAIR (welted/durable + grade C, → NuShoe) → DONATE (wearable, low value, → Soles4Souls/Goodwill) → RECYCLE (damaged/mold flag). Runner-up always shown.

## GitHub — how to set it up and how to hand it to me

1. **Create the repo:** github.com → New repository → `skiply-scan`, Public, no template. Upload the four files in `MVP/` (or push via git). Turn on **Settings → Pages → deploy from main** — that's your free client-facing link.
2. **Working with me on it (Cowork):** File menu → add folder → select your local clone. I can then read and edit the repo directly, same as I do with your Skiply Drive folder. There's also a GitHub connector in the registry if you want me pulling issues/PRs.
3. **Working with Claude Code:** install it (`npm install -g @anthropic-ai/claude-code`), then `cd skiply-scan && claude` and paste the contents of `CLAUDE_CODE_PROMPT.md`. It will scaffold the Stage 2 build in the repo. Note Claude Code uses API credits or your Claude subscription — the Max plan covers it without separate API billing.

## Week to pitch day

| Day | Do |
|---|---|
| Sat–Sun | Push `MVP/` to GitHub, enable Pages, test the live link on your phone. Scan 5 real shoes, note misreads. |
| Mon | Send me misreads — I tune catalog labels/demand factors in one pass. Load app on demo phone over wifi (caches model). |
| Tue | Dry-run the pitch: 1 live scan of a NuShoe-style boot + demo-mode Red Wing → REPAIR ending. Time it. |
| Wed | Freeze. No changes after this. Charge the phone. |
| Pitch | Open on wifi once beforehand; demo works even if their warehouse has none. |

## After the pitch — evolution to Zeed's stack

When you need accounts, partner dashboards, and the passcode gate (single-use 6-char, 1-hour, per Zeed): Next.js on Vercel (frontend) + FastAPI on Render (valuation/comps service) + Neon Postgres (scan logs, reference DB) + Upstash Redis (session/cache). ~$10–20/mo. The on-device engine stays — the backend adds the data layer, not the inference path, so latency never regresses. The Claude Code prompt covers this scaffold.

## Honest limitations, so you're never surprised in the room

- Exact year + colorway is catalog-derived in Stage 1, not read from the image. Say "silhouette-level ID today, colorway-level with our reference database" if asked.
- First-ever load needs internet (model download). After that, offline.
- Grading reads visible wear (sole, creasing); it can't see inside the shoe or smell mold — the damage flag catches severe visual cases only in v1.
- Safari on very old iPhones falls back to WASM: scans take ~3–5s instead of ~1s. Still under the 15s spec bar.
