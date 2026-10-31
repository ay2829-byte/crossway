// Pulls open roles for Junction from public sources and writes jobs/index.json plus description shards.
// Sources: company boards on Greenhouse, Lever, Ashby, SmartRecruiters and Workday (thousands, auto discovered),
// Simplify's open new grad and internship lists, The Muse, Arbeitnow, Himalayas, Remotive, Jobicy,
// and Adzuna when ADZUNA_APP_ID and ADZUNA_APP_KEY are set. Runs every few hours in GitHub Actions. Node 20+, no packages.
import {writeFileSync,readFileSync,existsSync,mkdirSync,readdirSync,unlinkSync,rmSync} from "node:fs";
import {GH,LV,AS,SR,WD,WD_NAMES,OC,NAMES,DOMAINS} from "./companies.mjs";

const UA={"User-Agent":"JunctionJobsBot/1.0 (+https://crosswayhq.com)","Accept":"application/json"};
const MAX_JOBS=+(process.env.MAX_JOBS||180000),PER_CO=+(process.env.PER_CO||250),BRAND_CO=+(process.env.BRAND_CO||5000),SNIP=320,SHARD=1000,OUT=process.env.OUT||"jobs";
const DEADLINE=Date.now()+60000*+(process.env.FETCH_MINUTES||34),WD_CAP=+(process.env.WD_CAP||2000);
export const FAMS=["eng","product","data","design","growth","sales","ops","other"];
const uniq=a=>[...new Set(a.filter(t=>t&&/^[\w.-]+$/.test(t)))];

async function getJSON(url,opt={},ms=25000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{...opt,headers:{...UA,...(opt.headers||{})},signal:c.signal});if(!r.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(t)}}
async function pool(items,n,fn,dl=DEADLINE){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length&&Date.now()<dl){const k=i++;try{out[k]=await fn(items[k])}catch{out[k]=null}}}));return out}

/* ---------- text helpers ---------- */
const ENT={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"',ndash:"–",mdash:"—",hellip:"…",bull:"•"};
const decode=s=>String(s||"").replace(/&(#x?[0-9a-f]+|\w+);/gi,(m,e)=>e[0]==="#"?String.fromCodePoint(e[1].toLowerCase()==="x"?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(ENT[e.toLowerCase()]??m));
const strip=h=>decode(decode(String(h||"")).replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi," . ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").replace(/( \.)+/g,".").replace(/ ([,.;:!?])/g,"$1").replace(/\.{2,}/g,".").replace(/^\. ?/,"").trim();
const snippet=t=>{t=t.replace(/^\W+/,"");if(t.length<=SNIP)return t;const c=t.slice(0,SNIP);return c.slice(0,Math.max(c.lastIndexOf(" "),SNIP-40))+"…"};
const ATS=/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com|jobvite\.com|icims\.com|bamboohr\.com|recruitee\.com|breezy\.hr|gem\.com|rippling-ats\.com|rippling\.com|oraclecloud\.com|simplify\.jobs|themuse\.com|arbeitnow\.com|himalayas\.app|remotive\.com|jobicy\.com|adzuna\.[a-z.]+|eightfold\.ai|taleo\.net|successfactors\.com)$/i;
export function domainOf(tok,url,co){if(tok in DOMAINS)return DOMAINS[tok];try{const h=new URL(url).hostname.toLowerCase();if(!ATS.test(h))return h.replace(/^(www|careers|jobs|boards|job-boards|apply|work|talent|join)\./,"")}catch{}if(tok&&/^[a-z0-9]+$/i.test(tok)&&!(tok in DISC))return tok.toLowerCase()+".com";return nameDom(co)}
export const cleanCo=co=>String(co||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\(.*?\)/g," ").replace(/[-_](jobs|careers|english|us|usa|global)\b/gi," ").replace(/\b(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|plc|gmbh|ag|sa|se|nv|bv|ab|as|oy|spa|s\.a|s\.p\.a|pty|pvt|private|group|holdings?|technologies|technology|company|industries|international|jobs|careers|usa|us|global|worldwide|enterprises?)\b\.?/gi," ").replace(/\s+/g," ").trim()||String(co||"");
const nameDom=co=>{const k=cleanCo(co).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"");return k?"?"+k+".com":""}
const DISC={};
const pretty=t=>NAMES[t]??DISC[t]??t.replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());

/* ---------- classification ---------- */
export function family(title,dept){const t=(title+" ").toLowerCase(),d=(dept||"").toLowerCase();
  if(/\b(sales|solutions?) engineer|account (executive|manager|director)|business development|\b[bs]dr\b|sales\b|customer success|partnerships?\b|revenue\b(?! operations)/.test(t))return"sales";
  if(/design engineer/.test(t))return"eng";
  if(/\bdesign|\bux\b|\bui\b|user research|ux research|illustrat|creative director|brand designer|motion/.test(t))return"design";
  if(/data scien|data analy|data engineer|analytics|machine learning|\bml\b|\bai\b (engineer|scientist|research)|research scientist|statistic|business intelligence|\bbi\b|quantitative|\bquant\b|insights/.test(t))return"data";
  if(/product manag|\bpm\b|product owner|product lead|head of product|vp,? product|product director|director,? product|\bapm\b|product strateg|product ops|product operations|group product/.test(t))return"product";
  if(/engineer|developer|software|\bswe\b|\bsre\b|devops|infrastructure|security|platform|front ?end|back ?end|full ?stack|mobile|\bios\b|android|firmware|hardware|architect|\bqa\b|test|technical program|\bcto\b|it support|systems admin|network/.test(t))return"eng";
  if(/market|growth|\bseo\b|content|brand|communications|social media|demand gen|lifecycle|community|\bpr\b|copywrit|editor|writer|journalis|influencer|events?\b/.test(t))return"growth";
  if(/operations|\bops\b|strategy|finance|financial|accountant|accounting|controller|legal|counsel|attorney|paralegal|recruit|people|\bhr\b|human resources|talent|support|program manag|project manag|business analyst|chief of staff|supply|logistics|procurement|office|executive assistant|payroll|tax|audit|risk|compliance|fp&a|treasury|customer (service|experience)|implementation|onboarding|consultant/.test(t))return"ops";
  if(/\banalyst\b/.test(t))return"data";
  if(/engineering/.test(d))return"eng";if(/product/.test(d))return"product";if(/data|analytics/.test(d))return"data";if(/design/.test(d))return"design";if(/marketing|growth/.test(d))return"growth";if(/sales|revenue/.test(d))return"sales";
  if(/ops|operations|finance|people|legal|support|g&a/.test(d))return"ops";return"other"}
export function level(title){const t=" "+title.toLowerCase()+" ";
  if(/intern\b|internship|co-?op\b|apprentice|summer (analyst|associate)|working student/.test(t))return"intern";
  if(/new grad|graduate|entry[ -]level|\bentry\b|junior|\bjr\.?\b|early career|university|campus|\bassociate\b(?! (director|manager|general|vp|vice|principal|partner))|\b(engineer|developer|analyst|scientist|designer|specialist|representative|coordinator|accountant|technician|consultant),? (i|1)\b|\bassociate (engineer|developer|analyst|scientist|designer|consultant|product)|\bi\s*$|\blevel 1\b|\bl1\b|\bl2\b|rotational|fellow|trainee/.test(t))return"entry";
  if(/senior|\bsr\.?\b|staff|principal|\blead\b|head of|director|\bvp\b|vice president|chief|distinguished|\biii\b|\biv\b|\bl5\b|\bl6\b|\bl7\b|architect|(engineering|design|data science|analytics) manager|manager,? (engineering|design|sales)|managing|partner\b|expert/.test(t))return"senior";
  return"mid"}
export function workplace(loc,hint){const l=(loc||"").toLowerCase(),h=(hint||"").toLowerCase();
  if(/remote/.test(h))return"remote";if(/hybrid/.test(h))return"hybrid";if(/on-?site/.test(h))return"onsite";
  if(/remote|anywhere|distributed|work from home|\bwfh\b/.test(l))return"remote";if(/hybrid/.test(l))return"hybrid";return"onsite"}
