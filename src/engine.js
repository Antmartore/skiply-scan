/* =====================================================================
   Engine: zero-shot CLIP (Hugging Face, runs in-browser via Transformers.js).
   No APIs. $0/scan. Loaded from CDN (pinned) so the service worker can
   cache a stable URL; model weights are cached by Transformers.js itself.
   ===================================================================== */
import { CAT, COND } from "./catalog.js";
import { store } from "./store.js";
import { fetchRefdb, decodeRefdb } from "./refdb.js";

const CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const DEFAULT_MODEL_ID = "Xenova/clip-vit-base-patch32";
const MODEL_NAMES = {
  "Xenova/clip-vit-base-patch32": "CLIP ViT-B/32",
  "Marqo/marqo-fashionCLIP": "Marqo fashionCLIP",
  "patrickjohncyh/fashion-clip": "fashionCLIP",
};

export const engine = { ready:false, device:"—", modelId:DEFAULT_MODEL_ID, modelName:"CLIP ViT-B/32", catEmb:null, condEmb:null, refdb:null };

let T, tokenizer, textModel, processor, visionModel;

async function loadModels(modelId, opts){
  tokenizer   = await T.AutoTokenizer.from_pretrained(modelId);
  textModel   = await T.CLIPTextModelWithProjection.from_pretrained(modelId,opts);
  processor   = await T.AutoProcessor.from_pretrained(modelId);
  visionModel = await T.CLIPVisionModelWithProjection.from_pretrained(modelId,opts);
}

export async function loadEngine({ onStatus = ()=>{}, onProgress = ()=>{} } = {}){
  try{
    // Reference DB (if deployed) decides which model we run, so scan and
    // reference embeddings live in the same space. Absent → text zero-shot.
    const refJson = await fetchRefdb(import.meta.env.BASE_URL + "refdb.json");

    onStatus("loading","DOWNLOADING MODEL");
    T = await import(/* @vite-ignore */ CDN_URL);
    const prog = p=>{ if(p.status==="progress"&&p.total){ onProgress(Math.round(p.loaded/p.total*100)); } };
    let opts = {progress_callback:prog};
    let modelId = refJson?.browser_model_id || DEFAULT_MODEL_ID;
    try{ // try WebGPU, fall back to WASM
      if(navigator.gpu){ opts.device="webgpu"; engine.device="WebGPU"; }
      else engine.device="WASM";
      await loadModels(modelId,opts);
    }catch(firstErr){
      if(modelId!==DEFAULT_MODEL_ID){
        // refdb model unavailable in-browser — drop the refdb (embedding
        // spaces would not match) and run the proven default.
        console.warn("refdb model failed to load, falling back to text zero-shot:",firstErr);
        modelId = DEFAULT_MODEL_ID;
        try{ await loadModels(modelId,opts); }
        catch(gpuErr){ engine.device="WASM"; await loadModels(modelId,{progress_callback:prog}); }
      }else{
        engine.device="WASM";
        await loadModels(modelId,{progress_callback:prog});
      }
    }
    engine.modelId = modelId;
    engine.modelName = MODEL_NAMES[modelId] || modelId;

    onStatus("loading","COMPILING CATALOG EMBEDDINGS");
    const embKey = "skiply_emb_v2:"+modelId; // text embeddings are model-specific
    const cached = store.get(embKey,null);
    if(cached && cached.n===CAT.length){ engine.catEmb=cached.cat; engine.condEmb=cached.cond; }
    else{
      engine.catEmb  = await embedTexts(CAT.map(c=>"a photo of "+c.label));
      engine.condEmb = await embedTexts(COND.map(c=>"a photo of "+c.label));
      store.set(embKey,{n:CAT.length,cat:engine.catEmb,cond:engine.condEmb});
    }

    if(refJson && refJson.browser_model_id===modelId){
      onStatus("loading","LOADING REFERENCE DB");
      engine.refdb = decodeRefdb(refJson);
    }

    engine.ready=true;
    const mode = engine.refdb ? `REF DB ${engine.refdb.n} IMG` : "ON-DEVICE";
    onStatus("ready",`ENGINE READY · ${mode} · `+engine.device.toUpperCase());
    return true;
  }catch(e){
    console.error(e);
    onStatus("err","ENGINE OFFLINE — DEMO MODE AVAILABLE");
    return false;
  }
}

export async function embedTexts(texts){
  const out=[];
  for(let i=0;i<texts.length;i+=16){
    const batch=texts.slice(i,i+16);
    const inp=tokenizer(batch,{padding:true,truncation:true});
    const {text_embeds}=await textModel(inp);
    const d=text_embeds.dims[1];
    for(let b=0;b<batch.length;b++){
      const v=Array.from(text_embeds.data.slice(b*d,(b+1)*d));
      out.push(norm(v));
    }
  }
  return out;
}

export async function embedImage(canvas){
  const blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",.85));
  const img=await T.RawImage.fromBlob(blob);
  const inp=await processor(img);
  const {image_embeds}=await visionModel(inp);
  return norm(Array.from(image_embeds.data));
}

export function norm(v){ const n=Math.hypot(...v)||1; return v.map(x=>x/n); }
export function dot(a,b){ let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }
export function softmaxTop(sims,scale=80){ // CLIP-style logit scale; higher = sharper
  const mx=Math.max(...sims); const ex=sims.map(s=>Math.exp((s-mx)*scale));
  const sum=ex.reduce((a,b)=>a+b,0); return ex.map(e=>e/sum);
}
