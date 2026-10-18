import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export const QUERY = `query Profile($login: String!, $cursor: String) {
  user(login: $login) {
    login followers { totalCount }
    repositories(first: 50, after: $cursor, privacy: PUBLIC, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes { name url isFork stargazerCount forkCount primaryLanguage { name } }
    }
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

export async function queryGitHub(variables) {
  const payload = { query: QUERY, variables };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  let result;
  if (token) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ranjit-profile-cards' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}; retaining the previous cards.`);
    result = await response.json();
  } else {
    result = JSON.parse(execFileSync('gh', ['api', 'graphql', '--input', '-'], {
      input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));
  }
  if (result.errors?.length || !result.data?.user) throw new Error('GitHub did not return a complete profile; retaining the previous cards.');
  return result.data.user;
}

export async function fetchProfile(login, query = queryGitHub) {
  let cursor = null, profile, repositories = [];
  const seen = new Set();
  do {
    const page = await query({ login, cursor });
    profile ??= page;
    repositories.push(...page.repositories.nodes);
    if (!page.repositories.pageInfo.hasNextPage) break;
    cursor = page.repositories.pageInfo.endCursor;
    if (!cursor || seen.has(cursor)) throw new Error('Invalid repository pagination.');
    seen.add(cursor);
  } while (true);
  if (repositories.length !== profile.repositories.totalCount) throw new Error('Incomplete public repository list.');
  return { ...profile, repositories };
}

export function summarize(profile, now = new Date()) {
  const cal = profile.contributionsCollection.contributionCalendar;
  const days = cal.weeks.flatMap(w => w.contributionDays).sort((a,b) => a.date.localeCompare(b.date));
  if (!days.length || !Number.isInteger(cal.totalContributions)) throw new Error('Missing contribution data.');
  let activeDays = 0, longestStreak = 0, streak = 0, previous;
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isInteger(d.contributionCount) || d.contributionCount < 0) throw new Error('Invalid contribution day.');
    const time = Date.parse(d.date+'T00:00:00Z');
    if (previous !== undefined && time-previous !== 86400000) streak=0;
    streak = d.contributionCount > 0 ? streak+1 : 0;
    if (d.contributionCount>0) activeDays++;
    longestStreak=Math.max(longestStreak,streak); previous=time;
  }
  const own = profile.repositories.filter(r => !r.isFork);
  const languageCounts = new Map();
  for (const r of own) if (r.primaryLanguage) languageCounts.set(r.primaryLanguage.name,(languageCounts.get(r.primaryLanguage.name)||0)+1);
  const languages=[...languageCounts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  return {
    login:profile.login, updatedAt:now.toISOString(), followers:profile.followers.totalCount,
    publicRepositories:profile.repositories.length, stars:own.reduce((sum,r)=>sum+r.stargazerCount,0),
    contributions:cal.totalContributions, activeDays,longestStreak,start:days[0].date,end:days.at(-1).date,
    languages, languageRepositoryCount:languages.reduce((sum,l)=>sum+l.count,0),
    projects:profile.repositories.filter(r=>['github-profile-readme-generator'].includes(r.name)),
    weeks:cal.weeks,
  };
}

