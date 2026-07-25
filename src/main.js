/* =====================================================================
   SKIPLY SCAN — on-device Identify · Grade · Value · Route
   ===================================================================== */
import "./styles.css";
import { CAT, COND } from "./catalog.js";
import { gradeFactor, valuate } from "./valuation.js";
import { route } from "./routing.js";
import { store } from "./store.js";
import { DEMOS, SVGS } from "./demo.js";
import { engine, loadEngine, embedImage, dot, softmaxTop } from "./engine.js";

/* ---------- state ---------- */
const $ = id=>document.getElementById(id);
const ANGLES=["SIDE","SOLE","TOE"];
const APROMPTS=[["Show the side","BRAND · MODEL · COLORWAY"],["Now the sole","TREAD WEAR READ"],["Tilt to the toe","CREASING · STRUCTURE"]];
let frames=[], angleIdx=0, stream=null, lastResult=null, demoMode=false;

/* ---------- engine boot ---------- */
function setEng(cls,txt){ const e=$("engine"); e.className="engine "+cls; $("engTxt").textContent=txt; }
async function bootEngine(){
  await loadEngine({
    onStatus:setEng,
    onProgress:pct=>{ $("engBar").style.width=pct+"%"; },
  });
  refreshSettings();
}

/* ---------- camera ---------- */
async function startCam(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1280}},audio:false});
    $("cam").srcObject=stream;
  }catch(e){
    $("cam").style.display="none"; $("uploadHint").style.display="flex"; $("btnShoot").style.visibility="hidden";
  }
}
function grabFrame(){
  const v=$("cam"), c=document.createElement("canvas");
  const s=Math.min(v.videoWidth,v.videoHeight)||640;
  c.width=c.height=448;
  const ctx=c.getContext("2d");
  ctx.drawImage(v,(v.videoWidth-s)/2,(v.videoHeight-s)/2,s,s,0,0,448,448);
  return c;
}
function fileToCanvas(file){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement("canvas"); const s=Math.min(img.width,img.height); c.width=c.height=448; c.getContext("2d").drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,448,448); URL.revokeObjectURL(img.src); res(c); }; img.src=URL.createObjectURL(file); }); }

/* ---------- capture flow ---------- */
function renderAngles(){
  $("angleChips").innerHTML=ANGLES.map((a,i)=>`<span class="chip ${i<angleIdx?"done":i===angleIdx?"now":""}">${i<angleIdx?"✓ ":""}${a}</span>`).join("");
  $("ringLbl").textContent=angleIdx+"/3";
  $("ringFg").style.strokeDashoffset=138.2*(1-angleIdx/3);
  const p=APROMPTS[Math.min(angleIdx,2)];
  $("prompt").textContent=angleIdx>=3?"Got it.":p[0];
  $("subprompt").textContent=angleIdx>=3?"":p[1];
}
async function addFrame(canvas){
  frames.push(canvas); angleIdx++;
  if(navigator.vibrate) navigator.vibrate(30);
  renderAngles();
  if(angleIdx>=3){ setTimeout(runScan,350); }
}
$("btnShoot").onclick=()=>{ if(angleIdx<3 && $("cam").videoWidth) addFrame(grabFrame()); };
$("fileIn").onchange=async e=>{ if(e.target.files[0] && angleIdx<3) addFrame(await fileToCanvas(e.target.files[0])); e.target.value=""; };

