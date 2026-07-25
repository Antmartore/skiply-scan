/* =====================================================================
   Routing (spec §6 decision tree). Partners, thresholds, market factor
   and geography live in public/routing.json so NuShoe/Soles4Souls/
   Goodwill rules are editable without code; these built-in defaults
   mirror it exactly and apply when the file is missing or invalid.
   ===================================================================== */

export const DEFAULT_ROUTING = {
  format: "skiply-routing/1",
  source: "built-in defaults",
  updated: null,
  geography: { region: "US" },
  market_factor: 1.0,
  thresholds: {
    resale_min_value: 30,     // A/B grade needs this est. value to list
    resale_min_value_b: 15,   // B grade floor on the fallback branch
    repair_min_msrp: 150,     // repairables under this aren't worth a resole
    repair_b_score_below: 74, // B grade scoring below this → repair first
  },
  channels: {
    RESALE:  { partners: [{name:"StockX-style marketplace"},{name:"eBay"}] },
    REPAIR:  { partners: [{name:"NuShoe", location:"San Diego, CA"}] },
    DONATE:  { partners: [{name:"Soles4Souls"},{name:"Goodwill"}] },
    RECYCLE: { partners: [{name:"Material recovery"}] },
  },
};

let active = DEFAULT_ROUTING;
export function activeRouting(){ return active; }

export async function loadRoutingConfig(url){
  try{
    const res = await fetch(url, {cache:"no-cache"});
    if(!res.ok) return active;
    const json = await res.json();
    if(json?.format!=="skiply-routing/1" || !json.channels || !json.thresholds){
      console.warn("routing.json invalid — using built-in defaults");
      return active;
    }
    active = {
      ...DEFAULT_ROUTING,
      ...json,
      source: "routing.json",
      thresholds: { ...DEFAULT_ROUTING.thresholds, ...json.thresholds },
      channels: { ...DEFAULT_ROUTING.channels, ...json.channels },
    };
  }catch(e){ /* offline first hit or bad JSON — defaults stand */ }
  return active;
}

const names = ch => (ch?.partners||[]).map(p=>p.name).join(" / ");

export function route(item, grade, score, val, flag, cfg=active){
  const t = cfg.thresholds, C = cfg.channels;
  const R = (name, why)=>({name, why});
  const resale = R("RESALE", `High demand, ${grade==="A"?"excellent":"strong"} condition. List via ${names(C.RESALE)||"resale channel"}.`);
  const repair = R("REPAIR", `${item.rep?"Welted/durable construction — rebuildable.":"Repairable."} Route to ${names(C.REPAIR)||"repair partner"} for resole & recondition, then resale.`);
  const donate = R("DONATE", `Wearable with low resale value. Route to ${names(C.DONATE)||"donation partner"} intake.`);
  const recycle= R("RECYCLE", `Not wearable or repairable. Route to ${names(C.RECYCLE)||"material recovery"}.`);
  if(flag) return {main:recycle, alt:donate, note:"Damage/mold flag — quarantine from recondition stream."};
  if(item.rep && item.msrp>=t.repair_min_msrp && (grade==="C" || (grade==="B" && score<t.repair_b_score_below)))
      return {main:repair, alt: val.est>=t.resale_min_value?resale:donate};
  if((grade==="A"||grade==="B") && val.est>=t.resale_min_value) return {main:resale, alt: item.rep?repair:donate};
  if(grade==="D") return {main:recycle, alt:donate};
  if(val.est>=t.resale_min_value_b && grade==="B") return {main:resale, alt:donate};
  return {main:donate, alt: val.est>=t.resale_min_value_b?resale:recycle};
}
