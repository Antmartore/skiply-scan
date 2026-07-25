/* =====================================================================
   Scan telemetry: IndexedDB-backed scan log with captured frames as JPEG
   blobs, exportable as a zip (JSON + CSV + images) — corrections become
   a real training set, not just rows in localStorage.
   ===================================================================== */

const DB_NAME = "skiply";
const STORE = "scans";
let dbPromise = null;

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej)=>{
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, {keyPath:"id", autoIncrement:true});
    };
    req.onsuccess = ()=>res(req.result);
    req.onerror = ()=>rej(req.error);
  });
  return dbPromise;
}

function tx(mode, fn){
  return openDB().then(db=>new Promise((res, rej)=>{
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = ()=>res(req?.result);
    t.onerror = ()=>rej(t.error);
    t.onabort = ()=>rej(t.error);
  }));
}

export const addScan   = rec => tx("readwrite", s=>s.add(rec));
export const allScans  = ()  => tx("readonly",  s=>s.getAll());
export const clearScans= ()  => tx("readwrite", s=>s.clear());

export async function scanCounts(){
  const rows = await allScans();
  return { scans: rows.length, fixes: rows.filter(r=>r.fix).length };
}

/** One-time import of pre-M4 localStorage logs (no frames back then). */
export async function migrateFromLocalStorage(){
  let legacy = null;
  try{ legacy = JSON.parse(localStorage.getItem("skiply_scans")); }catch(e){}
  if(Array.isArray(legacy) && legacy.length){
    for(const l of legacy)
      await addScan({ts:l.ts, src:l.src, pred:l.pred, predScore:l.predScore,
                     fix:l.fix||null, frames:[], legacy:true});
  }
  if(legacy!==null) localStorage.removeItem("skiply_scans");
}

/* ---------- batch export: zip of scans.json + scans.csv + frames/ ---------- */

const csvEsc = v => v==null ? "" : /[",\n]/.test(String(v)) ? '"'+String(v).replace(/"/g,'""')+'"' : String(v);

export function recordsToCsv(rows, frameName){
  const head = "id,ts,source,predicted,pred_score,confidence,grade,value_lo,value_hi,route,colorway,year,model,device,corrected_model,corrected_score,frames";
  const lines = rows.map(r=>{
    const files = (r.frames||[]).map((f,i)=>frameName(r,f,i)).join(";");
    return [r.id, new Date(r.ts).toISOString(), r.src, r.pred, r.predScore,
            r.conf, r.grade, r.valueLo, r.valueHi, r.route, r.colorway, r.year,
            r.model, r.device, r.fix?.model, r.fix?.score, files].map(csvEsc).join(",");
  });
  return head+"\n"+lines.join("\n");
}

/** Build the training-set zip from records. Blob-frame agnostic so it can
    be unit-tested in node (frames' blobs only need .arrayBuffer()). */
export async function buildTrainingZip(rows, type="blob"){
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const frameName = (r,f,i)=>`frames/scan-${r.id}-${f.angle||("f"+i)}.jpg`;

  const meta = rows.map(r=>({ ...r, frames:(r.frames||[]).map((f,i)=>frameName(r,f,i)) }));
  zip.file("scans.json", JSON.stringify(meta, null, 1));
  zip.file("scans.csv", recordsToCsv(rows, frameName));
  for(const r of rows)
    for(let i=0;i<(r.frames||[]).length;i++)
      zip.file(frameName(r, r.frames[i], i), await r.frames[i].blob.arrayBuffer());
  return zip.generateAsync({type, compression:"DEFLATE", compressionOptions:{level:6}});
}

export async function exportTrainingZip(){
  const rows = await allScans();
  if(!rows.length) return null;
  return buildTrainingZip(rows);
}
