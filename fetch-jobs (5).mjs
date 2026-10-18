// Pulls open roles for Junction from public sources and writes jobs/index.json plus description shards.
// Sources: company boards on Greenhouse, Lever, Ashby, SmartRecruiters and Workday (thousands, auto discovered),
// Simplify's open new grad and internship lists, The Muse, Arbeitnow, Himalayas, Remotive, Jobicy,
// and Adzuna when ADZUNA_APP_ID and ADZUNA_APP_KEY are set. Runs every few hours in GitHub Actions. Node 20+, no packages.
import {writeFileSync,readFileSync,existsSync,mkdirSync,readdirSync,unlinkSync,rmSync} from "node:fs";
import {GH,LV,AS,SR,WD,WD_NAMES,NAMES,DOMAINS} from "./companies.mjs";

const UA={"User-Agent":"JunctionJobsBot/1.0 (+https://crosswayhq.com)","Accept":"application/json"};
const MAX_JOBS=+(process.env.MAX_JOBS||100000),SNIP=320,SHARD=1000,OUT=process.env.OUT||"jobs";
const DEADLINE=Date.now()+60000*+(process.env.FETCH_MINUTES||40),WD_CAP=+(process.env.WD_CAP||2000);
export const FAMS=["eng","product","data","design","growth","sales","ops","other"];
const uniq=a=>[...new Set(a.filter(t=>t&&/^[\w.-]+$/.test(t)))];

async function getJSON(url,opt={}){const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);
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
  const re=/(\d{1,2})\s*\+?\s*(?:(?:-|–|—|to)\s*\d{1,2}\s*)?\+?\s*(?:or more\s+|plus\s+)?years?(?:'s|’s)?\b([^.;]{0,70})/gi;let m;
  while((m=re.exec(t))){const n=+m[1];const after=m[2]||"",before=t.slice(Math.max(0,m.index-50),m.index);const ctx=before+" | "+after;
    if(n<1||n>15)continue;
    if(/\b(old|age|aged|ago|history|founded|warranty|anniversary|in business|been around|running|of age|tenure with us|we've|we have been|over the (past|last))\b/i.test(ctx))continue;
    if(/experience|exp\b|working|work(ed)? (in|on|with|as)|industry|professional|background|track record|hands.on|relevant|related|proven|building|managing|leading|shipping|owning|in (a|an|the)\b|in [a-z]+ (roles?|management|marketing|sales|engineering|design|analytics|operations)|as an?\b|of\b|post.?grad|full.?time/i.test(after)
      ||/\b(minimum|at least|min\.?|requires?|required|must have|need|over|more than|bring)\b[^\d]{0,25}$/i.test(before))return n}
  return -1}
export function pay(txt){const m=txt.match(/\$\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])(?:\.00)?\s*(?:USD)?\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?[kK])/);
  if(!m)return"";const n=v=>/k/i.test(v)?parseFloat(v)*1000:+v.replace(/,/g,"");const a=n(m[1]),b=n(m[2]);if(a<20000||b<a||b>2e6)return"";const f=v=>"$"+Math.round(v/1000)+"k";return f(a)+" to "+f(b)}

/* ---------- company boards ---------- */
async function greenhouse(tok){const [b,j]=await Promise.all([getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}`),getJSON(`https://boards-api.greenhouse.io/v1/boards/${tok}/jobs?content=true`)]);
  if(!j||!Array.isArray(j.jobs))return null;const co=(b&&b.name)||pretty(tok);
  return j.jobs.map(x=>{const txt=strip(x.content);const loc=(x.location&&x.location.name)||"";return{tok,co,t:x.title,loc,dept:(x.departments||[]).map(d=>d.name).join(", "),url:x.absolute_url,at:x.first_published||x.updated_at,txt,wp:""}})}
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
      out.push({tok,co,t:x.name,loc:[l.city,l.region,l.country&&l.country.toUpperCase()].filter(Boolean).join(", ")+(l.remote?" (Remote)":""),dept:(x.department&&x.department.label)||(x.function&&x.function.label)||"",url:`https://jobs.smartrecruiters.com/${tok}/${x.id}`,at:x.releasedDate,txt:"",wp:l.remote?"remote":(l.hybrid?"hybrid":""),lvl:x.experienceLevel&&x.experienceLevel.id})});
    if(j.content.length<100)break}return out}