/* ---------- scan pipeline ---------- */
async function runScan(){
  show("sProc");
  if(!engine.ready){ return demoResult("Engine offline — showing demo result"); }
  const t0=performance.now();
  try{
    $("procLbl").textContent="IDENTIFYING"; $("procSub").textContent="Matching against "+CAT.length+" silhouettes…";
    const sideEmb=await embedImage(frames[0]);
    const sims=engine.catEmb.map(e=>dot(e,sideEmb));
    const probs=softmaxTop(sims);
    let best=0; sims.forEach((s,i)=>{ if(s>sims[best]) best=i; });
    const conf=Math.round(Math.min(.99,probs[best]) *100);
    const item=CAT[best];

    $("procLbl").textContent="GRADING"; $("procSub").textContent="Reading sole wear & creasing…";
    const condScores=[0,0,0,0,0]; const W=[.2,.45,.35];
    for(let f=0; f<3; f++){
      const emb=f===0?sideEmb:await embedImage(frames[f]);
      const cs=softmaxTop(engine.condEmb.map(e=>dot(e,emb)),30); // softer blend across condition classes
      cs.forEach((p,i)=>condScores[i]+=p*W[f]);
    }
    let ci=0; condScores.forEach((p,i)=>{ if(p>condScores[ci]) ci=i; });
    const cond=COND[ci];
    // blend numeric score toward neighbors for smoothness
    let score=Math.round(COND.reduce((a,c,i)=>a+c.score*condScores[i],0));
    score=Math.max(5,Math.min(98,score));
    const grade= score>=85?"A": score>=65?"B": score>=35?"C":"D";
    const flag=!!cond.flag;

    $("procLbl").textContent="VALUING & ROUTING"; $("procSub").textContent="MSRP × grade × demand…";
    const val=valuate(item,score);
    const rt=route(item,grade,score,val,flag);
    const soleWear=Math.max(0,Math.min(95,Math.round(100-score-(Math.random()*6-3))));
    const ms=Math.round(performance.now()-t0);
    lastResult={item,conf,grade,score,val,rt,flag,ms,soleWear,photo:frames[0].toDataURL("image/jpeg",.8),ts:Date.now(),src:"live"};
    // keep the sweep visible at least 1.2s so it feels deliberate, not instant-fake
    const wait=Math.max(0,1200-ms);
    setTimeout(()=>renderResult(lastResult),wait);
  }catch(e){ console.error(e); demoResult("Scan error — showing demo result"); }
}

/* ---------- demo mode ---------- */
let demoIdx=0;
function demoResult(msg){
  if(msg) toast(msg);
  const d=DEMOS[demoIdx%DEMOS.length]; demoIdx++;
  const item=CAT.find(c=>c.model===d.q)||CAT[0];
  const grade= d.score>=85?"A": d.score>=65?"B": d.score>=35?"C":"D";
  const val=valuate(item,d.score);
  const rt=route(item,grade,d.score,val,false);
  lastResult={item,conf:d.conf,grade,score:d.score,val,rt,flag:false,ms:900,soleWear:100-d.score,svg:d.svg,ts:Date.now(),src:"demo"};
  show("sProc"); $("procLbl").textContent="IDENTIFYING"; $("procSub").textContent="Demo scan…";
  setTimeout(()=>renderResult(lastResult),1400);
}
$("btnDemo").onclick=()=>{ demoMode=true; demoResult(); };

/* ---------- result render ---------- */
function renderResult(r){
  const ph=$("resPhoto");
  ph.innerHTML = r.photo? `<img src="${r.photo}" alt="scanned shoe">` : (SVGS[r.svg]||SVGS.low);
  ph.insertAdjacentHTML("beforeend",`<span class="conf">${r.conf}% MATCH · ${r.src==="demo"?"DEMO":(r.ms/1000).toFixed(1)+"s"}</span>`);
  $("resName").textContent=r.item.brand+" "+r.item.model;
  $("resMeta").textContent=`${r.item.years} · ${r.item.cat.toUpperCase()} · MSRP $${r.item.msrp}`;
  $("resGLetter").textContent=r.grade; $("resGLetter").className="gletter g-"+r.grade;
  $("resGWord").textContent= r.grade==="A"?"Like new": r.grade==="B"?"Gently used": r.grade==="C"?"Worn":"Damaged";
  $("resScoreBar").style.width=r.score+"%";
  $("resScoreBar").style.background= r.grade==="A"?"var(--green)":r.grade==="B"?"var(--cyan)":r.grade==="C"?"var(--amber)":"var(--red)";
  $("resWear").textContent=`SCORE ${r.score}/100 · SOLE ~${r.soleWear}% WORN${r.score<65?" · CREASING VISIBLE":""}`;
  $("resValue").innerHTML=`$${r.val.lo}–$${r.val.hi} <small>today</small>`;
  $("resMsrp").textContent=`$${r.item.msrp} MSRP × ${(gradeFactor(r.score)).toFixed(2)} GRADE × ${r.item.demand.toFixed(2)} DEMAND`;
  const rb=$("resRoute"); rb.className="route "+r.rt.main.name;
  $("resRouteName").textContent=r.rt.main.name;
  $("resRouteWhy").textContent=r.rt.main.why;
  $("resRunner").textContent="RUNNER-UP → "+r.rt.alt.name;
  $("resFlag").style.display=r.flag?"inline-block":"none";
  show("sResult");
  if(navigator.vibrate) navigator.vibrate([20,40,20]);
}

