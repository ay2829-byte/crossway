// Pulls open roles from public company job boards (Greenhouse, Lever, Ashby, SmartRecruiters)
// and writes jobs.json for Junction. Runs daily in GitHub Actions. Node 20+, no packages.
import {writeFileSync,existsSync,mkdirSync,readdirSync,unlinkSync} from "node:fs";
import {GH,LV,AS,SR,NAMES,DOMAINS} from "./companies.mjs";

const UA={"User-Agent":"JunctionJobsBot/1.0 (+https://crosswayhq.com)","Accept":"application/json"};
const MAX_JOBS=60000,SNIP=420,SHARD=1000,OUT="jobs";
export const FAMS=["eng","product","data","design","growth","sales","ops","other"];
const uniq=a=>[...new Set(a.filter(t=>t&&/^[\w.-]+$/.test(t)))];

async function getJSON(url,opt={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);
  try{const r=await fetch(url,{headers:UA,signal:c.signal,...opt});if(!r.ok)return null;return await r.json()}catch{return null}finally{clearTimeout(t)}}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;try{out[k]=await fn(items[k])}catch{out[k]=null}}}));return out}

/* ---------- text helpers ---------- */
const ENT={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" ",rsquo:"'",lsquo:"'",rdquo:'"',ldquo:'"',ndash:"–",mdash:"—",hellip:"…",bull:"•"};
const decode=s=>String(s||"").replace(/&(#x?[0-9a-f]+|\w+);/gi,(m,e)=>e[0]==="#"?String.fromCodePoint(e[1].toLowerCase()==="x"?parseInt(e.slice(2),16):parseInt(e.slice(1),10)):(ENT[e.toLowerCase()]??m));
const strip=h=>decode(decode(String(h||"")).replace(/<(br|\/p|\/li|\/h\d|\/div)[^>]*>/gi," . ").replace(/<[^>]+>/g," ")).replace(/\s+/g," ").replace(/( \.)+/g,".").replace(/ ([,.;:!?])/g,"$1").replace(/\.{2,}/g,".").replace(/^\. ?/,"").trim();
const snippet=t=>{t=t.replace(/^\W+/,"");if(t.length<=SNIP)return t;const c=t.slice(0,SNIP);return c.slice(0,Math.max(c.lastIndexOf(" "),SNIP-40))+"…"};
const ATS=/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|myworkdayjobs\.com|workable\.com|jobvite\.com|icims\.com|bamboohr\.com|recruitee\.com|breezy\.hr|gem\.com|rippling-ats\.com|rippling\.com\/careers)$/i;
export function domainOf(tok,url){if(tok in DOMAINS)return DOMAINS[tok];try{const h=new URL(url).hostname.toLowerCase();if(!ATS.test(h))return h.replace(/^(www|careers|jobs|boards|job-boards|apply|work|talent|join)\./,"")}catch{}return /^[a-z0-9]+$/i.test(tok)?tok.toLowerCase()+".com":""}
const pretty=t=>NAMES[t]??t.replace(/[-_]/g," ").replace(/\b\w/g,c=>c.toUpperCase());

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
  if(/new grad|graduate|entry[ -]level|\bentry\b|junior|\bjr\.?\b|early career|university|campus|\bassociate\b(?! (director|manager|general|vp|vice|principal|partner))|\b(engineer|developer|analyst|scientist|designer|specialist|representative|coordinator) i\b|\bi\s*$|\blevel 1\b|\bl1\b|\bl2\b|rotational|fellow|trainee/.test(t))return"entry";
  if(/senior|\bsr\.?\b|staff|principal|\blead\b|head of|director|\bvp\b|vice president|chief|distinguished|\biii\b|\biv\b|\bl5\b|\bl6\b|\bl7\b|architect|(engineering|design|data science|analytics) manager|manager,? (engineering|design|sales)|managing|partner\b|expert/.test(t))return"senior";
  return"mid"}
export function workplace(loc,hint){const l=(loc||"").toLowerCase(),h=(hint||"").toLowerCase();
  if(/remote/.test(h))return"remote";if(/hybrid/.test(h))return"hybrid";if(/on-?site/.test(h))return"onsite";
  if(/remote|anywhere|distributed|work from home|\bwfh\b/.test(l))return"remote";if(/hybrid/.test(l))return"hybrid";return"onsite"}
