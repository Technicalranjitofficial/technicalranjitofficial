import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, fetchProfile, render, escapeXml } from './update-profile.mjs';
const repository=(name,stars=1,isFork=false,language='TypeScript')=>({name,isFork,stargazerCount:stars,forkCount:0,primaryLanguage:language?{name:language}:null});
const profile={login:'example',followers:{totalCount:7},repositories:[repository('nepalinotes',2),repository('github-profile-readme-generator',3,false,'JavaScript'),repository('fork',99,true),repository('empty',0,false,null)],contributionsCollection:{contributionCalendar:{totalContributions:8,weeks:[{contributionDays:[{date:'2026-01-01',contributionCount:2,contributionLevel:'FIRST_QUARTILE'},{date:'2026-01-02',contributionCount:3,contributionLevel:'SECOND_QUARTILE'},{date:'2026-01-03',contributionCount:0,contributionLevel:'NONE'},{date:'2026-01-04',contributionCount:3,contributionLevel:'SECOND_QUARTILE'}]}]}}};
test('counts active days and streaks; excludes forks from stars and language mix',()=>{
 const s=summarize(profile);assert.equal(s.activeDays,3);assert.equal(s.longestStreak,2);assert.equal(s.stars,5);assert.equal(s.publicRepositories,4);assert.equal(s.languageRepositoryCount,2);assert.equal(s.contributions,8);
});
test('a calendar gap breaks a streak',()=>{
 const p=structuredClone(profile);p.contributionsCollection.contributionCalendar.weeks[0].contributionDays=[{date:'2026-01-01',contributionCount:1},{date:'2026-01-03',contributionCount:1}];assert.equal(summarize(p).longestStreak,1);
});
test('all-zero calendar remains valid; missing data fails',()=>{
 const p=structuredClone(profile);p.contributionsCollection.contributionCalendar.totalContributions=0;p.contributionsCollection.contributionCalendar.weeks[0].contributionDays.forEach(d=>d.contributionCount=0);assert.equal(summarize(p).longestStreak,0);p.contributionsCollection.contributionCalendar.weeks=[];assert.throws(()=>summarize(p));
});
test('fetches every repository page and rejects incomplete lists',async()=>{
 let calls=0;const query=async({cursor})=>{calls++;return {...profile,repositories:{nodes:cursor?profile.repositories.slice(2):profile.repositories.slice(0,2),totalCount:4,pageInfo:{hasNextPage:!cursor,endCursor:'next'}}};};
 assert.equal((await fetchProfile('example',query)).repositories.length,4);assert.equal(calls,2);
 await assert.rejects(fetchProfile('example',async()=>({...profile,repositories:{nodes:[],totalCount:4,pageInfo:{hasNextPage:false}}})));
});
test('escapes API text and produces self-contained SVGs without invalid numbers',()=>{
 const p=structuredClone(profile);p.repositories[0].primaryLanguage.name='A<&"';const files=render(summarize(p,new Date('2026-10-18T10:00:00Z')));
 assert.equal(Object.keys(files).length,4);for(const file of Object.values(files)){assert.match(file,/^<svg /);assert.doesNotMatch(file,/NaN|Infinity|<script|<foreignObject|href=/);}assert.match(files['languages.svg'],/A&lt;&amp;&quot;/);assert.equal(escapeXml('<&'), '&lt;&amp;');
});