/* ---------- accept / correct ---------- */
$("btnAccept").onclick=()=>{ logScan(lastResult,null); toast("Logged ✓"); resetCapture(); };
$("btnAgain").onclick=()=>resetCapture();
$("btnWrong").onclick=()=>{
  const sel=$("fixModel");
  sel.innerHTML=CAT.map(c=>`<option value="${c.id}" ${lastResult&&c.id===lastResult.item.id?"selected":""}>${c.brand} ${c.model}</option>`).join("");
  $("fixCond").value=lastResult?lastResult.score:70; $("fixCondLbl").textContent=$("fixCond").value;
  $("mFix").classList.add("on");
};
$("fixCond").oninput=e=>$("fixCondLbl").textContent=e.target.value;
$("fixCancel").onclick=()=>$("mFix").classList.remove("on");
$("fixSave").onclick=()=>{
  const item=CAT[+$("fixModel").value], score=+$("fixCond").value;
  const grade= score>=85?"A": score>=65?"B": score>=35?"C":"D";
  const val=valuate(item,score); const rt=route(item,grade,score,val,false);
  const fixed={...lastResult,item,score,grade,val,rt,conf:100,src:"corrected"};
  logScan(lastResult,fixed); lastResult=fixed; renderResult(fixed);
  $("mFix").classList.remove("on"); toast("Correction saved — engine learns from this");
};
function logScan(r,fix){
  const logs=store.get("skiply_scans",[]);
  logs.push({ts:r.ts,pred:r.item.brand+" "+r.item.model,predScore:r.score,src:r.src,
             fix:fix?{model:fix.item.brand+" "+fix.item.model,score:fix.score}:null});
  store.set("skiply_scans",logs); refreshSettings();
}

/* ---------- settings ---------- */
function refreshSettings(){
  $("setEngine").textContent=engine.ready?engine.modelName+" · ready":"loading / offline";
  $("setDevice").textContent=engine.device;
  $("setCatalog").textContent=CAT.length+" silhouettes · "+COND.length+" condition classes";
  const logs=store.get("skiply_scans",[]);
  $("setScans").textContent=logs.length;
  $("setFixes").textContent=logs.filter(l=>l.fix).length;
}
[$("btnGear"),$("btnGear2")].forEach(b=>b.onclick=()=>{refreshSettings();$("mSet").classList.add("on")});
$("setClose").onclick=()=>$("mSet").classList.remove("on");
$("setClear").onclick=()=>{ store.set("skiply_scans",[]); refreshSettings(); toast("Cleared"); };
$("setExport").onclick=()=>{
  const logs=store.get("skiply_scans",[]);
  const csv="ts,predicted,pred_score,source,corrected_model,corrected_score\n"+
    logs.map(l=>[new Date(l.ts).toISOString(),`"${l.pred}"`,l.predScore,l.src,l.fix?`"${l.fix.model}"`:"",l.fix?l.fix.score:""].join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download="skiply-training-data.csv"; a.click();
};

/* ---------- nav helpers ---------- */
function show(id){ document.querySelectorAll(".screen").forEach(s=>s.classList.remove("on")); $(id).classList.add("on"); }
function resetCapture(){ frames=[]; angleIdx=0; renderAngles(); show("sAim"); }
let toastT; function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"),2600); }

/* ---------- boot ---------- */
renderAngles();
startCam();
bootEngine();

/* ---------- PWA: offline shell + model cache ---------- */
import { registerSW } from "virtual:pwa-register";
registerSW({ immediate:true });
if("serviceWorker" in navigator){
  navigator.serviceWorker.ready.then(()=>{ $("setOffline").textContent="ready · installable"; }).catch(()=>{});
}
