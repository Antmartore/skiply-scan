/* =====================================================================
   Engine: zero-shot CLIP (Hugging Face, runs in-browser via Transformers.js).
   No APIs. $0/scan. Loaded from CDN (pinned) so the service worker can
   cache a stable URL; model weights are cached by Transformers.js itself.
   ===================================================================== */
import { CAT, COND } from "./catalog.js";
import { store } from "./store.js";

const CDN_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL_ID = "Xenova/clip-vit-base-patch32";

export const engine = { ready:false, device:"—", modelName:"CLIP ViT-B/32", catEmb:null, condEmb:null };

let T, tokenizer, textModel, processor, visionModel;

export async function loadEngine({ onStatus = ()=>{}, onProgress = ()=>{} } = {}){
  try{
    onStatus("loading","DOWNLOADING MODEL");
    T = await import(/* @vite-ignore */ CDN_URL);
    const prog = p=>{ if(p.status==="progress"&&p.total){ onProgress(Math.round(p.loaded/p.total*100)); } };
    let opts = {progress_callback:prog};
    try{ // try WebGPU, fall back to WASM
      if(navigator.gpu){ opts.device="webgpu"; engine.device="WebGPU"; }
      else engine.device="WASM";
      tokenizer   = await T.AutoTokenizer.from_pretrained(MODEL_ID);
      textModel   = await T.CLIPTextModelWithProjection.from_pretrained(MODEL_ID,opts);
      processor   = await T.AutoProcessor.from_pretrained(MODEL_ID);
      visionModel = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,opts);
    }catch(gpuErr){
      engine.device="WASM";
      opts={progress_callback:prog};
      tokenizer   = await T.AutoTokenizer.from_pretrained(MODEL_ID);
      textModel   = await T.CLIPTextModelWithProjection.from_pretrained(MODEL_ID,opts);
      processor   = await T.AutoProcessor.from_pretrained(MODEL_ID);
      visionModel = await T.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID,opts);
    }
    onStatus("loading","COMPILING CATALOG EMBEDDINGS");
    const cached = store.get("skiply_emb_v1",null);
    if(cached && cached.n===CAT.length){ engine.catEmb=cached.cat; engine.condEmb=cached.cond; }
    else{
      engine.catEmb  = await embedTexts(CAT.map(c=>"a photo of "+c.label));
      engine.condEmb = await embedTexts(COND.map(c=>"a photo of "+c.label));
      store.set("skiply_emb_v1",{n:CAT.length,cat:engine.catEmb,cond:engine.condEmb});
    }
    engine.ready=true;
    onStatus("ready","ENGINE READY · ON-DEVICE · "+engine.device.toUpperCase());
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
