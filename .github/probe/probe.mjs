const OUT=[];const u="https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=&num=10&start=0";
for(const h of [{"User-Agent":"Mozilla/5.0 (compatible; JunctionJobsBot/1.0; +https://crosswayhq.com)","Accept":"application/json"},{"User-Agent":"JunctionJobsBot/1.0 (+https://crosswayhq.com)","Accept":"application/json"}]){try{const r=await fetch(u,{headers:h});const t=await r.text();OUT.push(r.status+" "+h["User-Agent"].slice(0,20)+" "+t.slice(0,200))}catch(e){OUT.push("err "+e.message)}}
const m=await import("../../fetch-jobs.mjs");const r=await m.microsoftPcsx();OUT.push("reader "+r.length);
for(const s of OUT)console.log("::notice title=p4::"+s.replace(/::/g,": :"));