const SK=["SQL","Python","Java","JavaScript","TypeScript","React","Node.js","Go","C++","C#","Rust","Ruby","Kotlin","Swift","Scala","AWS","GCP","Azure","Kubernetes","Docker","Terraform","Git","APIs","System design","Spark","Airflow","dbt","Snowflake","BigQuery","Databricks","Tableau","Looker","Power BI","Excel","A/B testing","Amplitude","Mixpanel","Figma","Jira","PRDs","User research","Roadmapping","Product analytics","Machine learning","PyTorch","TensorFlow","LLMs","Statistics","R","Salesforce","HubSpot","SEO","Paid acquisition","Lifecycle marketing","Financial modeling","GTM strategy","Pricing","Process design","Marketo","Google Analytics","Next.js","GraphQL","PostgreSQL","Kafka","Linux"];
const SKRE=SK.map(s=>[s,new RegExp("(^|[^a-z0-9+#])("+({"A/B testing":"a\\/b test(s|ing)?|ab test(s|ing)?|experimentation","Node.js":"node\\.?js","Go":"golang","C++":"c\\+\\+","C#":"c#","R":"r programming|in r\\b|r\\/python|python\\/r|r or python|python or r|python, r\\b","APIs":"apis?|rest api","System design":"system design|distributed systems","Machine learning":"machine learning|\\bml\\b","LLMs":"llms?|large language models?|generative ai|genai","Statistics":"statistic(s|al)","PRDs":"prds?|product requirements?( documents?)?","User research":"user research|customer interviews|usability","Roadmapping":"roadmap(s|ping)?","Product analytics":"product analytics","Paid acquisition":"paid (social|search|acquisition|media)|google ads|meta ads|performance marketing","Lifecycle marketing":"lifecycle (marketing|campaigns?)|email marketing|crm marketing","Financial modeling":"financial model(s|ing)?","GTM strategy":"go-to-market|gtm","Pricing":"pricing","Process design":"process (design|improvement)","PostgreSQL":"postgres(ql)?","Power BI":"power ?bi","Google Analytics":"google analytics|ga4","Excel":"excel|spreadsheets","Next.js":"next\\.?js"}[s]||s.toLowerCase().replace(/[.+*?^${}()|[\]\\/]/g,"\\$&"))+")(?![a-z0-9+#])","i")]);
const GO=/(^|[\s,(\/])Go([\s,.)\/]|$)(?! to\b| for\b| from\b| live\b| above\b| beyond\b)/;
const skillsOf=txt=>{const out=[];SKRE.forEach(([s,re],i)=>{if(re.test(txt)||(s==="Go"&&GO.test(txt)))out.push(i)});return out};
const WNUM={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12,fifteen:15};
export function minYears(txt){
  const t=String(txt||"").replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen)\b/gi,w=>WNUM[w.toLowerCase()]).replace(/(\d{1,2})\s*\(\s*\1\s*\)/g,"$1");
  const re=/(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*\d{1,2}\s*)?\+?\s*(?:or more\s+|plus\s+)?(years?|yrs?|yoe)(?:'s|’s|(?<=yrs?)\.)?(?![a-z])([^.;]{0,70})/gi;let m;
  while((m=re.exec(t))){const n=+m[1];const after=m[3]||"",before=t.slice(Math.max(0,m.index-50),m.index);const ctx=before+" | "+after;
    if(n<1||n>15)continue;
    if(/\b(old|age|aged|ago|history|founded|warranty|anniversary|in business|been around|running|of age|tenure with us|we've|we have been|over the (past|last))\b/i.test(ctx))continue;
    if(/experience|exp\b|working|work(ed)? (in|on|with|as)|industry|professional|background|track record|hands.on|relevant|related|proven|building|managing|leading|shipping|owning|in (a|an|the)\b|in [a-z]+ (roles?|management|marketing|sales|engineering|design|analytics|operations)|as an?\b|of\b|post.?grad|full.?time/i.test(after)
      ||/\b(minimum|at least|min\.?|requires?|required|must have|need|over|more than|bring)\b[^\d]{0,25}$/i.test(before)
      ||/^yoe$/i.test(m[2])||/\bexperience\b[^.\d]{0,25}:\s*$/i.test(before))return n}
  return -1}
// bump when the years reader changes, so postings it found nothing in get read again
const YV=2;
// Apple detail pages carry the posting as router data; pull the qualification and description text out of it
export function appleText(s){const K='__staticRouterHydrationData = JSON.parse("';const i=s.indexOf(K);const out=[];
  if(i>=0){const a=i+K.length,b=s.indexOf('");',a);try{const d=JSON.parse(JSON.parse('"'+s.slice(a,b)+'"'));
    const walk=(o,k)=>{if(!o)return;if(typeof o==="string"){if(o.length>40&&/qualif|description|summary|responsib|requirement/i.test(k||""))out.push(o);return}if(typeof o!=="object")return;for(const j in o)walk(o[j],Array.isArray(o)?k:j)};walk(d,"")}catch{}}
  if(out.length)return out.join(" . ");
  const q=["minimumQualifications","keyQualifications","preferredQualifications"].map(k=>{const i=s.indexOf(k);return i<0?"":s.slice(i,i+3000)}).join(" . ");
  return q.trim()?q.replace(/\\n/g," ").replace(/\\u003c/g,"<").replace(/\\u003e/g,">"):""}
export function pay(txt){const m=txt.match(/\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])(?:\.00)?\s*(?:USD)?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])/);
  if(!m)return"";const n=v=>/k/i.test(v)?parseFloat(v)*1000:+v.replace(/,/g,"");const a=n(m[1]),b=n(m[2]);if(a<20000||b<a||b>2e6)return"";const f=v=>"$"+Math.round(v/1000)+"k";return f(a)+" to "+f(b)}

/* ---------- company boards ---------- */
async function greenhouse(tok){let [b,j]=await Promise.all([getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}`),getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}/jobs?content=true`,{},90000)]);
  if(!j||!Array.isArray(j.jobs))j=await getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}/jobs`,{},45000); // big boards: titles only
  if(!j||!Array.isArray(j.jobs))return null;const co=(b&&b.name)||pretty(tok);
  return j.jobs.map(x=>{const txt=strip(x.content);const loc=(x.location&&x.location.name)||"";return{tok,co,t:x.title,loc,dept:(x.departments||[]).map(d=>d.name).join(", "),url:x.absolute_url,at:x.updated_at||x.first_published,txt,wp:""}})}
async function lever(tok){const j=await getJSON(`https://api.lever.co/v0/postings/${tok}?mode=json`);if(!Array.isArray(j))return null;const co=pretty(tok);
  return j.map(x=>{const c=x.categories||{};const txt=(x.descriptionPlain||"")+" "+(x.lists||[]).map(l=>l.text+" "+strip(l.content)).join(" ")+" "+(x.additionalPlain||"");
    const sr=x.salaryRange;const p=sr&&sr.min&&sr.max&&(sr.currency||"USD")==="USD"&&/year|annual/i.test(sr.interval||"year")?"$"+Math.round(sr.min/1000)+"k to $"+Math.round(sr.max/1000)+"k":"";
    return{tok,co,t:x.text,loc:(c.allLocations&&c.allLocations.join(" / "))||c.location||"",dept:[c.department,c.team].filter(Boolean).join(", "),url:x.hostedUrl,at:x.createdAt?new Date(x.createdAt).toISOString():null,txt,wp:x.workplaceType||"",pay:p,lvl:/intern/i.test(c.commitment||"")?"internship":""}})}
