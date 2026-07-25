/* =====================================================================
   Passcode gate for client pilots (?gated=1). Fully static: codes.json
   ships salted PBKDF2 hashes (scripts/gen_codes.py); the entered code is
   hashed locally and compared. Redeeming before expiry unlocks a timed
   session; single-use is enforced per device via localStorage.
   ===================================================================== */
import { store } from "./store.js";

export function gateEnabled(){
  return new URLSearchParams(location.search).get("gated")==="1";
}

/** Normalize human input: uppercase, strip separators, fix confusables. */
export function normalizeCode(s){
  return String(s||"").toUpperCase().replace(/[\s\-]/g,"")
    .replace(/O/g,"0").replace(/[IL]/g,"1").replace(/U/g,"V");
}

async function pbkdf2b64(code, saltB64, iterations, subtle){
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), c=>c.charCodeAt(0));
  const key = await subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations}, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

/**
 * Check `input` against a codes.json doc. Pure of DOM/storage so it's
 * node-testable. Returns the matched entry or null.
 */
export async function verifyCode(input, doc, {now=Date.now(), usedIds=[], subtle=crypto.subtle}={}){
  if(doc?.format!=="skiply-codes/1" || !Array.isArray(doc.codes)) return null;
  const code = normalizeCode(input);
  if(code.length!==6) return null;
  for(const entry of doc.codes){
    if(entry.expires_at<=now || usedIds.includes(entry.id)) continue;
    if(await pbkdf2b64(code, entry.salt, doc.iterations, subtle)===entry.hash) return entry;
  }
  return null;
}

/* ---------- UI wiring ---------- */
export async function initGate(){
  if(!gateEnabled()) return;
  const sess = store.get("skiply_gate_session", null);
  if(sess && sess.until>Date.now()) return;           // still unlocked

  const el = document.getElementById("sGate");
  const input = document.getElementById("gateCode");
  const msg = document.getElementById("gateMsg");
  el.classList.add("on");
  input.focus();

  let doc = null;
  try{
    const res = await fetch(import.meta.env.BASE_URL+"codes.json", {cache:"no-cache"});
    if(res.ok) doc = await res.json();
  }catch(e){}
  if(!doc){ msg.textContent = "NO ACTIVE CODES — CONTACT SKIPLY"; }

  async function attempt(){
    if(!doc) return;
    msg.textContent = "CHECKING…";
    const used = store.get("skiply_gate_used", []);
    const entry = await verifyCode(input.value, doc, {usedIds:used});
    if(entry){
      store.set("skiply_gate_used", [...used, entry.id]);
      store.set("skiply_gate_session", {until: Date.now()+ (doc.session_minutes||60)*60*1000, id: entry.id});
      el.classList.remove("on");
    }else{
      msg.textContent = "INVALID, EXPIRED OR USED CODE";
      el.querySelector(".gatebox").classList.remove("shake");
      void el.querySelector(".gatebox").offsetWidth;    // restart animation
      el.querySelector(".gatebox").classList.add("shake");
      input.select();
    }
  }
  document.getElementById("gateGo").onclick = attempt;
  input.onkeydown = e=>{ if(e.key==="Enter") attempt(); };
  input.oninput = ()=>{ msg.textContent = doc?"":"NO ACTIVE CODES — CONTACT SKIPLY"; };
}
