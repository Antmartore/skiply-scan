/* =====================================================================
   Reference image embedding DB (Stage 2): scans match against real
   product photo embeddings instead of text prompts. Built offline by
   scripts/build_reference_db.py → public/refdb.json.
   Pure decode/match logic — no DOM, unit-testable in node.
   ===================================================================== */

/** Fetch refdb.json if deployed; null when absent (text zero-shot mode). */
export async function fetchRefdb(url){
  try{
    const res = await fetch(url, {cache:"no-cache"});
    if(!res.ok) return null;
    const json = await res.json();
    if(json?.format !== "skiply-refdb/1" || !Array.isArray(json.vectors) || !json.vectors.length) return null;
    return json;
  }catch(e){ return null; }
}

/** Decode base64 int8 vectors → normalized Float32Array matrix. */
export function decodeRefdb(json, b64decode){
  const fromB64 = b64decode || (s=>Uint8Array.from(atob(s), c=>c.charCodeAt(0)));
  const n = json.vectors.length, dim = json.dim;
  const vecs = new Float32Array(n*dim);
  const prodOf = new Int32Array(n);
  json.vectors.forEach((v,i)=>{
    const u8 = fromB64(v.e);
    const q = new Int8Array(u8.buffer, u8.byteOffset, dim);
    let ss = 0;
    const off = i*dim;
    for(let d=0; d<dim; d++){ const x = q[d]*v.s; vecs[off+d]=x; ss += x*x; }
    const inv = 1/(Math.sqrt(ss)||1);
    for(let d=0; d<dim; d++) vecs[off+d] *= inv;
    prodOf[i] = v.p;
  });
  return {
    model: json.model,
    browserModelId: json.browser_model_id,
    dim, n,
    products: json.products,
    vecs, prodOf,
  };
}

/**
 * Match a scan embedding against every reference image; aggregate to the
 * best similarity per product (nearest reference photo wins).
 * Returns [{pi, product, sim}] sorted by sim desc.
 */
export function matchRefdb(db, emb){
  const best = new Float32Array(db.products.length).fill(-2);
  const {vecs, prodOf, dim, n} = db;
  for(let i=0; i<n; i++){
    let s = 0; const off = i*dim;
    for(let d=0; d<dim; d++) s += vecs[off+d]*emb[d];
    if(s > best[prodOf[i]]) best[prodOf[i]] = s;
  }
  return Array.from(best)
    .map((sim,pi)=>({pi, product:db.products[pi], sim}))
    .filter(x=>x.sim>-2)
    .sort((a,b)=>b.sim-a.sim);
}
