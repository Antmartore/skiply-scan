/* ---------- routing (spec §6 decision tree) ---------- */
export function route(item, grade, score, val, flag){
  const R = (name, why)=>({name, why});
  const resale = R("RESALE", `High demand, ${grade==="A"?"excellent":"strong"} condition. List via StockX/eBay-style channel.`);
  const repair = R("REPAIR", `${item.rep?"Welted/durable construction — rebuildable.":"Repairable."} Route to NuShoe for resole & recondition, then resale.`);
  const donate = R("DONATE", "Wearable with low resale value. Route to Soles4Souls / Goodwill intake.");
  const recycle= R("RECYCLE", "Not wearable or repairable. Route to material recovery.");
  if(flag) return {main:recycle, alt:donate, note:"Damage/mold flag — quarantine from recondition stream."};
  if(item.rep && item.msrp>=150 && (grade==="C" || (grade==="B" && score<74)))
      return {main:repair, alt: val.est>=30?resale:donate};
  if((grade==="A"||grade==="B") && val.est>=30) return {main:resale, alt: item.rep?repair:donate};
  if(grade==="D") return {main:recycle, alt:donate};
  if(val.est>=15 && grade==="B") return {main:resale, alt:donate};
  return {main:donate, alt: val.est>=15?resale:recycle};
}
