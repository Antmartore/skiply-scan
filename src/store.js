export const store={
  get(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d} },
  set(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){} }
};