async function ashby(tok){const j=await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${tok}?includeCompensation=true`);if(!j||!Array.isArray(j.jobs))return null;const co=pretty(decodeURIComponent(tok));
  return j.jobs.filter(x=>x.isListed!==false).map(x=>{const locs=[x.location,...(x.secondaryLocations||[]).map(s=>s.location)].filter(Boolean);
    const cs=x.compensation&&(x.compensation.scrapeableCompensationSalarySummary||x.compensation.compensationTierSummary)||"";
    return{tok,co,t:x.title,loc:locs.join(" / ")+(x.isRemote&&!/remote/i.test(locs.join(" "))?" (Remote)":""),dept:[x.department,x.team].filter(Boolean).join(", "),url:x.jobUrl,at:x.publishedAt,txt:x.descriptionPlain||strip(x.descriptionHtml),wp:x.workplaceType||(x.isRemote?"remote":""),pay:pay(cs),lvl:/intern/i.test(x.employmentType||"")?"internship":""}})}
async function smart(tok){const out=[];let co=pretty(tok);for(let off=0;off<2000;off+=100){const j=await getJSON(`https://api.smartrecruiters.com/v1/companies/${tok}/postings?limit=100&offset=${off}`);
    if(!j||!Array.isArray(j.content))return off?out:null;j.content.forEach(x=>{const l=x.location||{};if(x.company&&x.company.name)co=x.company.name;
      out.push({tok,co,t:x.name,loc:[l.city,l.region,l.country&&l.country.toUpperCase()].filter(Boolean).join(", ")+(l.remote?" (Remote)":""),dept:(x.department&&x.department.label)||(x.function&&x.function.label)||"",url:`https://jobs.smartrecruiters.com/${tok}/${x.id}`,at:x.releasedDate,txt:"",wp:l.remote?"remote":(l.hybrid?"hybrid":""),lvl:x.experienceLevel&&x.experienceLevel.id,srApi:`https://api.smartrecruiters.com/v1/companies/${tok}/postings/${x.id}`})});
    if(j.content.length<100)break}return out}
// Workday career sites: key is "tenant|wdN|Site"
export function wdAgo(s){s=String(s||"").toLowerCase();if(/today|just/.test(s))return 0;if(/yesterday/.test(s))return 1;const m=s.match(/(\d+)\+?\s*day/);return m?+m[1]:-1}
async function workday(key){const [ten,wd,site]=key.split("|");const host=`https://${ten}.${wd}.myworkdayjobs.com`,api=`${host}/wday/cxs/${ten}/${site}/jobs`;const co=pretty(key);const out=[];let total=Infinity;
  for(let off=0;off<Math.min(total,WD_CAP)&&Date.now()<DEADLINE;off+=20){const j=await getJSON(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appliedFacets:{},limit:20,offset:off,searchText:""})});
    if(!j||!Array.isArray(j.jobPostings))return off?out:null;if(off===0)total=j.total||0;if(!j.jobPostings.length)break;
    for(const x of j.jobPostings){if(!x.title||!x.externalPath)continue;const ago=wdAgo(x.postedOn);
      out.push({co,t:x.title,loc:x.locationsText||"",dept:"",url:host+"/"+site+x.externalPath,wdApi:`${host}/wday/cxs/${ten}/${site}${x.externalPath}`,at:ago>=0?new Date(Date.now()-ago*864e5).toISOString():null,txt:"",wp:/remote/i.test(x.remoteType||"")?"remote":/hybrid/i.test(x.remoteType||"")?"hybrid":""})}}
  return out}

// Oracle Recruiting Cloud career sites: key is "host|site", e.g. "eeho.fa.us2.oraclecloud.com|CX_45001"
async function oracle(key){const [host,site]=key.split("|");const out=[];const co=pretty(key);
  for(let off=0;off<3000&&Date.now()<DEADLINE;off+=100){const j=await getJSON(`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${site},limit=100,offset=${off},sortBy=POSTING_DATES_DESC`);
    const it=j&&Array.isArray(j.items)&&j.items[0];const L=it&&Array.isArray(it.requisitionList)?it.requisitionList:null;if(!L)return off?out:null;
    L.forEach(x=>{const locs=[x.PrimaryLocation,...(x.secondaryLocations||[]).map(l=>l.Name)].filter(Boolean);
      out.push({co,t:x.Title,loc:[...new Set(locs)].slice(0,3).join(" / "),dept:x.JobFamily||x.Organization||"",url:`https://${host}/hcmUI/CandidateExperience/en/sites/${site}/job/${x.Id}`,at:x.PostedDate,txt:strip(x.ShortDescriptionStr||""),ocApi:`https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22${x.Id}%22,siteNumber=${site}`,wp:/remote/i.test(x.WorkplaceType||"")?"remote":/hybrid/i.test(x.WorkplaceType||"")?"hybrid":""})});
    if(L.length<100||(it.TotalJobsCount&&off+100>=it.TotalJobsCount))break}return out}
// Amazon's public job search
async function amazon(){const out=[];for(const [q,pages] of [["country%5B%5D=USA",60],["",30]]){for(let p=0;p<pages&&Date.now()<DEADLINE;p++){const j=await getJSON(`https://www.amazon.jobs/en/search.json?${q}&offset=${p*100}&result_limit=100&sort=recent`);if(!j||!Array.isArray(j.jobs)||!j.jobs.length)break;
    j.jobs.forEach(x=>out.push({co:x.company_name&&!/^amazon/i.test(x.company_name)?x.company_name:"Amazon",tok:"amazon",t:x.title,loc:x.normalized_location||x.location||"",dept:x.job_category||"",url:"https://www.amazon.jobs"+(x.job_path||""),at:x.posted_date,txt:strip((x.basic_qualifications||"")+" "+(x.preferred_qualifications||"")+" "+(x.description_short||"")),wp:/virtual|remote/i.test(x.location||"")?"remote":""}))}}return out}
// Microsoft's public job search
async function microsoft(){const out=[];for(let p=1;p<=150&&Date.now()<DEADLINE;p++){const j=await getJSON(`https://gcsservices.careers.microsoft.com/search/api/v1/search?l=en_us&pg=${p}&pgSz=20&o=Recent&flt=true`);
    const L=j&&j.operationResult&&j.operationResult.result&&j.operationResult.result.jobs;if(!Array.isArray(L)||!L.length)break;
    L.forEach(x=>{const pr=x.properties||{};out.push({co:"Microsoft",tok:"microsoft",t:x.title,loc:(pr.locations||[pr.primaryLocation]).filter(Boolean).slice(0,3).join(" / "),dept:pr.profession||pr.discipline||"",url:`https://jobs.careers.microsoft.com/global/en/job/${x.jobId}`,at:x.postingDate,txt:strip(pr.description||""),wp:/100%|remote/i.test(pr.workSiteFlexibility||"")?"remote":/days/i.test(pr.workSiteFlexibility||"")?"hybrid":"",lvl:/intern/i.test(pr.employmentType||"")?"internship":""})})}return out}


// Eightfold career sites (Microsoft, Netflix, American Express and others): host|domain|name
const EF=[["apply.careers.microsoft.com","microsoft.com","Microsoft"],["explore.jobs.netflix.net","netflix.com","Netflix"],["aexp.eightfold.ai","aexp.com","American Express"],["careers.qualcomm.com","qualcomm.com","Qualcomm"],["jobs.vodafone.com","vodafone.com","Vodafone"]];
async function eightfold([host,dom,name]){const out=[];for(let st=0;st<5000&&Date.now()<DEADLINE;){const j=await getJSON(`https://${host}/api/apply/v2/jobs?domain=${dom}&start=${st}&num=100&sort_by=timestamp`);
    const L=j&&j.positions;if(!Array.isArray(L)||!L.length)break;
    L.forEach(x=>out.push({co:name,tok:dom.split(".")[0],t:x.name,loc:(x.locations&&x.locations.length?x.locations.slice(0,3).join(" / "):x.location)||"",dept:x.department||"",url:x.canonicalPositionUrl||`https://${host}/careers/job/${x.id}`,at:x.t_create?new Date(x.t_create*1000).toISOString():"",txt:strip(x.job_description||""),det:x.job_description?null:{u:`https://${host}/api/apply/v2/jobs/${x.id}?domain=${dom}`,k:"ef"},wp:/remote/i.test(x.work_location_option||"")?"remote":/hybrid/i.test(x.work_location_option||"")?"hybrid":""}));
    st+=L.length;if(L.length<5)break}return out}
