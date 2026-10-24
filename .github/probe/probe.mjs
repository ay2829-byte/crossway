// one off check of career site APIs, prints status and how many jobs each returns
const UA={"User-Agent":"Mozilla/5.0 (compatible; JunctionJobsBot/1.0; +https://crosswayhq.com)","Accept":"application/json"};
async function hit(name,url,opt={}){const t=Date.now();try{const r=await fetch(url,{...opt,headers:{...UA,...(opt.headers||{})},signal:AbortSignal.timeout(60000)});const txt=await r.text();let n="";try{const j=JSON.parse(txt);n=JSON.stringify(Object.keys(j)).slice(0,120)+" "+(j.count??j.total??j.totalRecords??(j.jobs&&j.jobs.length)??(j.positions&&j.positions.length)??(j.data&&j.data.positions&&j.data.positions.length)??(j.res&&j.res.totalRecords)??(j.operationResult&&j.operationResult.result&&j.operationResult.result.totalJobs)??"")}catch{n="html "+txt.length+" "+txt.slice(0,160).replace(/\s+/g," ")}console.log(`${name} | ${r.status} | ${Date.now()-t}ms | ${n}`)}catch(e){console.log(`${name} | ERR ${e.name} ${e.message} | ${Date.now()-t}ms`)}}
const gh=t=>hit("gh "+t,`https://boards-api.greenhouse.io/v1/boards/${t}/jobs`);
await Promise.all([
 hit("ms gcs","https://gcsservices.careers.microsoft.com/search/api/v1/search?l=en_us&pg=1&pgSz=20&o=Recent&flt=true"),
 hit("ms ef v2","https://apply.careers.microsoft.com/api/apply/v2/jobs?domain=microsoft.com&start=0&num=10"),
 hit("ms pcsx","https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=&start=0&num=10"),
 hit("ms jobs.careers","https://jobs.careers.microsoft.com/global/en/search?l=en_us&pg=1"),
 hit("netflix ef","https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&start=0&num=10"),
 hit("netflix pcsx","https://explore.jobs.netflix.net/api/pcsx/search?domain=netflix.com&query=&location=&start=0&num=10"),
 hit("amex ef","https://aexp.eightfold.ai/api/apply/v2/jobs?domain=aexp.com&start=0&num=10"),
 hit("apple csrf","https://jobs.apple.com/api/csrfToken"),
 hit("apple v1 search","https://jobs.apple.com/api/v1/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:"",filters:{},page:1,locale:"en-us",sort:"newest"})}),
 hit("apple role search","https://jobs.apple.com/api/role/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:"",filters:{range:{standardWeeklyHours:{start:null,end:null}}},page:1,locale:"en-us",sort:"newest"})}),
 hit("apple html","https://jobs.apple.com/en-us/search?page=1",{headers:{Accept:"text/html"}}),
 hit("meta html","https://www.metacareers.com/jobs",{headers:{Accept:"text/html"}}),
 hit("google html","https://www.google.com/about/careers/applications/jobs/results?page=1",{headers:{Accept:"text/html"}}),
 gh("stripe"),gh("pinterest"),gh("databricks"),gh("airbnb"),gh("figma"),gh("instacart"),gh("waymo"),gh("mongodb"),gh("hubspotjobs"),gh("hubspot"),gh("shopify"),gh("cisco"),gh("dropbox"),gh("atlassian"),
 hit("lv shopify","https://api.lever.co/v0/postings/shopify?mode=json"),hit("as shopify","https://api.ashbyhq.com/posting-api/job-board/shopify"),
 hit("wd cisco","https://cisco.wd5.myworkdayjobs.com/wday/cxs/cisco/Cisco_Careers/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appliedFacets:{},limit:20,offset:0,searchText:""})}),
 hit("wd intuit","https://intuit.wd1.myworkdayjobs.com/wday/cxs/intuit/Intuit/jobs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appliedFacets:{},limit:20,offset:0,searchText:""})}),
 hit("ibm","https://www-api.ibm.com/search/api/v2",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appId:"careers",scopes:["careers2"],query:{bool:{must:[]}},size:10,from:0,_source:["_id","title","url"]})}),
 hit("sr atlassian","https://api.smartrecruiters.com/v1/companies/Atlassian/postings?limit=10"),
 hit("lv atlassian","https://api.lever.co/v0/postings/atlassian?mode=json"),
]);
