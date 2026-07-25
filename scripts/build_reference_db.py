#!/usr/bin/env python3
"""Build the Skiply reference image embedding DB (Stage 2 of the build plan).

Input
  --images DIR       product photos organized  brand/model/colorway/*.jpg
  --products CSV     metadata: brand,model,colorway,year,msrp,demand
                     (optional extra columns: category, repairable)

Output
  --out FILE         public/refdb.json — int8-quantized image embeddings +
                     product metadata. ~700 bytes/image, so 10K images ≈ 7MB
                     (target <15MB).

Model
  Default is Marqo/marqo-fashionCLIP (best fashion retrieval; the repo ships
  ONNX weights with transformers.js support, so the browser loads the SAME
  model and embeddings share one space). Fallbacks if it can't be loaded:

    --model marqo-fashionclip   open_clip  (pip install open_clip_torch)
    --model fashion-clip        transformers (pip install transformers torch)
    --model clip-b32            transformers — identical to today's in-app
                                model: zero added latency on WASM phones

  The app reads `browser_model_id` from refdb.json and loads that model for
  scanning; if the model can't load in the browser it ignores the refdb and
  falls back to text zero-shot, so shipping a refdb can never break scanning.

Usage
  pip install pillow numpy open_clip_torch     # or transformers torch
  python3 scripts/build_reference_db.py \
      --images ./reference_images --products ./products.csv

  Folder names are matched to CSV rows case-insensitively with spaces,
  dashes and underscores collapsed ("Air-Jordan-1_High" == "air jordan 1 high").
"""
import argparse, base64, csv, json, re, sys
from pathlib import Path

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

MODELS = {
    "marqo-fashionclip": {
        "loader": "open_clip",
        "hub_id": "hf-hub:Marqo/marqo-fashionCLIP",
        "browser_model_id": "Marqo/marqo-fashionCLIP",
    },
    "fashion-clip": {
        "loader": "transformers",
        "hub_id": "patrickjohncyh/fashion-clip",
        "browser_model_id": "patrickjohncyh/fashion-clip",
    },
    "clip-b32": {
        "loader": "transformers",
        "hub_id": "openai/clip-vit-base-patch32",
        "browser_model_id": "Xenova/clip-vit-base-patch32",
    },
}
FALLBACK_ORDER = ["marqo-fashionclip", "fashion-clip", "clip-b32"]


def slug(s: str) -> str:
    return re.sub(r"[\s_\-]+", " ", s.strip().lower())


def load_products(csv_path: Path):
    products = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = {k.strip().lower(): (v or "").strip() for k, v in row.items()}
            key = (slug(row["brand"]), slug(row["model"]), slug(row["colorway"]))
            products[key] = {
                "brand": row["brand"], "model": row["model"], "colorway": row["colorway"],
                "year": row.get("year", ""),
                "msrp": float(row.get("msrp") or 0),
                "demand": float(row.get("demand") or 1.0),
                "category": row.get("category", ""),
                "repairable": int(row.get("repairable") or 0),
            }
    return products


def scan_images(images_dir: Path):
    """Yield (brand_dir, model_dir, colorway_dir, [image paths])."""
    for brand in sorted(p for p in images_dir.iterdir() if p.is_dir()):
        for model in sorted(p for p in brand.iterdir() if p.is_dir()):
            for colorway in sorted(p for p in model.iterdir() if p.is_dir()):
                imgs = sorted(p for p in colorway.iterdir()
                              if p.suffix.lower() in IMG_EXTS)
                if imgs:
                    yield brand.name, model.name, colorway.name, imgs


def make_embedder(name: str):
    """Return (embed_fn(list[PIL.Image]) -> np.ndarray[n,dim], model_key)."""
    import numpy as np
    spec = MODELS[name]
    if spec["loader"] == "open_clip":
        import open_clip, torch
        model, _, preprocess = open_clip.create_model_and_transforms(spec["hub_id"])
        model.eval()

        def embed(pils):
            with torch.no_grad():
                batch = torch.stack([preprocess(im) for im in pils])
                feats = model.encode_image(batch)
                feats = feats / feats.norm(dim=-1, keepdim=True)
                return feats.cpu().numpy().astype(np.float32)
        return embed, name

    import torch
    from transformers import CLIPModel, CLIPProcessor
    model = CLIPModel.from_pretrained(spec["hub_id"])
    processor = CLIPProcessor.from_pretrained(spec["hub_id"])
    model.eval()

    def embed(pils):
        with torch.no_grad():
            inputs = processor(images=pils, return_tensors="pt")
            feats = model.get_image_features(**inputs)
            feats = feats / feats.norm(dim=-1, keepdim=True)
            return feats.cpu().numpy().astype(np.float32)
    return embed, name