// Apple renders its search results into the page, so read them from there
async function apple(){const page=async n=>{const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);const h=await fetch(`https://jobs.apple.com/en-us/search?page=${n}`,{headers:{...UA,Accept:"text/html"},signal:c.signal}).then(r=>r.ok?r.text():"").catch(()=>"");clearTimeout(tm);
    const i=h.indexOf('__staticRouterHydrationData = JSON.parse("');if(i<0)return null;const a=i+'__staticRouterHydrationData = JSON.parse("'.length,b=h.indexOf('");',a);let d;try{d=JSON.parse(JSON.parse('"'+h.slice(a,b)+'"'))}catch{return null}
    let res=null;const walk=o=>{if(res||!o||typeof o!=="object")return;if(Array.isArray(o.searchResults)){res=o;return}for(const k in o)walk(o[k])};walk(d);return res};
  const first=await page(1);if(!first)return[];const total=Math.min(+first.totalRecords||+first.total||0,8000),per=(first.searchResults||[]).length||20,n=total?Math.ceil(total/per):250;const nums=[];for(let p=2;p<=n;p++)nums.push(p);
  const rest=await pool(nums,4,async p=>{const r=await page(p);return r?r.searchResults:[]});
  // Apple Store roles (Specialist, Genius, Creative, store leaders and the always open pipelines) are left out: corporate roles only
  const RETAIL=/\b(specialist|expert|genius|creative|store|retail|market leader|business pro|technical pro|operations pro|apple at work|seasonal|part[ -]time|full[ -]time)\b|^[A-Z]{2,3}\s*[-–]\s/i;
  const corp=x=>!x.managedPipelineRole&&!/^PIPE-/.test(x.reqId||"")&&!/retail|store/i.test((x.team&&(x.team.teamName+" "+(x.team.teamCode||"")))||"")&&!RETAIL.test(x.postingTitle||"");
  return [...first.searchResults,...rest.flat()].filter(corp).map(x=>({co:"Apple",tok:"apple",t:x.postingTitle,loc:(x.locations||[]).map(l=>[l.city,l.stateProvince,l.countryName].filter(Boolean).join(", ")||l.name).slice(0,3).join(" / "),dept:(x.team&&x.team.teamName)||"",url:`https://jobs.apple.com/en-us/details/${x.positionId}/${x.transformedPostingTitle||""}`,at:x.postDateInGMT||"",txt:String(x.jobSummary||"").slice(0,2000),det:{u:`https://jobs.apple.com/en-us/details/${x.positionId}/${x.transformedPostingTitle||""}`,k:"html"},wp:x.homeOffice?"remote":""}))}