const SK=["SQL","Python","Java","JavaScript","TypeScript","React","Node.js","Go","C++","C#","Rust","Ruby","Kotlin","Swift","Scala","AWS","GCP","Azure","Kubernetes","Docker","Terraform","Git","APIs","System design","Spark","Airflow","dbt","Snowflake","BigQuery","Databricks","Tableau","Looker","Power BI","Excel","A/B testing","Amplitude","Mixpanel","Figma","Jira","PRDs","User research","Roadmapping","Product analytics","Machine learning","PyTorch","TensorFlow","LLMs","Statistics","R","Salesforce","HubSpot","SEO","Paid acquisition","Lifecycle marketing","Financial modeling","GTM strategy","Pricing","Process design","Marketo","Google Analytics","Next.js","GraphQL","PostgreSQL","Kafka","Linux"];
const SKRE=SK.map(s=>[s,new RegExp("(^|[^a-z0-9+#])("+({"A/B testing":"a\\/b test(s|ing)?|ab test(s|ing)?|experimentation","Node.js":"node\\.?js","Go":"golang","C++":"c\\+\\+","C#":"c#","R":"r programming|in r\\b|r\\/python|python\\/r|r or python|python or r|python, r\\b","APIs":"apis?|rest api","System design":"system design|distributed systems","Machine learning":"machine learning|\\bml\\b","LLMs":"llms?|large language models?|generative ai|genai","Statistics":"statistic(s|al)","PRDs":"prds?|product requirements?( documents?)?","User research":"user research|customer interviews|usability","Roadmapping":"roadmap(s|ping)?","Product analytics":"product analytics","Paid acquisition":"paid (social|search|acquisition|media)|google ads|meta ads|performance marketing","Lifecycle marketing":"lifecycle (marketing|campaigns?)|email marketing|crm marketing","Financial modeling":"financial model(s|ing)?","GTM strategy":"go-to-market|gtm","Pricing":"pricing","Process design":"process (design|improvement)","PostgreSQL":"postgres(ql)?","Power BI":"power ?bi","Google Analytics":"google analytics|ga4","Excel":"excel|spreadsheets","Next.js":"next\\.?js"}[s]||s.toLowerCase().replace(/[.+*?^${}()|[\]\\/]/g,"\\$&"))+")(?![a-z0-9+#])","i")]);
const GO=/(^|[\s,(\/])Go([\s,.)\/]|$)(?! to\b| for\b| from\b| live\b| above\b| beyond\b)/;
const skillsOf=txt=>{const out=[];SKRE.forEach(([s,re],i)=>{if(re.test(txt)||(s==="Go"&&GO.test(txt)))out.push(i)});return out};
export function pay(txt){const m=txt.match(/\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])(?:\.00)?\s*(?:USD)?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])/);
  if(!m)return"";const n=v=>/k/i.test(v)?parseFloat(v)*1000:+v.replace(/,/g,"");const a=n(m[1]),b=n(m[2]);if(a<20000||b<a||b>2e6)return"";const f=v=>"$"+Math.round(v/1000)+"k";return f(a)+" to "+f(b)}

/* ---------- sources ---------- */
async function greenhouse(tok){const [b,j]=await Promise.all([getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}`),getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}/jobs?content=true`)]);
  if(!j||!Array.isArray(j.jobs))return null;const co=(b&&b.name)||pretty(tok);
  return j.jobs.map(x=>{const txt=strip(x.content);const loc=(x.location&&x.location.name)||"";return{tok,co,t:x.title,loc,dept:(x.departments||[]).map(d=>d.name).join(", "),url:x.absolute_url,at:x.first_published||x.updated_at,txt,wp:""}})}
async function lever(tok){const j=await getJSON(`https://api.lever.co/v0/postings/${tok}?mode=json`);if(!Array.isArray(j))return null;const co=pretty(tok);
  return j.map(x=>{const c=x.categories||{};const txt=(x.descriptionPlain||"")+" "+(x.lists||[]).map(l=>l.text+" "+strip(l.content)).join(" ")+" "+(x.additionalPlain||"");
    const sr=x.salaryRange;const p=sr&&sr.min&&sr.max&&(sr.currency||"USD")==="USD"&&/year|annual/i.test(sr.interval||"year")?"$"+Math.round(sr.min/1000)+"k to $"+Math.round(sr.max/1000)+"k":"";
    return{tok,co,t:x.text,loc:(c.allLocations&&c.allLocations.join(" / "))||c.location||"",dept:[c.department,c.team].filter(Boolean).join(", "),url:x.hostedUrl,at:x.createdAt?new Date(x.createdAt).toISOString():null,txt,wp:x.workplaceType||"",pay:p}})}
