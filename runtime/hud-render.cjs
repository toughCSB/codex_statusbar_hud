'use strict';

// Responsive port of the YAS 3-row HUD. Wide terminals keep the exact classic layout;
// narrower terminals progressively compact segments so nothing breaks at any width.
const rgb=(r,g,b)=>[r,g,b];
const dark={frame:[rgb(55,225,115),rgb(250,200,55),rgb(190,120,255)],divider:rgb(90,102,128),muted:rgb(162,174,202),text:rgb(198,208,232),cwd:rgb(115,220,255),arrow:rgb(85,215,255),git:rgb(0,240,115),branch:rgb(150,235,165),session:rgb(215,130,255),sessionLabel:rgb(155,140,205),week:rgb(220,175,255),empty:rgb(88,96,118),stops:[rgb(45,220,100),rgb(165,235,55),rgb(250,215,45),rgb(255,145,40),rgb(245,75,105),rgb(195,95,245)],ctx:rgb(130,205,255),input:[rgb(255,226,90),rgb(140,205,225),rgb(120,235,235)],cache:[rgb(255,195,80),rgb(225,185,125),rgb(255,220,135)],output:[rgb(255,120,180),rgb(225,160,195),rgb(255,160,210)]};
const light={frame:[rgb(14,148,68),rgb(195,118,8),rgb(128,42,205)],divider:rgb(135,145,168),muted:rgb(78,88,112),text:rgb(42,52,74),cwd:rgb(8,88,162),arrow:rgb(10,112,185),git:rgb(12,142,64),branch:rgb(18,118,58),session:rgb(138,38,210),sessionLabel:rgb(95,72,148),week:rgb(102,32,178),empty:rgb(168,178,198),stops:[rgb(18,168,74),rgb(108,175,16),rgb(205,142,8),rgb(222,88,16),rgb(212,36,72),rgb(142,42,202)],ctx:rgb(12,102,175),input:[rgb(182,112,6),rgb(14,108,138),rgb(8,122,145)],cache:[rgb(192,98,8),rgb(148,82,18),rgb(172,92,6)],output:[rgb(198,28,105),rgb(152,42,98),rgb(178,24,102)]};
const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,'');
function isLightTheme(override,theme,backgroundLight=false){
 const forced=String(override??'').trim().toLowerCase();if(forced==='light')return true;if(forced==='dark')return false;
 return backgroundLight||/light|day|latte|dawn|lotus|alabaster/i.test(String(theme??''));
}
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
function graphemeWidth(g){
 if(!g || /^[\p{Mark}\u200d\ufe0f]+$/u.test(g))return 0;
 if(/\p{Extended_Pictographic}/u.test(g))return 2;
 const cp=g.codePointAt(0);
 return cp>=0x1100&&(cp<=0x115f||cp===0x2329||cp===0x232a||cp>=0x2e80&&cp<=0xa4cf||cp>=0xac00&&cp<=0xd7a3||cp>=0xf900&&cp<=0xfaff||cp>=0xfe10&&cp<=0xfe6f||cp>=0xff00&&cp<=0xff60||cp>=0xffe0&&cp<=0xffe6||cp>=0x20000&&cp<=0x3fffd)?2:1;
}
function width(s){let n=0;for(const x of segmenter.segment(s))n+=graphemeWidth(x.segment);return n;}
function truncate(s,max){
 const str=clean(s);if(max<=0)return '';if(width(str)<=max)return str;if(max===1)return '…';
 let out='',used=0;
 for(const {segment} of segmenter.segment(str)){
  const w=graphemeWidth(segment);
  if(used+w>max-1)break;
  out+=segment;used+=w;
 }
 return out+'…';
}
const span=(text,fg,bold=false,bg=null,italic=false)=>({text:clean(text),fg,bold,bg,italic});
const spanWidth=a=>a.reduce((n,x)=>n+width(x.text),0);
const mix=(a,b,t)=>a.map((x,i)=>Math.round(x+(b[i]-x)*t));
function gradient(stops,t){const x=Math.max(0,Math.min(1,t))*(stops.length-1),i=Math.min(Math.floor(x),stops.length-2);return mix(stops[i],stops[i+1],x-i);}
function bar(pct,count,p){const filled=Math.round(Math.max(0,Math.min(100,pct??0))*count/100);return Array.from({length:count},(_,i)=>span(i<filled?'█':'░',i<filled?gradient(p.stops,i/Math.max(1,count-1)):p.empty));}
function compact(value){const n=Math.max(0,Number(value)||0);if(n<1000)return String(Math.floor(n));let d=1e3,s='K';if(n>=1e12){d=1e12;s='T';}else if(n>=1e9){d=1e9;s='B';}else if(n>=1e6){d=1e6;s='M';}const v=n/d,precision=v<10?2:v<100?1:0;return v.toFixed(precision).replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1')+s;}
function formatCost(n){if(!Number.isSafeInteger(n)||n<0)return null;if(n>0&&n<100)return `~$0.${String(n).padStart(6,'0')}`;if(n>0&&n<10000)return `~$0.${String(Math.floor((n+50)/100)).padStart(4,'0')}`;const cents=Math.floor((n+5000)/10000);return `~$${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;}
function shortEffort(effort){
 const e=clean(effort).toLowerCase();
 return ({xhigh:'xh',high:'hi',medium:'med',minimal:'min',default:'def',persistent:'per',ultra:'ult'})[e]??e;
}
function shortPermission(perm){
 if(perm==='Full Access')return 'Full';
 if(perm==='Workspace')return 'Work';
 if(perm==='Read Only')return 'RO';
 return perm?truncate(perm,8):'--';
}
function pill(model,effort,{tight=false,maxText=null}={}){
 const e=clean(effort).toLowerCase();let a,b;
 if(e.includes('xhigh')||e.includes('max'))[a,b]=[rgb(240,130,255),rgb(105,220,255)];
 else if(e.includes('high'))[a,b]=[rgb(255,200,75),rgb(255,130,175)];
 else if(e.includes('med'))[a,b]=[rgb(85,230,155),rgb(100,205,255)];
 else [a,b]=[rgb(125,205,245),rgb(160,175,255)];
 let mText=clean(model);
 let eText=clean(effort);
 if(maxText!==null){
  const pad=tight?2:4; // "✦ " vs " ✦  "
  const efStr=eText?` (${eText})`:'';
  if(width(mText)+width(efStr)+pad>maxText){
   const shortE=eText?shortEffort(eText):'';
   const shortEfStr=shortE?` (${shortE})`:'';
   if(width(mText)+width(shortEfStr)+pad<=maxText)eText=shortE;
   else if(maxText-pad-width(shortEfStr)>=5){eText=shortE;mText=truncate(mText,maxText-pad-width(shortEfStr));}
   else {eText='';mText=truncate(mText,Math.max(2,maxText-pad));}
  }
 }
 const prefix=tight?`✦ ${mText}`:` ✦ ${mText}`;
 const suffix=eText?(tight?` (${eText})`:` (${eText}) `):(tight?'':' ');
 const chars=Array.from(prefix+suffix),n=Array.from(prefix).length;
 return [span('▐',a),...chars.map((c,i)=>span(c,rgb(16,18,26),true,mix(a,b,i/Math.max(1,chars.length-1)),i>=n)),span('▌',b)];
}
function threshold(v,isLight){v=Math.max(0,Math.min(100,v??0));return isLight?(v<50?rgb(14,142,64):v<80?rgb(192,112,8):rgb(208,32,58)):(v<50?rgb(65,230,125):v<80?rgb(255,205,75):rgb(255,100,115));}
function permissionColor(v,isLight){return v==='Full Access'?(isLight?rgb(198,72,12):rgb(255,155,85)):v==='Workspace'?(isLight?rgb(12,135,92):rgb(95,225,175)):v==='Read Only'?(isLight?rgb(14,102,182):rgb(120,195,255)):(isLight?rgb(112,48,185):rgb(210,190,255));}
function stateColor(v,isLight){return ({Ready:isLight?rgb(14,142,64):rgb(65,230,125),Working:isLight?rgb(8,118,178):rgb(80,225,255),Thinking:isLight?rgb(185,112,8):rgb(255,210,75),Waiting:isLight?rgb(198,78,14):rgb(255,150,65),Starting:isLight?rgb(18,102,178):rgb(140,200,255)})[v]??(isLight?rgb(18,108,175):rgb(140,215,255));}

function buildRow1(d,cols,maxCols,p,isLight){
 const avail=Math.max(0,cols-4),ultra=avail<62;
 const sep=maxCols>=64?' │ ':'│';
 const cwdRaw=clean(d.cwd||'--');
 const branchRaw=clean(d.branch||'');
 const gitSumRaw=clean(d.gitSummary||'');
 const rawId=clean(d.sessionId||'new-session');
 const badgeRaw=clean(d.badge||'');

 // Preserve full CWD whenever possible; only truncate CWD if CWD alone exceeds maxCols.
 const leadWidth=5; // "╭─ ▸ "
 const cwdMax=Math.max(1,maxCols-leadWidth);
 const cwdText=width(cwdRaw)<=cwdMax?cwdRaw:truncate(cwdRaw,cwdMax);
 const row1=[span('╭─ ',p.frame[0],true),span('▸ ',p.arrow,true),span(cwdText,p.cwd,true)];

 const idFull=rawId;
 const idMid=rawId.length<=16?rawId:`${rawId.slice(0,8)}…${rawId.slice(-4)}`;
 const idShort=rawId.length<=8?rawId:rawId.slice(0,8);
 const idMin=rawId.length<=6?rawId:rawId.slice(0,6);

 // Decide git branch inclusion while leaving room for at least a short session ID if possible.
 const minIdReserve=width(sep)+2+width(idShort); // sep + "◈ " + idShort
 if(branchRaw){
  const gitPrefix=maxCols>=64?'  ∈ ':' ∈ ';
  const availForGit=maxCols-spanWidth(row1)-minIdReserve;
  if(availForGit>=width(gitPrefix)+width(branchRaw)){
   row1.push(span(gitPrefix,p.git,true),span(branchRaw,p.branch,true));
   if(!ultra&&gitSumRaw&&spanWidth(row1)+1+width(gitSumRaw)+minIdReserve<=maxCols){
    row1.push(span(` ${gitSumRaw}`,p.frame[0]));
   }
  }else if(availForGit>=width(gitPrefix)+6){
   row1.push(span(gitPrefix,p.git,true),span(truncate(branchRaw,availForGit-width(gitPrefix)),p.branch,true));
  }
 }

 // Pick the most detailed session ID that fits inside maxCols (wide uses exact classic rules).
 const remAfterGit=maxCols-spanWidth(row1);
 const withIdLabel=!ultra&&avail>=96&&width(sep)+5+width(idFull)<=remAfterGit;
 const withFull=!ultra&&width(sep)+2+width(idFull)<=remAfterGit;
 if(withIdLabel){
  row1.push(span(sep,p.divider),span('◈ ',p.session,true),span('ID ',p.sessionLabel,true),span(idFull,p.text));
 }else if(withFull){
  row1.push(span(sep,p.divider),span('◈ ',p.session,true),span(idFull,p.text));
 }else if(width(sep)+2+width(idMid)<=remAfterGit){
  row1.push(span(sep,p.divider),span('◈ ',p.session,true),span(idMid,p.text));
 }else if(width(sep)+2+width(idShort)<=remAfterGit){
  row1.push(span(sep,p.divider),span('◈ ',p.session,true),span(idShort,p.text));
 }else if(width(sep)+1+width(idMin)<=remAfterGit){
  row1.push(span(sep,p.divider),span('◈',p.session,true),span(idMin,p.text));
 }else if(width(sep)+width(idMin)<=remAfterGit){
  row1.push(span(sep,p.divider),span(idMin,p.text));
 }

 if(badgeRaw&&spanWidth(row1)+width(sep)+width(badgeRaw)<=maxCols){
  row1.push(span(sep,p.divider),span(badgeRaw,isLight?rgb(172,96,8):rgb(255,215,125)));
 }
 return row1;
}

function buildRow2(d,cols,maxCols,p,isLight,total){
 const avail=Math.max(0,cols-4);
 const model=clean(d.model||'--'),effort=clean(d.effort||'');
 const fastColor=isLight?rgb(185,105,6):rgb(255,220,75);
 const permFull=clean(d.permissions||'--');
 const permShort=shortPermission(d.permissions);
 const marks={Ready:'● Ready',Working:'⠋ Working',Thinking:'◐ Thinking',Waiting:'◌ Waiting',Starting:'✦ Starting'};
 const icons={Ready:'●',Working:'⠋',Thinking:'◐',Waiting:'◌',Starting:'✦'};
 const stateFull=marks[d.status]??(d.status?`● ${clean(d.status)}`:'● --');
 const stateIcon=icons[d.status]??'●';
 const pct=Number.isFinite(d.contextPercent)?Math.max(0,Math.min(100,d.contextPercent)):null;
 const pctText=pct===null?'--%':`${Math.round(pct)}%`;
 const ratio=d.window>0&&total!==null?` (${compact(total)}/${compact(d.window)})`:null;

 const assemble=({sep,showPermLabel,permText,stateText,fastText,ctxPrefix,tightPill,pillEffort,pillMax})=>{
  const r=[span('├─ ',p.frame[1],true),...pill(model,pillEffort,{tight:tightPill,maxText:pillMax})];
  if(d.fast&&fastText)r.push(span(fastText,fastColor,true));
  if(permText!==null){
   r.push(span(sep,p.divider));
   if(showPermLabel)r.push(span('PERM ',p.muted,true));
   r.push(span(permText,permissionColor(d.permissions,isLight),true));
  }
  if(stateText!==null)r.push(span(sep,p.divider),span(stateText,stateColor(d.status,isLight),true));
  if(ctxPrefix!==null)r.push(span(sep,p.divider),span(ctxPrefix,p.ctx,true));
  else r.push(span(' ',p.divider));
  const space=maxCols-spanWidth(r)-width(pctText);
  const segs=ctxPrefix!==null?(space>=9?8:space>=5?4:0):0;
  if(segs)r.push(...bar(pct,segs,p),span(' ',p.muted));
  r.push(span(pctText,threshold(pct,isLight),true));
  if(ratio&&ctxPrefix!==null&&spanWidth(r)+width(ratio)<=maxCols)r.push(span(ratio,p.muted));
  return r;
 };

 const candidates=[
  // Classic wide/standard tiers (identical to original at >= 96 cols)
  ...(avail>=96?[{sep:' │ ',showPermLabel:true,permText:permFull,stateText:stateFull,fastText:' ✦Fast',ctxPrefix:'CTX ',tightPill:false,pillEffort:effort,pillMax:null}]:[]),
  {sep:' │ ',showPermLabel:false,permText:permFull,stateText:stateFull,fastText:' ✦Fast',ctxPrefix:'CTX ',tightPill:false,pillEffort:effort,pillMax:null},
  {sep:'│',showPermLabel:false,permText:permFull,stateText:stateFull,fastText:' ✦Fast',ctxPrefix:'CTX ',tightPill:false,pillEffort:effort,pillMax:null},
  // Narrow tiers: progressively compact fast tag, effort, permissions, state, pill
  {sep:'│',showPermLabel:false,permText:permShort,stateText:stateFull,fastText:' ✦',ctxPrefix:'CTX ',tightPill:false,pillEffort:shortEffort(effort),pillMax:null},
  {sep:'│',showPermLabel:false,permText:permShort,stateText:stateFull,fastText:'✦',ctxPrefix:'CTX ',tightPill:true,pillEffort:shortEffort(effort),pillMax:null},
  {sep:'│',showPermLabel:false,permText:permShort,stateText:stateIcon,fastText:'✦',ctxPrefix:'CTX ',tightPill:true,pillEffort:shortEffort(effort),pillMax:null},
  {sep:'│',showPermLabel:false,permText:null,stateText:stateIcon,fastText:'✦',ctxPrefix:'CTX ',tightPill:true,pillEffort:shortEffort(effort),pillMax:null},
  {sep:'│',showPermLabel:false,permText:null,stateText:stateIcon,fastText:'',ctxPrefix:'',tightPill:true,pillEffort:shortEffort(effort),pillMax:null},
 ];
 for(const cfg of candidates){
  const built=assemble(cfg);
  if(spanWidth(built)<=maxCols)return built;
 }
 // Ultra-narrow fallback (e.g. 20..34 cols): truncate model cleanly inside pill so caps & CTX% stay intact.
 const reserveForTail=1+width(stateIcon)+1+width(pctText);
 const pillBudget=Math.max(6,maxCols-3-reserveForTail-2); // 3 for "├─ ", 2 for "▐▌"
 const compactRow=assemble({sep:'│',showPermLabel:false,permText:null,stateText:stateIcon,fastText:'',ctxPrefix:'',tightPill:true,pillEffort:shortEffort(effort),pillMax:pillBudget});
 if(spanWidth(compactRow)<=maxCols)return compactRow;
 const tinyBudget=Math.max(4,maxCols-3-1-width(pctText)-2);
 return assemble({sep:'│',showPermLabel:false,permText:null,stateText:null,fastText:'',ctxPrefix:null,tightPill:true,pillEffort:'',pillMax:tinyBudget});
}

function buildRow3(d,cols,maxCols,p,isLight,input,cached,output,total){
 const avail=Math.max(0,cols-4),ultra=avail<62;
 const weekly=Number.isFinite(d.weeklyPercent)?Math.max(0,Math.min(100,d.weeklyPercent)):null;
 const inText=input===null?'--':compact(input);
 const cacheText=cached===null?'--':compact(cached);
 const outText=output===null?'--':compact(output);
 const totalText=total===null?'--':compact(total);
 const hit=input!==null&&cached!==null?` (${input>0?Math.max(0,Math.min(100,Math.round(cached/input*100))):0}%)`:null;
 const usd=formatCost(d.usdMicros);

 const assemble=({weekLabel,weekSup,barCount,usedSuffix,sep,gap,inLbl,cacheLbl,outLbl,includeCache,includeOut,allowExtras})=>{
  const r=[span('╰─ ',p.frame[2],true),span(weekLabel,p.week,true)];
  if(weekSup)r.push(span(weekSup,p.muted));
  if(barCount>0)r.push(...bar(weekly,barCount,p));
  const wText=weekly===null?' --%':(usedSuffix?` ${Math.round(weekly)}% used`:` ${Math.round(weekly)}%`);
  r.push(span(wText,weekly===null?p.muted:threshold(weekly,isLight),weekly!==null));
  r.push(span(sep,p.divider),span('↓',p.input[0],true));
  if(inLbl)r.push(span(inLbl,p.input[1],true));
  r.push(span(inText,p.input[2],true));
  if(includeCache){
   r.push(span(gap,p.divider),span('⊂',p.cache[0],true));
   if(cacheLbl)r.push(span(cacheLbl,p.cache[1],true));
   r.push(span(cacheText,p.cache[2],true));
   if(allowExtras&&hit&&!ultra&&includeOut&&spanWidth(r)+width(hit)+gap.length+1+width(outLbl)+width(outText)<=maxCols){
    r.push(span(hit,p.muted));
   }
  }
  if(includeOut){
   r.push(span(gap,p.divider),span('↑',p.output[0],true));
   if(outLbl)r.push(span(outLbl,p.output[1],true));
   r.push(span(outText,p.output[2],true));
  }
  if(allowExtras&&!ultra&&spanWidth(r)+gap.length+2+width(totalText)<=maxCols){
   r.push(span(`${gap}Σ `,p.frame[2],true),span(totalText,p.text,true));
  }
  if(allowExtras&&usd&&spanWidth(r)+width(sep)+width(usd)<=maxCols){
   r.push(span(sep,p.divider),span(usd,isLight?rgb(195,36,58):rgb(255,145,145),true));
  }
  return r;
 };

 const baseCount=avail>=92?16:avail>=76?12:avail>=66?10:8;
 const baseGap=avail>=92?'  ':' ';
 const candidates=[
  // Classic wide/standard layout (identical at normal widths)
  {weekLabel:'WEEK',weekSup:ultra?' ':'⁷ᵈ ',barCount:baseCount,usedSuffix:true,sep:' │ ',gap:baseGap,inLbl:'IN ',cacheLbl:'CACHE ',outLbl:'OUT ',includeCache:true,includeOut:true,allowExtras:true},
  // Medium-narrow: step down bar length & spacing while keeping full labels
  {weekLabel:'WEEK',weekSup:' ',barCount:6,usedSuffix:true,sep:' │ ',gap:' ',inLbl:'IN ',cacheLbl:'CACHE ',outLbl:'OUT ',includeCache:true,includeOut:true,allowExtras:false},
  {weekLabel:'WEEK',weekSup:' ',barCount:4,usedSuffix:false,sep:'│',gap:' ',inLbl:'IN ',cacheLbl:'CACHE ',outLbl:'OUT ',includeCache:true,includeOut:true,allowExtras:false},
  {weekLabel:'WEEK',weekSup:' ',barCount:4,usedSuffix:false,sep:'│',gap:' ',inLbl:'IN ',cacheLbl:'C ',outLbl:'OUT ',includeCache:true,includeOut:true,allowExtras:false},
  // Narrow: compact labels and bar so all 4 core metrics (WEEK, IN, CACHE, OUT) remain visible
  {weekLabel:'W7d',weekSup:' ',barCount:4,usedSuffix:false,sep:'│',gap:' ',inLbl:'',cacheLbl:'',outLbl:'',includeCache:true,includeOut:true,allowExtras:false},
  {weekLabel:'W',weekSup:'',barCount:0,usedSuffix:false,sep:'│',gap:' ',inLbl:'',cacheLbl:'',outLbl:'',includeCache:true,includeOut:true,allowExtras:false},
  // Extreme narrow (< 28 cols): WEEK + IN + OUT, then WEEK + IN
  {weekLabel:'W',weekSup:'',barCount:0,usedSuffix:false,sep:'│',gap:' ',inLbl:'',cacheLbl:'',outLbl:'',includeCache:false,includeOut:true,allowExtras:false},
  {weekLabel:'W',weekSup:'',barCount:0,usedSuffix:false,sep:' ',gap:' ',inLbl:'',cacheLbl:'',outLbl:'',includeCache:false,includeOut:false,allowExtras:false},
 ];
 for(const cfg of candidates){
  const built=assemble(cfg);
  if(spanWidth(built)<=maxCols)return built;
 }
 return assemble(candidates[candidates.length-1]);
}

function layout(d,cols,isLight=false){
 const p=isLight?light:dark;
 const maxCols=Math.max(1,cols-1);
 const input=Number.isFinite(d.input)?Math.max(0,d.input):null;
 const cached=Number.isFinite(d.cached)?Math.max(0,d.cached):null;
 const output=Number.isFinite(d.output)?Math.max(0,d.output):null;
 const total=input===null||cached===null||output===null?null:Math.max(0,input-cached)+output;
 return [
  buildRow1(d,cols,maxCols,p,isLight),
  buildRow2(d,cols,maxCols,p,isLight,total),
  buildRow3(d,cols,maxCols,p,isLight,input,cached,output,total),
 ];
}
function ansi(spans,maxCols){let out='',used=0;for(const s of spans){for(const {segment} of segmenter.segment(s.text)){const w=graphemeWidth(segment);if(used+w>maxCols)return out+'\x1b[0m';let codes=['0'];if(s.bold)codes.push('1');if(s.italic)codes.push('3');codes.push('38','2',...s.fg.map(String));if(s.bg)codes.push('48','2',...s.bg.map(String));out+=`\x1b[${codes.join(';')}m${segment}`;used+=w;}}return out+'\x1b[0m';}
module.exports={layout,ansi,width,compact,clean,isLightTheme,formatCost,truncate};