// Google careers: the results pages are plain HTML, so read titles and links from them
async function google(){const out=[];for(let p=1;p<=150&&Date.now()<DEADLINE;p++){const c=new AbortController();const tm=setTimeout(()=>c.abort(),25000);
    const h=await fetch(`https://www.google.com/about/careers/applications/jobs/results?page=${p}`,{headers:{...UA,Accept:"text/html"},signal:c.signal}).then(r=>r.ok?r.text():"").catch(()=>"");clearTimeout(tm);
    const ids=[...h.matchAll(/href="jobs\/results\/(\d+)-([a-z0-9-]+)/g)];if(!ids.length)break;const seen=new Set();
    const locs=[...h.matchAll(/<span class="r0wTof[^"]*">([^<]+)<\/span>/g)].map(m=>m[1]);let li=0;
    const seg=id=>{const a=h.indexOf('["'+id+'","');if(a<0)return"";const b=h.slice(a+30).search(/\["\d{15,}","/);return strip(h.slice(a,b<0?a+12000:a+30+b).replace(/\\u003c/g,"<").replace(/\\u003e/g,">").replace(/\\n/g," ").replace(/\\u0026/g,"&")).slice(0,6000)};
    ids.forEach(m=>{if(seen.has(m[1]))return;seen.add(m[1]);const t=m[2].replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase());out.push({co:"Google",tok:"google",t,loc:locs[li++]||"",dept:"",url:`https://www.google.com/about/careers/applications/jobs/results/${m[1]}-${m[2]}`,at:"",txt:seg(m[1]),wp:""})})}console.log(`::notice title=Google::${out.filter(r=>minYears(r.txt)>0).length} of ${out.length} with years`);return out}
// Microsoft moved to an Eightfold site; its search pages hand back 10 roles at a time
async function microsoftPcsx(){const base="https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=&num=10&start=",wait=ms=>new Promise(r=>setTimeout(r,ms));
  // the site rate limits, so go one page at a time and back off when it says slow down
  const get=async st=>{for(let k=0;k<5;k++){try{const r=await fetch(base+st,{headers:{...UA,"User-Agent":"Mozilla/5.0 (compatible; JunctionJobsBot/1.0; +https://crosswayhq.com)"},signal:AbortSignal.timeout(20000)});if(r.status===429){await wait(4000*(k+1));continue}if(!r.ok)return null;return await r.json()}catch{await wait(1500)}}return null};
  const out=[];let total=Infinity;for(let st=0;st<Math.min(total,4000)&&Date.now()<DEADLINE;st+=10){const j=await get(st);const L=j&&j.data&&j.data.positions;if(!Array.isArray(L)||!L.length)break;if(st===0)total=+j.data.count||0;
    L.forEach(x=>out.push({co:"Microsoft",tok:"microsoft",t:x.name,loc:(x.standardizedLocations&&x.standardizedLocations.length?x.standardizedLocations:x.locations||[]).slice(0,3).join(" / "),dept:x.department||"",url:"https://apply.careers.microsoft.com"+(x.positionUrl||("/careers/job/"+x.id)),at:x.postedTs?new Date(x.postedTs*1000).toISOString():"",txt:"",det:{u:`https://apply.careers.microsoft.com/api/pcsx/position_details?position_id=${x.id}&domain=microsoft.com&hl=en`,k:"ms"},wp:/remote/i.test(x.workLocationOption||"")?"remote":/hybrid/i.test(x.workLocationOption||"")?"hybrid":""}));await wait(350)}
  return out}
async function microsoftAll(){const a=await microsoftPcsx().catch(()=>[]);if(a.length>=200)return a;const b=await microsoft().catch(()=>[]);return a.concat(b)}
/* ---------- open lists and job APIs ---------- */
const SIMPLIFY=[["New-Grad-Positions","entry_level"],["Summer2026-Internships","internship"],["Summer2027-Internships","internship"]];
const SCAT={"Software":"Engineering","Hardware":"Engineering","AI/ML/Data":"Data","Data Science, AI & Machine Learning":"Data","Quant":"Data","Product":"Product","Product Management":"Product"};
async function simplify(){const out=[],disc=[];for(const [repo,lvl] of SIMPLIFY){const d=await getJSON(`https://raw.githubusercontent.com/SimplifyJobs/${repo}/dev/.github/scripts/listings.json`);if(!Array.isArray(d))continue;
    for(const x of d){if(!x||!x.url)continue;disc.push([x.url,x.company_name]);if(!x.active||x.is_visible===false)continue;
      out.push({co:x.company_name,t:x.title,loc:(x.locations||[]).join(" / "),dept:SCAT[x.category]||x.category||"",url:x.url,at:x.date_posted?new Date(x.date_posted*1000).toISOString():null,txt:"",wp:"",lvl,src:"Simplify"})}}
  return{out,disc}}
const MUSE_LV=["Internship","Entry Level","Mid Level"];
async function muse(){const out=[];for(const lv of MUSE_LV){for(let p=1;p<=99&&Date.now()<DEADLINE;p++){const j=await getJSON(`https://www.themuse.com/api/public/jobs?page=${p}&level=${encodeURIComponent(lv)}${process.env.MUSE_KEY?"&api_key="+process.env.MUSE_KEY:""}`);
    if(!j||!Array.isArray(j.results)||!j.results.length)break;j.results.forEach(x=>{const txt=strip(x.contents);out.push({co:(x.company&&x.company.name)||"",t:x.name,loc:(x.locations||[]).map(l=>l.name).join(" / "),dept:(x.categories||[]).map(c=>c.name).join(", "),url:x.refs&&x.refs.landing_page,at:x.publication_date,txt,wp:/remote|flexible/i.test((x.locations||[]).map(l=>l.name).join(" "))?"remote":"",lvl:lv==="Internship"?"internship":lv==="Entry Level"?"entry_level":"",src:"The Muse"})});
    if(j.page_count&&p>=j.page_count)break}}return out}
async function arbeitnow(){const out=[];for(let p=1;p<=60&&Date.now()<DEADLINE;p++){const j=await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${p}`);if(!j||!Array.isArray(j.data)||!j.data.length)break;
    j.data.forEach(x=>out.push({co:x.company_name,t:x.title,loc:x.location||"",dept:(x.tags||[]).join(", "),url:x.url,at:x.created_at?new Date(x.created_at*1000).toISOString():null,txt:strip(x.description),wp:x.remote?"remote":"",lvl:/intern|praktik|werkstudent|working student/i.test(x.title+" "+(x.job_types||[]).join(" "))?"internship":/entry|berufseinsteiger|graduate|junior/i.test((x.job_types||[]).join(" "))?"entry_level":"",src:"Arbeitnow"}));
    if(!j.links||!j.links.next)break}return out}
async function himalayas(){const out=[];for(let off=0;off<6000&&Date.now()<DEADLINE;off+=20){const j=await getJSON(`https://himalayas.app/jobs/api?limit=20&offset=${off}`);if(!j||!Array.isArray(j.jobs)||!j.jobs.length)break;
    j.jobs.forEach(x=>{const sen=(x.seniority||[]).join(" ");out.push({co:x.companyName,t:x.title,loc:((x.locationRestrictions||[]).join(" / ")||"Anywhere")+" (Remote)",dept:(x.categories||[]).join(", ").replace(/-/g," "),url:x.applicationLink||x.guid,at:x.pubDate?new Date(x.pubDate*1000).toISOString():null,txt:strip(x.description||x.excerpt),logo:x.companyLogo||"",wp:"remote",lvl:/intern/i.test(sen)?"internship":/entry/i.test(sen)?"entry_level":"",src:"Himalayas"})});
    if(j.totalCount&&off+20>=j.totalCount)break}return out}
async function remotive(){const j=await getJSON("https://remotive.com/api/remote-jobs");if(!j||!Array.isArray(j.jobs))return[];
  return j.jobs.map(x=>({co:x.company_name,t:x.title,loc:(x.candidate_required_location||"Anywhere")+" (Remote)",dept:x.category||"",url:x.url,at:x.publication_date,txt:strip(x.description),logo:x.company_logo||x.company_logo_url||"",wp:"remote",lvl:/intern/i.test(x.job_type||"")?"internship":"",pay:pay(x.salary||""),src:"Remotive"}))}
async function jobicy(){const j=await getJSON("https://jobicy.com/api/v2/remote-jobs?count=100");if(!j||!Array.isArray(j.jobs))return[];
  return j.jobs.map(x=>({co:x.companyName,t:strip(x.jobTitle),loc:(x.jobGeo||"Anywhere")+" (Remote)",dept:[].concat(x.jobIndustry||[]).join(", "),url:x.url,at:x.pubDate,txt:strip(x.jobDescription||x.jobExcerpt),logo:x.companyLogo||"",wp:"remote",lvl:/entry|junior/i.test([].concat(x.jobLevel||[]).join(" "))?"entry_level":"",pay:x.annualSalaryMin&&x.annualSalaryMax&&(x.salaryCurrency||"USD")==="USD"?"$"+Math.round(x.annualSalaryMin/1000)+"k to $"+Math.round(x.annualSalaryMax/1000)+"k":"",src:"Jobicy"}))}
// Adzuna (optional, free keys): early career searches, weighted to the US
const AZ_Q=["junior","entry level","graduate","new grad","associate","intern","analyst","software engineer","data analyst","product manager","marketing","designer"];
async function adzuna(){const id=process.env.ADZUNA_APP_ID,key=process.env.ADZUNA_APP_KEY;if(!id||!key)return[];let budget=+(process.env.ADZUNA_CALLS||40);const out=[];
  const plan=[];for(const q of AZ_Q)plan.push(["us",q]);for(const c of["gb","ca","in","de","au","sg","nl","fr"])for(const q of AZ_Q.slice(0,3))plan.push([c,q]);
  for(const [c,q] of plan){for(let p=1;p<=2&&budget>0;p++){budget--;const j=await getJSON(`https://api.adzuna.com/v1/api/jobs/${c}/search/${p}?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=30&what=${encodeURIComponent(q)}&content-type=application/json`);
      if(!j||!Array.isArray(j.results)||!j.results.length)break;j.results.forEach(x=>out.push({co:(x.company&&x.company.display_name)||"",t:x.title,loc:(x.location&&x.location.display_name||"")+(c==="us"&&!/US|United States/.test(x.location&&x.location.display_name||"")?", US":""),dept:(x.category&&x.category.label)||"",url:x.redirect_url,at:x.created,txt:strip(x.description),wp:"",pay:c==="us"&&x.salary_min&&x.salary_max&&x.salary_min>=20000?"$"+Math.round(x.salary_min/1000)+"k to $"+Math.round(x.salary_max/1000)+"k":"",src:"Adzuna"}))}
    await new Promise(r=>setTimeout(r,2600))}return out}

/* ---------- board discovery ---------- */
const NOTSITE=/^(job|jobs|details|wday|login|apply|en|search)$/i;
export function boardOf(u){u=String(u||"");let m;
  if((m=u.match(/greenhouse\.io\/(?:embed\/job_app\?for=|embed\/job_board\?for=)?([\w-]+)/))&&!/^(embed|v1|jobs)$/.test(m[1]))return"gh:"+m[1].toLowerCase();
  if((m=u.match(/[?&]gh_jid=/))&&(m=u.match(/greenhouse\.io\/([\w-]+)/)))return"gh:"+m[1].toLowerCase();
  if((m=u.match(/jobs\.lever\.co\/([\w.-]+)/)))return"lv:"+m[1];
  if((m=u.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)))return"as:"+m[1];
  if((m=u.match(/jobs\.smartrecruiters\.com\/([\w-]+)\/\d/)))return"sr:"+m[1];
  if((m=u.match(/https?:\/\/([\w.-]+\.oraclecloud\.com)\/hcmUI\/CandidateExperience\/[a-z]{2}\/sites\/([\w-]+)/)))return"oc:"+m[1].toLowerCase()+"|"+m[2];
  if((m=u.match(/https?:\/\/([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)/))&&!NOTSITE.test(m[3]))return"wd:"+m[1].toLowerCase()+"|"+m[2]+"|"+m[3];
  return null}
const isUS=l=>/\b(US|USA|U\.S\.|United States|America)\b|,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b|New York|San Francisco|Seattle|Austin|Boston|Chicago|Los Angeles|Atlanta|Denver|Miami/.test(l||"");

/* ---------- pack ---------- */
export const urlKey=u=>"u:"+String(u||"").replace(/[?#].*$/,"").replace(/\/[a-z]{2}-[A-Z]{2}\//,"/").replace(/^https?:\/\/(www\.)?/,"").replace(/\/+$/,"").toLowerCase();
const HINT=new Map();   // url -> level from lists that know it is new grad or intern
const LVS="iems";
const LOGO={};
// Junction is for office and corporate roles: store, hospital, warehouse, plant and other frontline jobs are left out
const FRONT=/\b(cashier|barista|bartender|server|host(ess)?|busser|dishwasher|line cook|prep cook|cook|chef|baker|butcher|deli|crew( member)?|team member|store (manager|associate|lead|team|supervisor)|assistant store|retail (associate|sales|lead|supervisor|manager)|sales associate|sales floor|stocker|stock (associate|clerk)|merchandiser|cart attendant|courtesy clerk|grocery|produce|bakery|meat cutter|pharmacist|pharmacy tech(nician)?|nurse|nursing|rn|lpn|cna|caregiver|home health|patient care|patient access|medical assistant|dental (assistant|hygienist)|hygienist|phlebotom\w*|sonographer|radiolog\w*|therapist|physician|surgeon|anesthes\w*|psychiatr\w*|clinician|surgical tech|emt|paramedic|veterinar\w*|vet tech|optician|driver|cdl|truck|delivery (driver|associate|specialist)|courier|forklift|warehouse|picker|packer|loader|unloader|material handler|order selector|fulfillment associate|package handler|sorter|assembler|machine operator|machinist|operator|production (worker|associate|operator)|manufacturing (associate|technician|operator)|welder|fabricator|electrician|plumber|hvac|carpenter|painter|mechanic|technician|installer|maintenance|janitor|custodian|housekeep\w*|cleaner|groundskeep\w*|landscap\w*|security (officer|guard)|guard|lifeguard|teacher|tutor|substitute|paraprofessional|childcare|nanny|teller|call center|customer service (rep|representative|associate|agent)|seasonal|part[ -]time|hourly|per diem|prn|overnight|valet|porter|concierge|front desk|room attendant|banquet|food service|dietary|cafeteria|stylist|cosmetolog\w*|esthetician|fitness instructor|personal trainer|key ?holder|outlets?|style advisor|personal banker|relationship banker|universal banker|clerk|pipefitter|food (&|and) beverage|broista|prod tech|installation associate|ophthalmic|optometr\w*|nursing assistant|dietitian|sales lead|shift lead|shift supervisor|cast member|attendant|technologist|apprentice)\b/i;
const STORE=/\(\d{3,}\)|#\s?\d{3,}|\bstore\b|\bpremium outlets\b/i;
const FRONT_DEPT=/\b(retail|stores?|restaurants?|hospitality|nursing|clinical|patient|distribution center|fulfillment|warehouse|manufacturing|plant|hourly|drivers?|transportation)\b/i;
const OFFICE=/\b(chief|director|vp|vice president|head of|information security|cyber|software|engineer(ing)?|developer|product|data|analyst|analytics|finance|financial|accounting|marketing|strategy|consultant|program manager|project manager|scientist|research|designer|recruiter|counsel|attorney|business|operations manager|planner|buyer|account (executive|manager))\b/i;
const corporate=(t,d)=>!STORE.test(t)&&(OFFICE.test(t)||(!FRONT.test(t)&&!FRONT_DEPT.test(d||"")));
// big tech, Fortune 500 and top startups always make the board and come first
const BRAND_LIST=["google","alphabet","meta","facebook","apple","microsoft","amazon","amazon web services","aws","netflix","nvidia","salesforce","oracle","adobe","ibm","intel","cisco","linkedin","uber","lyft","airbnb","stripe","spotify","shopify","doordash","instacart","snowflake","databricks","datadog","palantir","coinbase","robinhood","pinterest","snap inc","reddit","discord","dropbox","atlassian","servicenow","workday","intuit","paypal","block, inc","square","visa","mastercard","american express","jpmorgan","goldman sachs","morgan stanley","bank of america","citi","citigroup","wells fargo","capital one","blackrock","fidelity","charles schwab","vanguard","deloitte","pwc","kpmg","accenture","mckinsey","boston consulting","bcg","bain","tesla","spacex","anduril","openai","anthropic","scale ai","figma","notion","ramp","plaid","chime","brex","rippling","deel","mercury","vercel","cursor","perplexity","harvey","linear","retool","airtable","canva","duolingo","roblox","unity technologies","epic games","riot games","electronic arts","activision","sony","samsung","qualcomm","amd","advanced micro devices","broadcom","texas instruments","micron","applied materials","dell","hp","hewlett packard","vmware","red hat","zoom","slack","twilio","okta","cloudflare","crowdstrike","palo alto networks","zscaler","fortinet","mongodb","elastic","gitlab","github","hubspot","zillow","expedia","booking","tripadvisor","ebay","etsy","wayfair","chewy","peloton","walmart","target","costco","the home depot","home depot","lowe's","kroger","cvs","walgreens","unitedhealth","optum","elevance","cigna","humana","pfizer","johnson & johnson","merck","abbvie","eli lilly","lilly","bristol myers","amgen","gilead","moderna","medtronic","abbott","stryker","ge healthcare","ge vernova","ge aerospace","general electric","honeywell","3m","boeing","lockheed martin","northrop grumman","raytheon","rtx","general dynamics","l3harris","general motors","ford","rivian","lucid","waymo","nike","pepsico","coca-cola","the coca-cola","procter & gamble","unilever","nestle","nestlé","mondelez","kraft heinz","general mills","mcdonald's","starbucks","chipotle","disney","the walt disney","warner bros","nbcuniversal","comcast","paramount","verizon","at&t","t-mobile","charter communications","exxon","exxonmobil","chevron","conocophillips","caterpillar","john deere","deere","ups","fedex","delta air lines","united airlines","american airlines","southwest airlines","marriott","hilton","hyatt","nordstrom","macy's","best buy","lululemon","tiktok","bytedance","grammarly","gusto","toast","affirm","sofi","nerdwallet","wealthfront","betterment","carta","gemini","kraken","chainalysis","glean","cohere","mistral","hugging face","elevenlabs","jane street","citadel","two sigma","hudson river trading","d. e. shaw","de shaw","jump trading","optiver","susquehanna","point72","bridgewater","state street","bny","u.s. bank","us bank","pnc","truist","ally","discover","synchrony","s&p global","moody's","bloomberg","thomson reuters","nasdaq","intercontinental exchange","cme group","mckesson","cencora","cardinal health","siemens","philips","bosch","sap","asml","arm","nokia","ericsson","waymo","nuro","zoox","cruise","wiz","snyk","ramp","faire","flexport","samsara","benchling","tempus","navan","checkr","gong","miro","asana","monday.com","clickup","webflow","postman","confluent","hashicorp","cockroach labs","pagerduty","new relic","fastly","digitalocean","sentry","grafana labs","dbt labs","fivetran","airbyte","hex","modal","together ai","baseten","pinecone","weights & biases","pika","character.ai","inflection","adept","cognition","poolside","decagon","writer","jasper","clay","vanta","drata","persona","sardine","alloy","marqeta","stripe","adyen","klarna","revolut","wise","monzo","nubank"];
const BRANDS=new RegExp("^(the )?("+BRAND_LIST.map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")(\\b|$)","i");
const isBrand=co=>BRANDS.test(String(co||"").trim());
export function pack(raw){const now=Date.now();const seen=new Set();const cos=[],coIx={},doms=[],locs=[],locIx={},pres=[],preIx={},srcs=[""],rows=[];
  for(const r of raw){if(!r||!r.t||!r.url||!r.co)continue;const co=String(r.co).trim();const t=strip(r.t).slice(0,120);if(!co||!t)continue;
    if(!corporate(t,r.dept))continue;const uk=urlKey(r.url),k=(co+"|"+t+"|"+(r.loc||"")).toLowerCase();if(seen.has(uk)||seen.has(k))continue;seen.add(uk);seen.add(k);
    const at=r.at?Date.parse(r.at):NaN;if(!isNaN(at)&&now-at>1000*86400*120)continue; // skip roles older than 4 months
    const txt=r.txt||"";const fam=family(t,r.dept);let lv=level(t);const hl=r.lvl||HINT.get(uk);if(hl==="entry_level"&&lv!=="intern")lv="entry";if(hl==="internship")lv="intern";if(r.lvl==="entry_level"&&lv!=="intern")lv="entry";if(r.lvl==="internship")lv="intern";
    const p=r.pay||pay(txt);if(!(co in coIx)){coIx[co]=cos.length;cos.push(co);doms.push(domainOf(r.tok||"",r.url,co))}if(r.logo&&!LOGO[co])LOGO[co]=r.logo
    const loc=(r.loc||"").replace(/\s+/g," ").trim().slice(0,90);if(!(loc in locIx)){locIx[loc]=locs.length;locs.push(loc)}
    const cut=r.url.lastIndexOf("/")+1,pre=r.url.slice(0,cut);if(!(pre in preIx)){preIx[pre]=pres.length;pres.push(pre)}
    let si=0;if(r.src){si=srcs.indexOf(r.src);if(si<0){si=srcs.length;srcs.push(r.src)}}
    rows.push([coIx[co],t,locIx[loc],FAMS.indexOf(fam),LVS.indexOf(lv[0]),"rho".indexOf(workplace(loc,r.wp)[0]),isNaN(at)?0:Math.round(at/864e5),[preIx[pre],r.url.slice(cut)],p,(r.skp?[...new Set([...skillsOf(t+" "+txt),...r.skp])]:skillsOf(t+" "+txt)),(r.yp!=null&&!(minYears(txt)>0)?r.yp:minYears(txt)),si,snippet(txt)])}
  // keep every intern, entry and 2 to 4 year role first, then US, then the newest senior roles
  const today=Math.round(now/864e5),score=r=>{const yrs=r[10],early=r[4]<=1||(r[4]===2&&(yrs<0||yrs<=4));return(BR[r[0]]?-3000:0)+(FAMS[r[3]]==="other"?500:0)+(early?0:r[4]===2?1:2)*1000+(isUS(locs[r[2]])||r[5]===0?0:300)+Math.min(299,r[6]?today-r[6]:60)};const BR=cos.map(isBrand);
  // no single company floods the board: keep each company's best PER_CO roles
  {const by={};rows.map(r=>[score(r),r]).sort((a,b)=>a[0]-b[0]).forEach(([,r])=>{(by[r[0]]=by[r[0]]||[]).push(r)});rows.length=0;Object.values(by).forEach(a=>{for(const r of a.slice(0,BR[a[0][0]]?BRAND_CO:PER_CO))rows.push(r)})}
  let keep=rows;if(rows.length>MAX_JOBS)keep=rows.map(r=>[score(r),r]).sort((a,b)=>a[0]-b[0]).slice(0,MAX_JOBS).map(x=>x[1]);
  keep.sort((a,b)=>b[6]-a[6]);const guess=[];doms.forEach((d,i)=>{if(d[0]==="?"){doms[i]=d.slice(1);guess.push(i)}});
  Object.defineProperty(cos,"guess",{value:guess,enumerable:false});return{v:2,updated:new Date().toISOString(),skills:SK,fams:FAMS,cos,doms,locs,pres,srcs,rows:keep}}

/* ---------- company websites for logos ---------- */
// Names we could only guess a domain for get looked up on Wikidata (official website), cached in domains.json
const WD_API="https://www.wikidata.org/w/api.php?format=json&origin=*&";
export function plausible(name,host){const lab=String(host||"").replace(/^www\./,"").split(".")[0].replace(/[^a-z0-9]/g,"");if(lab.length<2)return false;
  const w=cleanCo(name).toLowerCase().replace(/&/g," ").split(/[^a-z0-9]+/).filter(Boolean);if(!w.length)return false;
  const ac=w.map(x=>x[0]).join(""),all=w.join("");
  return lab===all||lab===ac||(w[0].length>=3&&(lab.startsWith(w[0])||all.startsWith(lab)))||(lab.length>=4&&all.includes(lab))}
async function wikiSite(name){const q=cleanCo(name);if(q.length<2)return"";
  const s=await getJSON(WD_API+"action=query&list=search&srlimit=4&srsearch="+encodeURIComponent(q+" haswbstatement:P856"));const ids=((s&&s.query&&s.query.search)||[]).map(x=>x.title).filter(t=>/^Q\d+$/.test(t));if(!ids.length)return"";
  const e=await getJSON(WD_API+"action=wbgetentities&props=claims&ids="+ids.join("|"));if(!e||!e.entities)return null;
  for(const id of ids){const c=e.entities[id]&&e.entities[id].claims&&e.entities[id].claims.P856;if(!c)continue;
    for(const x of c){const v=x.mainsnak&&x.mainsnak.datavalue&&x.mainsnak.datavalue.value;let h="";try{h=new URL(v).hostname.toLowerCase().replace(/^(www\d?|careers|jobs|corporate|about|global|group|en|us)\./,"")}catch{}
      if(h&&plausible(name,h))return h}}return""}
async function resolveDomains(out,today){const cache=readJSON(OUT+"/domains.json")||{};const n={};out.rows.forEach(r=>n[r[0]]=(n[r[0]]||0)+1);
  const todo=[];for(const i of out.cos.guess||[]){const co=out.cos[i],c=cache[co];
    if(c&&c[0]){out.doms[i]=c[0];continue}if(LOGO[co]){out.doms[i]=LOGO[co];continue}
    if(!c||today-c[1]>30)todo.push(i)}
  todo.sort((a,b)=>(n[b]||0)-(n[a]||0));const end=Date.now()+60000*+(process.env.LOGO_MINUTES||8);let found=0;
  await pool(todo.slice(0,+(process.env.LOGO_MAX||4000)),6,async i=>{const co=out.cos[i];const h=await wikiSite(co);if(h===null)return;cache[co]=[h,today];if(h){out.doms[i]=h;found++}},end);
  writeFileSync(OUT+"/domains.json",JSON.stringify(cache));console.log(`Logos: looked up ${todo.length} names, found ${found} websites`)}

/* ---------- run ---------- */
const readJSON=f=>{try{return JSON.parse(readFileSync(f,"utf8"))}catch{return null}};
async function main(){const t0=Date.now();const today=Math.round(t0/864e5);
  const cache=readJSON(OUT+"/boards.json")||{};               // boards that worked recently: key -> {d: last good day, n: company name}
  const sim=await simplify();const cand=new Map();             // key -> name
  const low=new Set(),add=(k,n)=>{if(!k||low.has(k.toLowerCase()))return;low.add(k.toLowerCase());cand.set(k,n||"")};
  uniq(GH).forEach(t=>add("gh:"+t));uniq(LV).forEach(t=>add("lv:"+t));uniq(AS).forEach(t=>add("as:"+t));uniq(SR).forEach(t=>add("sr:"+t));WD.filter(Boolean).forEach(t=>add("wd:"+t,WD_NAMES[t]));OC.forEach(([t,n])=>add("oc:"+t,n));
  Object.entries(cache).forEach(([k,v])=>{if(today-(v.d||0)<=21)add(k,v.n)});
  sim.disc.forEach(([u,n])=>add(boardOf(u),n));sim.out.forEach(r=>HINT.set(urlKey(r.url),r.lvl));
  for(const [k,n] of cand){const tok=k.slice(3);if(n&&!(tok in NAMES))DISC[tok]=n}
  const F={gh:greenhouse,lv:lever,as:ashby,sr:smart,wd:workday,oc:oracle};
  const order=["gh","lv","as","sr","oc","wd"],tasks=[...cand.keys()].sort((a,b)=>order.indexOf(a.slice(0,2))-order.indexOf(b.slice(0,2)));
  const ok={};const apis=Promise.all([amazon(),microsoftAll(),apple(),google(),...EF.slice(1).map(e=>eightfold(e)),muse(),arbeitnow(),himalayas(),remotive(),jobicy(),adzuna()].map(p=>p.catch(()=>[])));
  const res=await pool(tasks,24,async k=>{const r=await F[k.slice(0,2)](k.slice(3));if(r&&r.length){ok[k]=r.length;return r}return[]});
  const api=await apis;const raw=[...res.flat(),...sim.out,...api.flat()];
  // keep years and skills read on earlier runs, so each run only has to open postings it hasn't seen.
  // 0 means "opened, no years listed"; those are kept too, unless the years reader changed since that run
  {const pv=readJSON(OUT+"/index.json"),carry=new Map();if(pv&&pv.rows){const ps=pv.skills||[],keep0=pv.yv===YV;for(const x of pv.rows){if(!(x[10]>0||(keep0&&x[10]===0)))continue;const u=Array.isArray(x[7])?pv.pres[x[7][0]]+x[7][1]:x[7];carry.set(u,[x[10],(x[9]||[]).map(i=>SK.indexOf(ps[i])).filter(i=>i>=0)])}}
   let hit=0;raw.forEach(r=>{if(r.url&&!(minYears(r.txt||"")>0)){const c=carry.get(r.url);if(c){r.yp=c[0];r.skp=c[1];hit++}}});console.log(`::notice title=Carried years::${hit}`)}
  // open the full posting where the list only has a title or a short summary: Workday, SmartRecruiters, Oracle, and the Microsoft, Apple and Eightfold sites.
  // All four run side by side under one clock; postings for the fields members pick and early career roles go first
  {const wait=ms=>new Promise(r=>setTimeout(r,ms)),dl=Date.now()+60000*+(process.env.DETAIL_MINUTES||20);
   const need=r=>r.yp==null&&!(minYears(r.txt||"")>0)&&corporate(String(r.t||""),r.dept);
   const rank=r=>{const t=String(r.t||"");return(family(t,r.dept)==="other"?4:0)+(/senior|\bsr\b|staff|principal|director|\bvp\b|head of|lead\b|manager/i.test(t)?2:0)+(isBrand(r.co)?0:1)};
   const first=L=>L.sort((a,b)=>rank(a)-rank(b));
   const read=(r,x)=>{if(!x)return false;r.txt=(r.txt?r.txt+" ":"")+strip(x).slice(0,8000);if(!(minYears(r.txt)>0))r.yp=0;return true};
   const tally={};const note=(k,s)=>{const t=tally[k]=tally[k]||{};t[s]=(t[s]||0)+1};
   const workdayAll=async()=>{const L=first(raw.filter(r=>r.wdApi&&!r.txt&&need(r)));const cap=+(process.env.WD_DETAILS||60000);let got=0;
     await pool(L.slice(0,cap),32,async r=>{const j=await getJSON(r.wdApi,{},15000);const d=j&&j.jobPostingInfo;if(d&&d.jobDescription&&read(r,d.jobDescription))got++;return[]},dl);
     return `Workday ${got} of ${L.length}`};
   // SmartRecruiters: one posting at a time; the ad has description and qualification sections
   const smartAll=async()=>{const L=first(raw.filter(r=>r.srApi&&need(r)));let got=0;
     await pool(L,12,async r=>{const j=await getJSON(r.srApi,{},15000);const S=j&&j.jobAd&&j.jobAd.sections;if(!S)return[];const x=["qualifications","jobDescription","additionalInformation"].map(k=>(S[k]&&S[k].text)||"").join(" . ");if(x.trim()&&read(r,x))got++;return[]},dl);
     return `SmartRecruiters ${got} of ${L.length}`};
   // Oracle: the requisition details call has the full description and qualifications; a few at a time per site
   const oracleAll=async()=>{const by={};raw.filter(r=>r.ocApi&&need(r)).forEach(r=>{const h=r.ocApi.split("/")[2];(by[h]=by[h]||[]).push(r)});let got=0,n=0;
     await Promise.all(Object.values(by).map(L=>{n+=L.length;return pool(first(L),4,async r=>{const j=await getJSON(r.ocApi,{},20000);const d=j&&Array.isArray(j.items)&&j.items[0];if(!d)return[];
       const x=[d.ExternalQualificationsStr,d.ExternalResponsibilitiesStr,d.ExternalDescriptionStr].filter(Boolean).join(" . ");if(x.trim()&&read(r,x))got++;return[]},dl)}));
     return `Oracle ${got} of ${n}`};
   // Microsoft, Apple and Eightfold sites rate limit, so a few at a time with a pause
   const one=async r=>{for(let k=0;k<4;k++){let res;try{res=await fetch(r.det.u,{headers:{...UA,"User-Agent":"Mozilla/5.0 (compatible; JunctionJobsBot/1.0; +https://crosswayhq.com)",Accept:r.det.k==="html"?"text/html":"application/json"},signal:AbortSignal.timeout(20000)})}catch{await wait(1500);continue}
     note(r.det.k,res.status);if(res.status===429){await wait(4000*(k+1));continue}if(!res.ok)return;const s=await res.text();let x="";
     try{if(r.det.k==="ms"){const j=JSON.parse(s);x=(j.data||j).jobDescription||""}else if(r.det.k==="ef"){x=JSON.parse(s).job_description||""}else x=appleText(s)}catch{}
     if(!x)note(r.det.k,"empty");read(r,x);return}};
   const sitesAll=async()=>{const by={};raw.filter(r=>r.det&&need(r)).forEach(r=>{const k=r.det.k+(r.det.u.split("/")[2]);(by[k]=by[k]||[]).push(r)});
     const st=await Promise.all(Object.entries(by).map(async([k,L])=>{let n=0;await pool(first(L),3,async r=>{await one(r);if(minYears(r.txt||"")>0)n++;await wait(250);return[]},dl);return k+" "+n+"/"+L.length}));return st.join(", ")};
   const res=await Promise.all([workdayAll(),smartAll(),oracleAll(),sitesAll()].map(p=>p.catch(e=>"failed: "+e.message)));
   console.log("::notice title=Full postings::"+res.join(", "));console.log("::notice title=Site responses::"+JSON.stringify(tally))}const out=pack(raw);out.yv=YV;
  const prev=readJSON(OUT+"/index.json");
  if(out.rows.length<500||(prev&&prev.rows&&out.rows.length<prev.rows.length*0.2)){console.log("Too few jobs fetched ("+out.rows.length+"), keeping the last good files.");process.exitCode=0;return}
  const nb={};for(const [k,v] of Object.entries(cache))if(today-(v.d||0)<=21)nb[k]=v;for(const k of Object.keys(ok))nb[k]={d:today,n:cand.get(k)||""};
  mkdirSync(OUT,{recursive:true});await resolveDomains(out,today);
  // descriptions go in a fresh versioned folder; the previous one stays so open tabs keep working
  const ver=String(Date.now().toString(36)),keepV=prev&&prev.ver;
  readdirSync(OUT).filter(f=>/^d\d+\.json$/.test(f)).forEach(f=>unlinkSync(OUT+"/"+f));
  if(existsSync(OUT+"/s"))readdirSync(OUT+"/s").filter(v=>v!==keepV).forEach(v=>rmSync(OUT+"/s/"+v,{recursive:true,force:true}));
  mkdirSync(`${OUT}/s/${ver}`,{recursive:true});const desc=out.rows.map(r=>r.pop());out.shard=SHARD;out.ver=ver;
  for(let i=0;i*SHARD<desc.length;i++)writeFileSync(`${OUT}/s/${ver}/d${i}.json`,JSON.stringify(desc.slice(i*SHARD,(i+1)*SHARD)));
  writeFileSync(OUT+"/index.json",JSON.stringify(out));writeFileSync(OUT+"/boards.json",JSON.stringify(nb));
  const by={};out.rows.forEach(r=>{const s=out.srcs[r[11]]||"boards";by[s]=(by[s]||0)+1});const lv={};out.rows.forEach(r=>{const l=["intern","entry","mid","senior"][r[4]];lv[l]=(lv[l]||0)+1});
  console.log(`${out.rows.length} jobs (${raw.length} fetched) from ${Object.keys(ok).length} of ${tasks.length} boards in ${Math.round((Date.now()-t0)/1000)}s`);
  console.log("By source:",JSON.stringify(by));console.log("By level:",JSON.stringify(lv));console.log("US or remote:",out.rows.filter(r=>r[5]===0||isUS(out.locs[r[2]])).length)}
export {apple,microsoftPcsx,eightfold,EF};
if(process.argv[1]&&process.argv[1].endsWith("fetch-jobs.mjs"))main();
