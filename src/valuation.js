/* ---------- valuation (spec §6): Est = MSRP × GradeFactor × Demand × Market ---------- */
export function gradeFactor(s){
  if(s>=85) return .55 + (s-85)/15*.20;      // A: .55–.75
  if(s>=65) return .40 + (s-65)/19*.15;      // B: .40–.55
  if(s>=35) return .15 + (s-35)/29*.20;      // C: .15–.35
  return (s/34)*.10;                          // D: 0–.10
}

export function valuate(item, score){
  const est = item.msrp * gradeFactor(score) * item.demand * 1.0;
  return {lo:Math.max(0,Math.round(est*.88)), hi:Math.round(est*1.12), est:Math.round(est)};
}
