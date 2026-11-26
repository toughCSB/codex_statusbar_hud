'use strict';
const fullId=/^\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\s*·|\s*(?:…|\.\.\.)\s*$)/i;
const modelRe=/^(.*?)\s+(default|none|minimal|low|medium|high|xhigh|max|ultra|persistent)(?:\s+(fast|priority|flex))?$/i;
const knownField=/^(?:Full Access|Workspace|Read Only|Ready|Working|Thinking|Waiting|Starting|Context\s+\d{1,3}%\s+used|weekly\s+\d{1,3}%\s+left|\d+(?:\.\d+)?[KMBT]?\s+window|Tasks\s+\d+\/\d+|PR\s+#\d+)$/i;
const knownPrefixes=['full access','workspace','read only','ready','working','thinking','waiting','starting','context ','weekly ','tasks ','pr #'];

function matchesKnownOrTruncated(item){
 if(knownField.test(item))return true;
 if(item.endsWith('…')||item.endsWith('...')){
  const stem=item.replace(/(?:…|\.\.\.)+$/,'').trim().toLowerCase();
  if(stem.length>=2&&knownPrefixes.some(p=>p.startsWith(stem)||stem.startsWith(p)))return true;
  if(/^\d+(?:\.\d+)?[kmbt]?\s+win/i.test(stem))return true;
 }
 return false;
}

function parseFields(parts,startIndex,result,hasModel){
 if(hasModel&&parts[startIndex]&&!parts[startIndex].includes('…')&&!parts[startIndex].endsWith('...')&&!/^(Ready|Working|Thinking|Waiting|Starting|Context\s|weekly\s|Tasks\s|PR\s|\d+(?:\.\d+)?[KMBT]?\s+window)/i.test(parts[startIndex])){
  // Avoid mistaking trailing agent descriptors like "Main [default]" for a custom permission profile.
  if(!/\[[^\]]+\]$/.test(parts[startIndex]))result.permissions=parts[startIndex];
 }
 for(const item of parts.slice(startIndex)){
  if(!item||item.includes('…')||item.endsWith('...'))continue;
  if(['Full Access','Workspace','Read Only'].includes(item))result.permissions=item;
  if(['Ready','Working','Thinking','Waiting','Starting'].includes(item))result.status=item;
  let x=/^Context\s+(\d{1,3})%\s+used$/i.exec(item);if(x&&Number(x[1])<=100)result.contextPercent=Number(x[1]);
  x=/^weekly\s+(\d{1,3})%\s+left$/i.exec(item);if(x&&Number(x[1])<=100)result.weeklyRemaining=Number(x[1]);
  x=/^(\d+(?:\.\d+)?)([KMBT]?)\s+window$/i.exec(item);if(x){const scale={K:1e3,M:1e6,B:1e9,T:1e12}[x[2].toUpperCase()]??1;result.contextWindow=Number(x[1])*scale;}
  x=/^PR\s+#(\d+)$/i.exec(item);if(x)result.pullRequest=Number(x[1]);
  if(/^Tasks\s+\d+\/\d+$/i.test(item))result.badge=`✦ ${item}`;
 }
 return result;
}

function parseStatus(line){
 const raw=String(line??'').split(/\s{2,}⚠/u)[0];
 const match=fullId.exec(raw);if(!match)return null;
 const trimmed=raw.trim();
 if(!trimmed.includes('·')){
  // Narrow inline truncation immediately after a complete UUID: "<uuid> …"
  return {sessionId:match[1],model:null,effort:null,fast:false,permissions:null,status:null,contextPercent:null,contextWindow:null,weeklyRemaining:null,badge:null,branch:null,pullRequest:null};
 }
 const parts=trimmed.split('·').map(s=>s.trim());if(parts.length<2||parts[0].toLowerCase()!==match[1].toLowerCase())return null;
 const m=modelRe.exec(parts[1]);
 const result={sessionId:match[1],model:m?.[1]??null,effort:m?.[2]??null,fast:m?.[3]?.toLowerCase()==='fast',permissions:null,status:null,contextPercent:null,contextWindow:null,weeklyRemaining:null,badge:null,branch:null,pullRequest:null};
 return parseFields(parts,2,result,Boolean(m));
}

function parseStartupStatus(line){
 const raw=String(line??'').split(/\s{2,}⚠/u)[0].trim();
 if(!raw||!raw.includes('·'))return null;
 const parts=raw.split('·').map(s=>s.trim());if(parts.length<2)return null;
 const m=modelRe.exec(parts[0]);if(!m||!m[1]||m[1].length>64)return null;
 // Require at least one explicit (or truncated) native Codex status field so transcript prose never matches.
 if(!parts.slice(1).some(matchesKnownOrTruncated))return null;
 const result={sessionId:null,partial:true,model:m[1],effort:m[2],fast:m[3]?.toLowerCase()==='fast',permissions:null,status:null,contextPercent:null,contextWindow:null,weeklyRemaining:null,badge:null,branch:null,pullRequest:null};
 return parseFields(parts,1,result,true);
}

module.exports={parseStatus,parseStartupStatus};
