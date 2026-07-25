# Skiply Scan — MVP

Point a phone at a shoe. In seconds: what it is, what it's worth, where it goes. All AI runs on-device — no API keys, no per-scan cost, works offline after first load.

## Run it (2 minutes)

The camera needs HTTPS or localhost, so serve the file rather than double-clicking it:

**Option A — local test right now**
```
cd "path/to/Skiply/MVP"
npx serve .        # or: python3 -m http.server 8000
```
Open the printed URL. On your phone, use the same wifi and visit your laptop's IP (e.g. http://192.168.1.20:8000).

**Option B — free public link (share with clients)**
1. Create a GitHub account if needed → github.com → New repository → name it `skiply-scan` → Public → Create.
2. On the repo page: "uploading an existing file" → drag `index.html` in → Commit.
3. Repo Settings → Pages → Source: "Deploy from a branch" → Branch: `main` → Save.
4. Two minutes later your app is live at `https://<username>.github.io/skiply-scan/` — that's the link clients open to scan their own shoes.

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

Full roadmap: `Skiply_MVP_Build_Plan.md`. Handoff prompt for Claude Code: `CLAUDE_CODE_PROMPT.md`.