// Workday career sites: key is "tenant|wdN|Site"
export function wdAgo(s){s=String(s||"").toLowerCase();if(/today|just/.test(s))return 0;if(/yesterday/.test(s))return 1;const m=s.match(/(\d+)\+?\s*day/);return m?+m[1]:-1}
async function workday(key){const [ten,wd,site]=key.split("|");const host=`https://${ten}.${wd}.myworkdayjobs.com`,api=`${host}/wday/cxs/${ten}/${site}/jobs`;const co=pretty(key);const out=[];let total=Infinity;
  for(let off=0;off<Math.min(total,WD_CAP)&&Date.now()<DEADLINE;off+=20){const j=await getJSON(api,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appliedFacets:{},limit:20,offset:off,searchText:""})});
    if(!j||!Array.isArray(j.jobPostings))return off?out:null;if(off===0)total=j.total||0;if(!j.jobPostings.length)break;
    for(const x of j.jobPostings){if(!x.title||!x.externalPath)continue;const ago=wdAgo(x.postedOn);
      out.push({co,t:x.title,loc:x.locationsText||"",dept:"",url:host+"/"+site+x.externalPath,at:ago>=0?new Date(Date.now()-ago*864e5).toISOString():null,txt:"",wp:/remote/i.test(x.remoteType||"")?"remote":/hybrid/i.test(x.remoteType||"")?"hybrid":""})}}
  return out}

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
  if((m=u.match(/https?:\/\/([\w-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([\w-]+)/))&&!NOTSITE.test(m[3]))return"wd:"+m[1].toLowerCase()+"|"+m[2]+"|"+m[3];
  return null}
const isUS=l=>/\b(US|USA|U\.S\.|United States|America)\b|,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b|New York|San Francisco|Seattle|Austin|Boston|Chicago|Los Angeles|Atlanta|Denver|Miami/.test(l||"");

/* ---------- pack ---------- */
export const urlKey=u=>"u:"+String(u||"").replace(/[?#].*$/,"").replace(/\/[a-z]{2}-[A-Z]{2}\//,"/").replace(/^https?:\/\/(www\.)?/,"").replace(/\/+$/,"").toLowerCase();
const HINT=new Map();   // url -> level from lists that know it is new grad or intern
const LVS="iems";
const LOGO={};
export function pack(raw){const now=Date.now();const seen=new Set();const cos=[],coIx={},doms=[],locs=[],locIx={},pres=[],preIx={},srcs=[""],rows=[];
  for(const r of raw){if(!r||!r.t||!r.url||!r.co)continue;const co=String(r.co).trim();const t=strip(r.t).slice(0,120);if(!co||!t)continue;
    const uk=urlKey(r.url),k=(co+"|"+t+"|"+(r.loc||"")).toLowerCase();if(seen.has(uk)||seen.has(k))continue;seen.add(uk);seen.add(k);
    const at=r.at?Date.parse(r.at):NaN;if(!isNaN(at)&&now-at>1000*86400*120)continue; // skip roles older than 4 months
    const txt=r.txt||"";const fam=family(t,r.dept);let lv=level(t);const hl=r.lvl||HINT.get(uk);if(hl==="entry_level"&&lv!=="intern")lv="entry";if(hl==="internship")lv="intern";if(r.lvl==="entry_level"&&lv!=="intern")lv="entry";if(r.lvl==="internship")lv="intern";
    const p=r.pay||pay(txt);if(!(co in coIx)){coIx[co]=cos.length;cos.push(co);doms.push(domainOf(r.tok||"",r.url,co))}if(r.logo&&!LOGO[co])LOGO[co]=r.logo
    const loc=(r.loc||"").replace(/\s+/g," ").trim().slice(0,90);if(!(loc in locIx)){locIx[loc]=locs.length;locs.push(loc)}
    const cut=r.url.lastIndexOf("/")+1,pre=r.url.slice(0,cut);if(!(pre in preIx)){preIx[pre]=pres.length;pres.push(pre)}
    let si=0;if(r.src){si=srcs.indexOf(r.src);if(si<0){si=srcs.length;srcs.push(r.src)}}
    rows.push([coIx[co],t,locIx[loc],FAMS.indexOf(fam),LVS.indexOf(lv[0]),"rho".indexOf(workplace(loc,r.wp)[0]),isNaN(at)?0:Math.round(at/864e5),[preIx[pre],r.url.slice(cut)],p,skillsOf(t+" "+txt),minYears(txt),si,snippet(txt)])}
  // keep every intern, entry and 2 to 4 year role first, then US, then the newest senior roles
  const today=Math.round(now/864e5),score=r=>{const yrs=r[10],early=r[4]<=1||(r[4]===2&&(yrs<0||yrs<=4));return(early?0:r[4]===2?1:2)*1000+(isUS(locs[r[2]])||r[5]===0?0:300)+Math.min(299,r[6]?today-r[6]:60)};
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
  uniq(GH).forEach(t=>add("gh:"+t));uniq(LV).forEach(t=>add("lv:"+t));uniq(AS).forEach(t=>add("as:"+t));uniq(SR).forEach(t=>add("sr:"+t));WD.filter(Boolean).forEach(t=>add("wd:"+t,WD_NAMES[t]));
  Object.entries(cache).forEach(([k,v])=>{if(today-(v.d||0)<=21)add(k,v.n)});
  sim.disc.forEach(([u,n])=>add(boardOf(u),n));sim.out.forEach(r=>HINT.set(urlKey(r.url),r.lvl));
  for(const [k,n] of cand){const tok=k.slice(3);if(n&&!(tok in NAMES))DISC[tok]=n}
  const F={gh:greenhouse,lv:lever,as:ashby,sr:smart,wd:workday};
  const order=["gh","lv","as","sr","wd"],tasks=[...cand.keys()].sort((a,b)=>order.indexOf(a.slice(0,2))-order.indexOf(b.slice(0,2)));
  const ok={};const apis=Promise.all([muse(),arbeitnow(),himalayas(),remotive(),jobicy(),adzuna()].map(p=>p.catch(()=>[])));
  const res=await pool(tasks,24,async k=>{const r=await F[k.slice(0,2)](k.slice(3));if(r&&r.length){ok[k]=r.length;return r}return[]});
  const api=await apis;const raw=[...res.flat(),...sim.out,...api.flat()];const out=pack(raw);
  const prev=readJSON(OUT+"/index.json");
  if(out.rows.length<500||(prev&&prev.rows&&out.rows.length<prev.rows.length*0.4)){console.log("Too few jobs fetched ("+out.rows.length+"), keeping the last good files.");process.exitCode=0;return}
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
if(process.argv[1]&&process.argv[1].endsWith("fetch-jobs.mjs"))main();
