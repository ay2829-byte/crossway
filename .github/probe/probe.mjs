// check the new Microsoft, Apple and Netflix readers return real roles
const m=await import("../../fetch-jobs.mjs");const OUT=[];
for(const [n,f] of [["Microsoft",()=>m.microsoftPcsx()]]){const t=Date.now();try{const r=await f();OUT.push(`${n}: ${r.length} roles in ${Math.round((Date.now()-t)/1000)}s, e.g. ${r.slice(0,2).map(x=>x.t+" @ "+x.loc).join(" ; ")}`)}catch(e){OUT.push(n+" error "+e.message)}}
for(const s of OUT)console.log("::notice title=p3::"+s.replace(/::/g,": :"));
