'use strict';
const {parseStartupStatus}=require('./hud-status.cjs');

const composerPrompt=/^\s?[›❯]\s/;
const truncatedUuid=/^\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{0,4}(?:-[0-9a-f]{0,4})?(?:-[0-9a-f]{0,12})?)\s*(?:…|\.\.\.)\s*$/i;
const statusFieldToken=/\b(?:Full Access|Workspace|Read Only|Ready|Working|Thinking|Waiting|Starting|Context\s+\d{1,3}%|weekly\s+\d{1,3}%|\d+(?:\.\d+)?[KMBT]?\s+window|Tasks\s+\d+\/\d+|PR\s+#\d+)\b/i;
const helpLineRe=/^\s*(?:←\s*for\s+|→\s*for\s+|\?\s*(?:for\s+|\/\s*esc\b)|esc\s+(?:to\s+|close\b|again\b)|ctrl\+|alt\+|shift\+|tab\s+|enter\s+|↑|↓|⚠\s*\d|press\s+|use\s+|type\s+)/i;
const helpHintToken=/(?:\?\s*for\s+shortcuts|←\s*for\s+agents|\?\s*\/\s*esc\s+close|ctrl\+c\s+again|f2\s+to\s+view)/i;

function isHelpRow(line){
 const t=String(line??'').trim();
 if(!t||composerPrompt.test(line))return false;
 // Never classify a row carrying status fields or starting with a UUID as a help row.
 if(/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t))return false;
 if(statusFieldToken.test(t)&&!helpHintToken.test(t))return false;
 return helpLineRe.test(line)||helpHintToken.test(t);
}

function joinWrapped(lines){
 let out='';
 for(const raw of lines){
  const part=String(raw??'').trim();
  if(!part)continue;
  if(!out){out=part;continue;}
  // Codex/ratatui breaks hyphenated tokens (UUIDs, model names like GPT-6.2-Astra)
  // across lines directly after '-' without inserting a space.
  if(out.endsWith('-'))out+=part;
  else out+=' '+part;
 }
 return out;
}

function makePartialFromPrefix(prefix,titleMeta,resolvedTitleId){
 const id=titleMeta?.sessionId??resolvedTitleId??null;
 const matchId=id&&id.toLowerCase().startsWith(prefix.toLowerCase())?id:null;
 return {
  sessionId:matchId??prefix,
  partial:!matchId,
  model:null,effort:null,fast:false,permissions:null,status:null,
  contextPercent:null,contextWindow:null,weeklyRemaining:null,badge:null,branch:null,pullRequest:null,
 };
}

// Only select the composer's final status surface, never a transcript lookalike.
function findFooter({childRows,totalRows,getText,parseStatus,titleMeta,resolvedTitleId}) {
 // Inline Codex leaves unused viewport rows below the composer. In the alternate
 // screen the footer is at the bottom. Locate the final contiguous non-empty block.
 let end=childRows-1;
 while(end>=0&&!getText(end).trim())end--;
 if(end<0)return null;

 const minStart=Math.max(0,end-10);
 let blockStart=end;
 while(blockStart>minStart&&getText(blockStart-1).trim())blockStart--;

 // Separate trailing help/hint/warning row(s) (0..2 rows) from the status rows.
 let statusEnd=end;
 while(statusEnd>blockStart&&end-statusEnd<2&&isHelpRow(getText(statusEnd)))statusEnd--;

 // If there is a composer prompt at or below any candidate row, it is not a footer.
 const hasComposerAfter=row=>{
  for(let r=row;r<=end;r++)if(composerPrompt.test(getText(r)))return true;
  return false;
 };

 const buildResult=(row,status,sEnd)=>{
  if(!status||row+3>=totalRows)return null;
  const helpRows=[];
  for(let r=sEnd+1;r<=end;r++)if(getText(r).trim())helpRows.push(r);
  const rawStatusLines=[];
  for(let r=row;r<=sEnd;r++)rawStatusLines.push(getText(r));
  return {
   row,
   statusEnd:sEnd,
   end,
   status,
   helpRow:helpRows.length?helpRows[0]:null,
   helpRows,
   inlineWarning:rawStatusLines.some(line=>/\s{2,}⚠/u.test(line)),
  };
 };

 // Candidate start rows inside the final contiguous block (skip any composer prompt rows).
 let firstCandidate=blockStart;
 for(let r=blockStart;r<=end;r++)if(composerPrompt.test(getText(r)))firstCandidate=r+1;
 if(firstCandidate>end)return null;

 // Try statusEnd first (with trailing help stripped), then fall back to end if statusEnd < end
 // and nothing matched (in case a single-row status had an unrecognized help row below it).
 const candidateEnds=statusEnd<end?[statusEnd,end]:[statusEnd];

 for(const sEnd of candidateEnds){
  for(let i=firstCandidate;i<=sEnd;i++){
   if(hasComposerAfter(i))continue;
   const slice=[];
   for(let r=i;r<=sEnd;r++)slice.push(getText(r));
   const joined=joinWrapped(slice);
   if(!joined)continue;

   // 1. Full UUID status line (single-line or multi-line wrapped, including split UUIDs).
   let status=parseStatus(joined);
   if(status)return buildResult(i,status,sEnd);

   // 2. Title-metadata session prefix fallback (handles truncated inline UUIDs / split prefixes).
   if(titleMeta?.sessionPrefix){
    const prefix8=titleMeta.sessionPrefix.slice(0,8).toLowerCase();
    if(joined.toLowerCase().startsWith(prefix8)){
     const id=titleMeta.sessionId??resolvedTitleId;
     status={sessionId:id??titleMeta.sessionPrefix.slice(0,8),partial:!id,model:null,effort:null,fast:false,permissions:null,status:null,contextPercent:null,contextWindow:null,weeklyRemaining:null,badge:null,branch:null,pullRequest:null};
     return buildResult(i,status,sEnd);
    }
   }

   // 3. Narrow inline truncated UUID without titleMeta (e.g. "01a21775-cf4a-7242-a55…").
   if(i===sEnd){
    const m=truncatedUuid.exec(slice[0]);
    if(m)return buildResult(i,makePartialFromPrefix(m[1],titleMeta,resolvedTitleId),sEnd);
   }

   // 4. Pre-session startup status line before UUID is assigned (e.g. "GPT-6.2-Astra default fast · Full Access · Ready ...").
   const startup=parseStartupStatus(joined);
   if(startup)return buildResult(i,startup,sEnd);
  }
 }

 return null;
}

module.exports={findFooter,joinWrapped,isHelpRow};