async function ashby(tok){const j=await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${tok}?includeCompensation=true`);if(!j||!Array.isArray(j.jobs))return null;const co=pretty(tok);
  return j.jobs.filter(x=>x.isListed!==false).map(x=>{const locs=[x.location,...(x.secondaryLocations||[]).map(s=>s.location)].filter(Boolean);
    const cs=x.compensation&&(x.compensation.scrapeableCompensationSalarySummary||x.compensation.compensationTierSummary)||"";
    return{tok,co,t:x.title,loc:locs.join(" / ")+(x.isRemote&&!/remote/i.test(locs.join(" "))?" (Remote)":""),dept:[x.department,x.team].filter(Boolean).join(", "),url:x.jobUrl,at:x.publishedAt,txt:x.descriptionPlain||strip(x.descriptionHtml),wp:x.workplaceType||(x.isRemote?"remote":""),pay:pay(cs)}})}
async function smart(tok){const out=[];let co=pretty(tok);for(let off=0;off<1000;off+=100){const j=await getJSON(`https://api.smartrecruiters.com/v1/companies/${tok}/postings?limit=100&offset=${off}`);
    if(!j||!Array.isArray(j.content))return off?out:null;j.content.forEach(x=>{const l=x.location||{};if(x.company&&x.company.name)co=x.company.name;
      out.push({tok,co,t:x.name,loc:[l.city,l.region,l.country&&l.country.toUpperCase()].filter(Boolean).join(", ")+(l.remote?" (Remote)":""),dept:(x.department&&x.department.label)||(x.function&&x.function.label)||"",url:`https://jobs.smartrecruiters.com/${tok}/${x.id}`,at:x.releasedDate,txt:"",wp:l.remote?"remote":(l.hybrid?"hybrid":""),lvl:x.experienceLevel&&x.experienceLevel.id})});
    if(j.content.length<100)break}return out}

/* ---------- pack ---------- */
export function pack(raw){const now=Date.now();const seen=new Set();const cos=[],coIx={},doms=[],locs=[],locIx={};const rows=[];
  for(const r of raw){if(!r||!r.t||!r.url)continue;const k=(r.co+"|"+r.t+"|"+r.loc).toLowerCase();if(seen.has(k))continue;seen.add(k);
    const at=r.at?Date.parse(r.at):NaN;if(!isNaN(at)&&now-at>1000*86400*120)continue; // skip roles older than 4 months
    const txt=r.txt||"";const fam=family(r.t,r.dept);let lv=level(r.t);if(r.lvl==="entry_level"&&lv==="mid")lv="entry";if(r.lvl==="internship")lv="intern";
    const p=r.pay||pay(txt);if(!(r.co in coIx)){coIx[r.co]=cos.length;cos.push(r.co);doms.push(domainOf(r.tok||"",r.url))}else if(!doms[coIx[r.co]]){doms[coIx[r.co]]=domainOf(r.tok||"",r.url)}const loc=(r.loc||"").replace(/\s+/g," ").trim().slice(0,90);if(!(loc in locIx)){locIx[loc]=locs.length;locs.push(loc)}
    rows.push([coIx[r.co],r.t.trim().slice(0,120),locIx[loc],FAMS.indexOf(fam),"iems".indexOf(lv[0]),"rho".indexOf(workplace(loc,r.wp)[0]),isNaN(at)?0:Math.round(at/864e5),r.url,p,skillsOf(r.t+" "+txt),snippet(txt)])}
  rows.sort((a,b)=>b[6]-a[6]);return{v:1,updated:new Date().toISOString(),skills:SK,fams:FAMS,cos,doms,locs,rows:rows.slice(0,MAX_JOBS)}}

async function main(){const t0=Date.now();const tasks=[...uniq(GH).map(t=>["gh",t]),...uniq(LV).map(t=>["lv",t]),...uniq(AS).map(t=>["as",t]),...uniq(SR).map(t=>["sr",t])];
  const F={gh:greenhouse,lv:lever,as:ashby,sr:smart};const ok={},res=await pool(tasks,16,async([s,t])=>{const r=await F[s](t);if(r&&r.length)ok[s+":"+t]=r.length;return r||[]});
  const raw=res.flat();const out=pack(raw);
  if(out.rows.length<500&&existsSync(OUT+"/index.json")){console.log("Too few jobs fetched ("+out.rows.length+"), keeping yesterday's files.");return}
  mkdirSync(OUT,{recursive:true});readdirSync(OUT).filter(f=>/^d\d+\.json$/.test(f)).forEach(f=>unlinkSync(OUT+"/"+f));
  const desc=out.rows.map(r=>r.pop());out.shard=SHARD;
  for(let i=0;i*SHARD<desc.length;i++)writeFileSync(`${OUT}/d${i}.json`,JSON.stringify(desc.slice(i*SHARD,(i+1)*SHARD)));
  writeFileSync(OUT+"/index.json",JSON.stringify(out));
  console.log(`${out.rows.length} jobs from ${Object.keys(ok).length} of ${tasks.length} boards in ${Math.round((Date.now()-t0)/1000)}s`);
  console.log("Dead boards:",tasks.filter(([s,t])=>!ok[s+":"+t]).map(([s,t])=>s+":"+t).join(" "))}
if(process.argv[1]&&process.argv[1].endsWith("fetch-jobs.mjs"))main();