export const escapeXml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const C={bg:'#171522',fg:'#fff0df',pink:'#f39bb8',muted:'#c6adbc',line:'#6e3a54'};
const text=(s,x,y,size=22,color=C.fg,font='Arial, sans-serif',extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-family="${font}" ${extra}>${escapeXml(s)}</text>`;
const mono=(s,x,y,size=13,color=C.pink)=>text(s,x,y,size,color,'monospace','letter-spacing="1.2"');
const serif=(s,x,y,size=34)=>text(s,x,y,size,C.fg,'Georgia, serif');
const box=(x,y,w,h,fill='url(#panel)',r=16)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${C.line}"/>`;
const line=(x,y,x2,y2)=>`<path d="M${x} ${y} L${x2} ${y2}" stroke="${C.line}"/>`;
const title=(label,heading)=>mono(label,32,29,11)+serif(heading,32,73)+line(32,98,968,98)+`<circle cx="921" cy="98" r="3" fill="${C.pink}"/>`;
const svg=(h,name,description,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${h}" viewBox="0 0 1000 ${h}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(name)}</title><desc id="desc">${escapeXml(description)}</desc><defs><linearGradient id="panel" x1="0" y1="1" x2="1" y2="0"><stop stop-color="#251d30"/><stop offset=".6" stop-color="#432337"/><stop offset="1" stop-color="#852b50"/></linearGradient></defs><rect width="1000" height="${h}" fill="${C.bg}"/>${body}</svg>\n`;
const stamp=s=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s.updatedAt)).toUpperCase()+' IST';
const foot=(s,y)=>mono(`GITHUB API / UPDATED ${stamp(s)}`,32,y,12,C.muted);

export function render(s) {
  const files={};
  files['github-stats.svg']=svg(260,'Ranjit’s GitHub stats',`${s.publicRepositories} public repositories, ${s.followers} followers, ${s.stars} stars on owned public repositories. Updated ${stamp(s)}.`,
    title('GITHUB / AUTOMATICALLY UPDATED','The work, in numbers.')+
    [[s.publicRepositories,'PUBLIC REPOS'],[s.followers,'FOLLOWERS'],[s.stars,'STARS · OWN REPOS'],[s.contributions,'CONTRIBUTIONS / YEAR']].map(([v,l],i)=>box(32+i*238,120,222,99)+serif(v.toLocaleString('en-US'),49+i*238,169,39)+mono(l,49+i*238,199,10)).join('')+foot(s,247));
  let months='',cells='',lastMonth=''; const step=884/Math.max(s.weeks.length,1);
  const colors={NONE:'#332135',FIRST_QUARTILE:'#74314f',SECOND_QUARTILE:'#ae3b65',THIRD_QUARTILE:'#e36593',FOURTH_QUARTILE:'#ffd8df'};
  s.weeks.forEach((w,i)=>{
    const month=w.contributionDays[0]?.date.slice(0,7);
    if(month && month!==lastMonth && i<s.weeks.length-2){months+=mono(new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(new Date(w.contributionDays[0].date+'T00:00:00Z')),60+i*step,264,10,C.muted);lastMonth=month;}
    for(const d of w.contributionDays){const row=new Date(d.date+'T00:00:00Z').getUTCDay(); cells+=`<rect x="${60+i*step}" y="${282+row*16.7}" width="${step-4}" height="12.7" rx="3" fill="${colors[d.contributionLevel]||colors.NONE}"><title>${escapeXml(d.date)}: ${d.contributionCount} contributions</title></rect>`;}
  });
  files['activity.svg']=svg(463,'A year of contributions',`${s.contributions} contributions; ${s.activeDays} active days; longest streak ${s.longestStreak} days. ${s.start} to ${s.end}.`,
    title('04 / CONTRIBUTION LOG','A year, one contribution at a time.')+box(32,120,936,302)+
    [[s.contributions,'CONTRIBUTIONS'],[s.activeDays,'ACTIVE DAYS'],[s.longestStreak,'LONGEST STREAK']].map(([v,l],i)=>serif(v.toLocaleString('en-US'),60+i*300,176,41)+mono(l,60+i*300,207,11)).join('')+
    line(60,233,940,233)+months+cells+mono(`${s.start} — ${s.end} / ROLLING YEAR`,60,407,11,C.muted)+foot(s,449));
  const langs=s.languages.slice(0,6);
  files['languages.svg']=svg(314,'Primary languages across public repositories','Counts of primary repository languages, excluding forks and repositories without a detected language. This is not coding-time or code-byte usage.',
    title('REPOSITORY MIX / EXCLUDING FORKS','What I’m building with.')+
    (langs.length?langs.map((l,i)=>{const x=32+i%3*318,y=115+Math.floor(i/3)*77;return text(l.name,x,y+24,20)+mono(`${l.count} REPOS`,x+206,y+24,11)+box(x,y+44,290,7,'#332135',3)+`<rect x="${x}" y="${y+44}" width="${290*l.count/s.languageRepositoryCount}" height="7" rx="3" fill="${C.pink}"/>`;}).join(''):text('No detected repository languages yet.',32,202))+
    text('Primary language per public repository · counts, not coding time',32,295,15,C.muted));
  const config={'github-profile-readme-generator':{file:'readme-generator.svg',heading:'README Generator',label:'02 / OPEN SOURCE · DEVELOPER TOOLS',lines:['A simpler way to introduce yourself on GitHub.','Build a developer profile that feels like your own.']}};
  for(const [name,c] of Object.entries(config)){
    const p=s.projects.find(r=>r.name===name); if(!p) throw new Error(`Missing featured public repository: ${name}`);
    files[c.file]=svg(250,c.heading,`${c.lines.join(' ')} ${p.stargazerCount} stars, ${p.forkCount} forks, primary language ${p.primaryLanguage?.name||'not detected'}.`,box(32,4,936,226)+mono(c.label,55,37,11)+serif(c.heading,55,88,37)+c.lines.map((l,i)=>text(l,55,124+i*29,20,C.muted)).join('')+
      line(55,176,943,176)+mono(`${p.stargazerCount} STARS`,55,205,12)+mono(`${p.forkCount} FORKS`,208,205,12)+mono(p.primaryLanguage?.name||'UNSPECIFIED',350,205,12)+text('↗',891,77,32,C.pink));
  }
  return files;
}

async function main(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const profile=await fetchProfile(process.env.PROFILE_USERNAME||'Technicalranjitofficial');
  const summary=summarize(profile); const files=render(summary);
  let readme=await readFile(resolve(root,'README.md'),'utf8');
  for(const [name,body] of Object.entries(files)){
    const hash=createHash('sha256').update(body).digest('hex').slice(0,12);
    const ref=`assets/generated/${name}`;
    readme=readme.replaceAll(new RegExp(ref.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\?v=[a-f0-9]+)?','g'),`${ref}?v=${hash}`);
  }
  const description=`${summary.publicRepositories} public repositories · ${summary.followers} followers · ${summary.stars} stars on owned public repositories · ${summary.contributions} contributions in the rolling year · ${summary.activeDays} active days · ${summary.longestStreak}-day longest streak. Last fetched: ${stamp(summary)}.`;
  readme=readme.replace(/<!-- BEGIN DATA SUMMARY -->[\s\S]*?<!-- END DATA SUMMARY -->/,`<!-- BEGIN DATA SUMMARY -->\n${description}\n<!-- END DATA SUMMARY -->`);
  // Fetch, validate and render everything before updating any files.
  await mkdir(resolve(root,'assets/generated'),{recursive:true});
  await mkdir(resolve(root,'data'),{recursive:true});
  for(const [name,body] of Object.entries(files)) await writeFile(resolve(root,'assets/generated',name),body);
  await writeFile(resolve(root,'data/github-summary.json'),JSON.stringify(summary,null,2)+'\n');
  await writeFile(resolve(root,'README.md'),readme);
  console.log(`Updated ${Object.keys(files).length} cards for ${summary.login}: ${description}`);
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