def make_embedder_with_fallback(requested: str):
    order = [requested] + [m for m in FALLBACK_ORDER if m != requested]
    errs = []
    for name in order:
        try:
            embed, used = make_embedder(name)
            if used != requested:
                print(f"! {requested} unavailable, using fallback: {used}")
            return embed, used
        except Exception as e:  # missing dep, download failure, conversion blocker
            errs.append(f"  {name}: {type(e).__name__}: {e}")
            print(f"! could not load {name} ({type(e).__name__}), trying next…")
    sys.exit("No embedding model could be loaded:\n" + "\n".join(errs))


def quantize_int8(vec):
    """Symmetric per-vector int8: returns (base64 payload, float scale)."""
    import numpy as np
    scale = float(np.abs(vec).max()) / 127.0 or 1.0
    q = np.clip(np.round(vec / scale), -127, 127).astype(np.int8)
    return base64.b64encode(q.tobytes()).decode("ascii"), scale


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images", required=True, type=Path)
    ap.add_argument("--products", required=True, type=Path)
    ap.add_argument("--out", type=Path, default=Path("public/refdb.json"))
    ap.add_argument("--model", choices=list(MODELS), default="marqo-fashionclip")
    ap.add_argument("--max-per-colorway", type=int, default=8,
                    help="cap images per colorway to control refdb size")
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--dry-run", action="store_true",
                    help="validate folder structure + CSV matching, no embedding")
    args = ap.parse_args()

    products_csv = load_products(args.products)
    matched, unmatched_dirs = [], []
    for brand, model, colorway, imgs in scan_images(args.images):
        key = (slug(brand), slug(model), slug(colorway))
        if key in products_csv:
            matched.append((products_csv[key], imgs[: args.max_per_colorway]))
        else:
            unmatched_dirs.append(f"{brand}/{model}/{colorway}")

    n_imgs = sum(len(i) for _, i in matched)
    print(f"products.csv rows : {len(products_csv)}")
    print(f"matched colorways : {len(matched)}  ({n_imgs} images)")
    if unmatched_dirs:
        print(f"unmatched folders : {len(unmatched_dirs)} (no CSV row — skipped)")
        for d in unmatched_dirs[:10]:
            print(f"  - {d}")
    matched_keys = {(slug(p['brand']), slug(p['model']), slug(p['colorway']))
                    for p, _ in matched}
    csv_only = [k for k in products_csv if k not in matched_keys]
    if csv_only:
        print(f"CSV rows w/o photos: {len(csv_only)} (metadata kept, no vectors)")
    if not matched:
        sys.exit("Nothing to embed — check folder layout: brand/model/colorway/*.jpg")
    if args.dry_run:
        print("--dry-run: structure OK, stopping before embedding.")
        return

    from PIL import Image
    embed, used_model = make_embedder_with_fallback(args.model)

    prod_list, vectors = [], []
    dim = None
    for prod, imgs in matched:
        pi = len(prod_list)
        prod_list.append({**prod, "n_images": len(imgs)})
        for i in range(0, len(imgs), args.batch_size):
            batch_paths = imgs[i : i + args.batch_size]
            pils = [Image.open(p).convert("RGB") for p in batch_paths]
            feats = embed(pils)
            dim = feats.shape[1]
            for v in feats:
                payload, scale = quantize_int8(v)
                vectors.append({"p": pi, "e": payload, "s": round(scale, 8)})
        print(f"  embedded {prod['brand']} {prod['model']} · {prod['colorway']} "
              f"({len(imgs)} img)")

    refdb = {
        "format": "skiply-refdb/1",
        "model": used_model,
        "browser_model_id": MODELS[used_model]["browser_model_id"],
        "dim": dim,
        "quant": "int8-symmetric-per-vector",
        "products": prod_list,
        "vectors": vectors,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(refdb, f, separators=(",", ":"))
    mb = args.out.stat().st_size / 1e6
    print(f"\nWrote {args.out} — {len(prod_list)} products, {len(vectors)} vectors, "
          f"{mb:.1f} MB (model: {used_model})")
    if mb > 15:
        print("! refdb exceeds the 15MB target — lower --max-per-colorway")


if __name__ == "__main__":
    main()
