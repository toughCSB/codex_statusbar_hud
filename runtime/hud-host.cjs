// Candidate interactive host; dependencies resolve only from its own installation tree.
const path=require('node:path');
const {StringDecoder}=require('node:string_decoder');
const {TerminalWriter,resetModes}=require('./terminal-io.cjs');
const {layout,ansi,clean,isLightTheme}=require('./hud-render.cjs');
const {parseStatus}=require('./hud-status.cjs');
const {SessionTail,findSession,findSessionByPrefix}=require('./session-tail.cjs');
const {accountId,beginRead}=require('./account-limit.cjs');
const {inspectGit}=require('./git-info.cjs');
const {FrameBoundary}=require('./vt-frame.cjs');
const {TitleFilter}=require('./title-filter.cjs');
const {SizeReplies}=require('./size-replies.cjs');
const {TerminalBackground}=require('./terminal-background.cjs');
const {findFooter}=require('./footer-surface.cjs');
const {hints}=require('./launch-hints.cjs');
const {scan}=require('./launch-plan.cjs');
const {samePath}=require('./platform-paths.cjs');
const os=require('node:os');
const {Terminal}=require('@xterm/headless');
const pty=require('@lydell/node-pty');
function runHost({exe,args,useTitleMetadata=false,bootstrap=null,env=process.env,cwd=process.cwd(),effectiveCwd=cwd}){
if(!exe || !process.stdout.isTTY || !process.stdin.isTTY) throw new Error('Codex HUD requires an interactive terminal.');
let cols=Math.max(20,process.stdout.columns||100), rows=Math.max(8,process.stdout.rows||30);
let lastStdoutCols=process.stdout.columns||cols, lastStdoutRows=process.stdout.rows||rows;
let childRows=rows-3,previousPainted=null,repaintRows=0,repaintUntil=0,nextRepaint=0,nextSizeQuery=0,resizeFullClear=false;
const boundary=new FrameBoundary();
let titleMeta=null,resolvedTitleId=null,pendingTitlePrefix=null,nextPrefixLookup=0;
const titleFilter=useTitleMetadata?new TitleFilter(observeTitle,()=>{titleMeta=null;pendingTitlePrefix=null;}):null;
const terminal=new Terminal({cols,rows:childRows,allowProposedApi:true,scrollback:1000});
// Ultra-Herdr live composer colors v1 (portable across SV and Mac)
let composerColors=null;
try{if(env.HC_TERMINAL_ID)composerColors=new (require(path.join(os.homedir(),'.config','herdr-app','mods','ultra-chrome','composer-colors.cjs')).ComposerColors)({env});}catch{}
const child=pty.spawn(exe,args,{name:env.TERM||'xterm-256color',cols,rows:childRows,cwd,env});
const output=process.platform==='win32'?process.stdout:new TerminalWriter(process.stdout.fd);
const input=process.platform==='win32'?null:new TerminalWriter(child.fd);
const writeOutput=data=>new Promise((resolve,reject)=>output.write(data,error=>error?reject(error):resolve()));
function writeInput(data){if(!data||finished||stopping)return;if(input){if(!input.write(data))process.stdin.pause();}else child.write(data);}
input?.on('drain',()=>{if(!finished&&!stopping)process.stdin.resume();});
input?.on('error',()=>{if(!finished)requestStop('SIGTERM',1);});
output.on('error',()=>{if(!finished)finish(1);});
let queue=Promise.resolve(),timer,usageTimer,trackedId=null,tail=null,tailBusy=false,nextLookup=0,snapshot=null,latestStatus=null,costRequest=null,costId=null,costMicros=null,nextCost=0;
function canPaint(){return !finished&&boundary.safe&&!boundary.cursorSaved&&!boundary.inSync();}
function observeTitle(meta){
 if(!meta.sessionPrefix){titleMeta=null;pendingTitlePrefix=null;resolvedTitleId=null;return;}
 if(titleMeta?.sessionPrefix!==meta.sessionPrefix){
  if(trackedId&&!trackedId.toLowerCase().startsWith(meta.sessionPrefix.toLowerCase())){tail?.close().catch(()=>{});tail=null;trackedId=null;snapshot=null;isFirstSession=false;}
  resolvedTitleId=null;nextPrefixLookup=0;
 }
 titleMeta=meta;if(meta.sessionId)resolvedTitleId=meta.sessionId;
 pendingTitlePrefix=resolvedTitleId?null:meta.sessionPrefix;
}
function resizeTo(height,width){
 if(width<20||height<8||width===cols&&height===rows)return;
 const oldCols=cols;cols=width;rows=height;childRows=height-3;
 repaintRows=Math.min(childRows,4*Math.ceil(oldCols/cols)+10);repaintUntil=Date.now()+1500;nextRepaint=Date.now();resizeFullClear=true;
 queue=queue.then(async()=>{if(finished)return;terminal.resize(cols,childRows);child.resize(cols,childRows);if(canPaint()){await repaintAfterResize();await compose();}}).catch(()=>{});
}
function checkStdoutSize(){
 const w=process.stdout.columns,h=process.stdout.rows;
 if(w>=20&&h>=8&&(w!==lastStdoutCols||h!==lastStdoutRows)){
  lastStdoutCols=w;lastStdoutRows=h;resizeTo(h,w);
 }
}
const sizeReplies=new SizeReplies(resizeTo);
let isFirstSession=true,sessionHasStarted=false;
const codexHome=env.CODEX_HOME||path.join(os.homedir(),'.codex');
const sessionsRoot=path.join(codexHome,'sessions'),archiveRoot=path.join(codexHome,'archived_sessions');
let account=accountId(codexHome),accountEpoch=bootstrap?.epoch??Date.now(),initialWeek=bootstrap?.week??null,skillCount=effectiveCwd===null?null:bootstrap?.skills??null,metadataCwd=effectiveCwd??cwd,accountRequest=bootstrap?.request??null,nextAccountCheck=0,finished=false;
let configHint=bootstrap?.config??null;const cliHints=hints(args);
let backgroundLight=false;const terminalBackground=new TerminalBackground(value=>{backgroundLight=value;redraw();});
let gitCwd=null,gitInfo={branch:null,summary:null},gitBusy=false,nextGit=0,gitController=null;
let redrawQueued=false,redrawWanted=false;
function redraw(){
 if(finished)return;redrawWanted=true;if(redrawQueued)return;redrawQueued=true;
 queue=queue.then(async()=>{redrawWanted=false;if(canPaint()){await repaintAfterResize();await compose();}}).catch(()=>{}).finally(()=>{redrawQueued=false;if(redrawWanted)redraw();});
}
function loadCurrentWeek(cwd=metadataCwd){
 if(bootstrap)bootstrap.onChange=null;
 accountRequest?.cancel();initialWeek=null;skillCount=null;configHint=null;metadataCwd=cwd;
 const expected=account,epoch=accountEpoch,expectedCwd=cwd;
 const stillCurrent=()=>!finished&&account===expected&&epoch===accountEpoch&&metadataCwd===expectedCwd&&accountId(codexHome)===expected;
 const request=beginRead({exe,cwd,home:codexHome,env,includeSkills:true,includeConfig:true,
  onWeek:value=>{if(stillCurrent()){initialWeek=value;redraw();}},
  onSkills:value=>{if(stillCurrent()){skillCount=value;redraw();}},
  onConfig:value=>{if(stillCurrent()){configHint=value;redraw();}}});accountRequest=request;
 request.promise.then(value=>{
  if(!stillCurrent())return;
  initialWeek=value;redraw();
 });
}
const command=scan(args).command;
const resumeRequested=['resume','fork','agents'].includes(command);
const fmt=cell=>{
  const values=['0'];if(cell.isBold())values.push('1');if(cell.isDim())values.push('2');if(cell.isItalic())values.push('3');if(cell.isUnderline())values.push('4');if(cell.isBlink())values.push('5');if(cell.isInverse())values.push('7');if(cell.isInvisible())values.push('8');if(cell.isStrikethrough())values.push('9');
  for(const [mode,color,prefix] of [[cell.isFgRGB(),cell.getFgColor(),'38'],[cell.isBgRGB(),cell.getBgColor(),'48']])if(mode)values.push(prefix,'2',String((color>>16)&255),String((color>>8)&255),String(color&255));
  if(cell.isFgPalette())values.push('38','5',String(cell.getFgColor()));if(cell.isBgPalette())values.push('48','5',String(cell.getBgColor()));
  return `\x1b[${values.join(';')}m`;
};
function renderHelp(line,start=0){
 if(!line)return '';let result='',last='',used=0,end=Math.min(cols,line.length);
 while(end>0){const cell=line.getCell(end-1);if(!cell||((!cell.getChars()||cell.getChars()===' ')&&cell.isAttributeDefault()))end--;else break;}
 for(let i=start;i<end;i++){
   const cell=line.getCell(i);if(!cell||cell.getWidth()===0)continue;
   const text=clean(cell.getChars()||' '),w=cell.getWidth();if(used+w>cols)break;
   const next=fmt(cell);if(next!==last){result+=next;last=next;}result+=text;used+=w;
 }
 return result+'\x1b[0m';
}
function updateSession(status){
 latestStatus=status;
 if(!status.sessionId||status.sessionId===trackedId)return;
 if(trackedId!==null){isFirstSession=false;sessionHasStarted=true;}
 if(tail){tail.close().catch(()=>{});tail=null;}
 trackedId=status.sessionId;snapshot=null;nextLookup=0;costRequest?.cancel();costRequest=null;costId=null;costMicros=null;nextCost=0;
}
async function repaintAfterResize(){
 if(!repaintRows)return;
 const b=terminal.buffer.active;
 const fullClear=resizeFullClear&&b.type==='alternate';
 const start=fullClear?0:Math.max(0,childRows-repaintRows);
 let out='\x1b[?2026h\x1b7'+(fullClear?'\x1b[2J':'');
 for(let i=start;i<rows;i++){
  const original=i<childRows?renderHelp(b.getLine(b.viewportY+i)):'';
  if(fullClear&&!original)continue;
  out+=`\x1b[${i+1};1H${fullClear?'':'\x1b[2K'}${original}\x1b[0m`;
 }
 await writeOutput(out+'\x1b8\x1b[?2026l');
 if(fullClear)resizeFullClear=false;
 if(Date.now()>=repaintUntil)repaintRows=0;
 previousPainted=null;
}

async function compose() {
  const b=terminal.buffer.active;
  // Clamp translateToString to current cols so shrunk alternate-screen lines never leak stale cells.
  const getText=i=>b.getLine(b.viewportY+i)?.translateToString(true,0,cols)??'';
  const footer=findFooter({childRows,totalRows:rows,getText,parseStatus,titleMeta,resolvedTitleId});
  await composerColors?.paint(terminal,writeOutput,footer,cols,childRows);
  if(!footer){
    if(previousPainted!==null){
      let restore='\x1b[?2026h\x1b7';
      for(let i=previousPainted.start;i<=Math.min(rows-1,previousPainted.end);i++){
        const original=i<childRows?renderHelp(b.getLine(b.viewportY+i)):'';
        restore+=`\x1b[${i+1};1H\x1b[2K${original}\x1b[0m`;
      }
      await writeOutput(restore+'\x1b8\x1b[?2026l');previousPainted=null;
    }
    return;
  }
  const {row:statusRow,status}=footer;
  const statusEnd=footer.statusEnd??statusRow;
  const footerEnd=footer.end??(footer.helpRow??statusEnd);
  if(!status.partial&&status.sessionId)updateSession(status);
  const known=snapshot?.verified&&!snapshot.rejected?snapshot:null;
  const sid=status.sessionId;
  const title=titleMeta&&titleMeta.sessionPrefix&&sid&&(sid.toLowerCase().startsWith(titleMeta.sessionPrefix.toLowerCase())||status.partial&&titleMeta.sessionPrefix.toLowerCase().startsWith(sid.toLowerCase()))?titleMeta:null;
  const configMatchesCwd=effectiveCwd!==null||Boolean(known?.cwd);
  const fallbackPermission=!cliHints.uncertain?(cliHints.permission??(configMatchesCwd&&!configHint?.customPermissions&&configHint?.sandboxMode==='danger-full-access'?'Full Access':null)):null;
  const fallbackWindow=!cliHints.uncertain?(cliHints.window??(configMatchesCwd?configHint?.contextWindow:null)??null):null;
  const currentState=title?.status??status.status??known?.status;
  if(['Working','Thinking','Waiting'].includes(currentState))sessionHasStarted=true;
  const defaults=!resumeRequested&&isFirstSession&&!status.partial&&!sessionHasStarted?0:null;
  const usage=known?.usage;
  const displayCwd=known?.cwd??effectiveCwd;const info=gitCwd&&displayCwd&&samePath(gitCwd,displayCwd)?gitInfo:{branch:null,summary:null};
  const summary=[info.summary,status.pullRequest?`#${status.pullRequest}`:null].filter(Boolean).join(' ')||null;
  const nativeWeekly=Number.isFinite(status.weeklyRemaining)?Math.max(0,Math.min(100,100-status.weeklyRemaining)):Number.isFinite(title?.weeklyRemaining)?Math.max(0,Math.min(100,100-title.weeklyRemaining)):null;
  const data={cwd:displayCwd?path.basename(displayCwd):'--',branch:info.branch,gitSummary:summary,sessionId:sid??trackedId??null,badge:title?.badge??status.badge??(skillCount>0?`✦ ${skillCount} skills`:null),
   model:title?.model??status.model??known?.model??'--',effort:title?.effort??status.effort??known?.effort??'',fast:title?title.fast:status.fast,permissions:status.permissions??known?.permissions??fallbackPermission,status:currentState,
   contextPercent:status.contextPercent??title?.contextPercent??usage?.contextPercent??null,window:usage?.window??status.contextWindow??fallbackWindow,
   weeklyPercent:usage?.weeklyAt>=accountEpoch?usage.weeklyPercent:(initialWeek??nativeWeekly),
   input:usage?.input??defaults,cached:usage?.cached??defaults,output:usage?.output??defaults,usdMicros:costId===trackedId?costMicros:null};
  const rendered=layout(data,cols,isLightTheme(env.CODEX_HUD_THEME,configHint?.theme,backgroundLight)).map(row=>ansi(row,cols-1));
  const helpRowList=Array.isArray(footer.helpRows)?footer.helpRows:(footer.helpRow!==null&&footer.helpRow!==undefined?[footer.helpRow]:[]);
  const helpLines=helpRowList.map(r=>renderHelp(b.getLine(b.viewportY+r))).filter(Boolean);
  if(!helpLines.length&&footer.inlineWarning){
    for(let r=statusRow;r<=statusEnd;r++){
      const line=b.getLine(b.viewportY+r);
      let found=false;
      for(let col=2;line&&col<cols;col++)if(line.getCell(col)?.getChars()==='⚠'&&line.getCell(col-1)?.getChars()===' '&&line.getCell(col-2)?.getChars()===' '){helpLines.push(renderHelp(line,col));found=true;break;}
      if(found)break;
    }
  }
  const lines=[...rendered,...(helpLines.length?helpLines:[''])];
  const paintCount=Math.min(lines.length,rows-statusRow);
  const paintedEnd=statusRow+paintCount-1;
  const clearEnd=Math.min(rows-1,Math.max(paintedEnd,footerEnd,previousPainted?.end??-1));

  let out='\x1b[?2026h\x1b7';
  // Restore any rows that were previously painted above the new statusRow.
  if(previousPainted&&previousPainted.start<statusRow){
    for(let r=previousPainted.start;r<Math.min(statusRow,previousPainted.end+1);r++){
      const original=r<childRows?renderHelp(b.getLine(b.viewportY+r)):'';
      out+=`\x1b[${r+1};1H\x1b[2K${original}\x1b[0m`;
    }
  }
  for(let i=0;i<paintCount;i++) out+=`\x1b[${statusRow+1+i};1H\x1b[2K${lines[i]}\x1b[0m`;
  // Clear any leftover wrapped native rows or previously painted ghost HUD rows below paintedEnd.
  for(let r=paintedEnd+1;r<=clearEnd;r++){
    const original=r<childRows&&r>footerEnd?renderHelp(b.getLine(b.viewportY+r)):'';
    out+=`\x1b[${r+1};1H\x1b[2K${original}\x1b[0m`;
  }
  // Always keep reserved HUD rows below childRows (beyond paintedEnd) blank so resizes never leave ghosts.
  for(let r=Math.max(paintedEnd+1,clearEnd+1,childRows);r<rows;r++){
    out+=`\x1b[${r+1};1H\x1b[2K\x1b[0m`;
  }
  out+='\x1b8\x1b[?2026l';
  previousPainted={start:statusRow,end:paintedEnd};
  await writeOutput(out);
}

let pendingData=0,exitProbe=null,drainingChildExit=false;
function watchPausedChild(){
 if(process.platform==='win32'||exitProbe||drainingChildExit)return;
 // node-pty closes a dead Unix child's socket after 200 ms. Drain its finite
 // tail even when the viewer is slow, before that close can discard it.
 exitProbe=setInterval(()=>{
  try{process.kill(child.pid,0);}catch(error){if(error.code==='ESRCH'){
   drainingChildExit=true;clearInterval(exitProbe);exitProbe=null;child.resume();
  }}
 },25);
}
child.onData(data=>{
  if(finished)return;pendingData++;if(process.platform!=='win32'&&!drainingChildExit){child.pause();watchPausedChild();}
  queue=queue.then(()=>new Promise(resolve=>terminal.write(data,resolve))).then(async()=>{
    const forwarded=titleFilter?titleFilter.feed(data):data;
    terminalBackground.noteOutput(forwarded);sizeReplies.noteChildOutput(forwarded);await writeOutput(forwarded);
    boundary.feed(forwarded);
    if(canPaint()){await repaintAfterResize();await compose();}
  }).catch(()=>{}).finally(()=>{pendingData--;if(!pendingData){clearInterval(exitProbe);exitProbe=null;if(process.platform!=='win32'&&!finished)child.resume();}});
});
const wasRaw=Boolean(process.stdin.isRaw);
let ending=null,stopping=false,stopCode=null,stopDeadline=null;
function finish(exitCode,forced=false){
 if(ending)return ending;
 finished=true;clearTimeout(stopDeadline);clearInterval(exitProbe);exitProbe=null;accountRequest?.cancel();costRequest?.cancel();gitController?.abort();
 clearInterval(timer);clearInterval(usageTimer);process.stdout.off('resize',onTerminalResize);
 process.stdin.pause();process.stdin.off('data',onInput);
 if(process.stdin.isTTY)process.stdin.setRawMode(wasRaw);
 input?.destroy();
 let deadline;
 const flush=Promise.allSettled([queue,accountRequest?.promise,costRequest?.promise,tail?.close()]).then(async()=>{
  const remaining=titleFilter?.flush();if(remaining)await writeOutput(remaining);
  if(process.platform!=='win32')await writeOutput(resetModes);
 });
 const completion=forced?Promise.race([flush,new Promise(resolve=>{deadline=setTimeout(resolve,1200);})]):flush;
 ending=completion.catch(()=>{}).finally(()=>{
  clearTimeout(deadline);terminal.dispose();try{child.destroy();}catch{}
  if(output!==process.stdout){output.destroy();process.exit(exitCode);}
  else process.stdout.write('',()=>process.exit(exitCode));
 });
 return ending;
}
child.onExit(({exitCode})=>{finish(stopCode??exitCode);});
function requestStop(signal,code){
 if(stopping)return;stopping=true;stopCode=code;
 process.stdin.pause();input?.destroy();clearInterval(timer);clearInterval(usageTimer);
 // Keep reading until the child exits so its shutdown messages reach the screen.
 try{if(process.platform==='win32')child.kill();else child.kill(signal);}catch{}
 stopDeadline=setTimeout(()=>{if(ending){if(output!==process.stdout)output.destroy();}else finish(code,true);},1500);
}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143],['SIGHUP',129]])process.once(signal,()=>requestStop(signal,code));
const utf8=new StringDecoder('utf8');
function onInput(data){const value=utf8.write(data);terminalBackground.noteInput(value);writeInput(sizeReplies.feed(value));}
process.stdin.setRawMode(true);process.stdin.resume();process.stdin.on('data',onInput);
function onTerminalResize(){checkStdoutSize();nextSizeQuery=0;}
process.stdout.on('resize',onTerminalResize);
timer=setInterval(()=>{
  if(composerColors?.changed())redraw();
  const now=Date.now(),expired=sizeReplies.expire(now,1000);if(expired)writeInput(expired);
  if(process.platform!=='win32')resizeTo(process.stdout.rows||rows,process.stdout.columns||cols);
  else {
    checkStdoutSize();
    if(now>=nextSizeQuery&&!sizeReplies.paste&&!sizeReplies.queue.length&&boundary.safe){
      if(sizeReplies.noteParentQuery(now))queue=queue.then(()=>writeOutput('\x1b[18t')).catch(()=>{});nextSizeQuery=now+2000;
    }
  }
  if(repaintRows&&Date.now()>=nextRepaint){nextRepaint=Date.now()+250;redraw();}
  else if(boundary.syncOutput&&!boundary.inSync(now)){boundary.syncOutput=false;redraw();}
},250);
usageTimer=setInterval(async()=>{
 if(Date.now()>=nextAccountCheck){nextAccountCheck=Date.now()+3000;const current=accountId(codexHome);if(current!==account){account=current;accountEpoch=Date.now();costRequest?.cancel();costRequest=null;costId=null;costMicros=null;nextCost=0;loadCurrentWeek();}}
 const activeCwd=snapshot?.verified&&snapshot.cwd?snapshot.cwd:effectiveCwd;
 if(activeCwd&&!gitBusy&&(gitCwd!==activeCwd||Date.now()>=nextGit)){
  gitBusy=true;nextGit=Date.now()+30000;const target=activeCwd;gitController=new AbortController();
  inspectGit(target,gitController.signal).then(info=>{if(!finished&&(snapshot?.cwd??effectiveCwd)===target){gitCwd=target;gitInfo=info;redraw();}}).catch(()=>{}).finally(()=>{gitBusy=false;});
 }
 if(tailBusy)return;tailBusy=true;
 try{
  if(pendingTitlePrefix&&!resolvedTitleId&&Date.now()>=nextPrefixLookup){
   const prefix=pendingTitlePrefix;nextPrefixLookup=Date.now()+2000;
   const roots=resumeRequested||!isFirstSession?[sessionsRoot,archiveRoot]:[sessionsRoot];
   const matches=(await Promise.all(roots.map(root=>findSessionByPrefix(root,prefix)))).filter(Boolean);
   if(matches.length===1&&pendingTitlePrefix===prefix){
    const candidate=new SessionTail(matches[0].file,matches[0].id);await candidate.poll();
    if(candidate.state.verified&&!candidate.state.rejected&&pendingTitlePrefix===prefix){
      if(tail)await tail.close();tail=candidate;trackedId=matches[0].id;resolvedTitleId=matches[0].id;snapshot={...candidate.state};pendingTitlePrefix=null;redraw();
    }else await candidate.close();
   }
  }
  if(!trackedId)return;const id=trackedId;
  if(!tail&&Date.now()>=nextLookup){
   nextLookup=Date.now()+2000;const roots=resumeRequested||!isFirstSession?[sessionsRoot,archiveRoot]:[sessionsRoot];
   const matches=(await Promise.all(roots.map(root=>findSession(root,id)))).filter(Boolean);
   if(matches.length===1&&trackedId===id)tail=new SessionTail(matches[0],id);
  }
  if(tail&&trackedId===id){const changed=await tail.poll();if(changed&&trackedId===id&&tail.state.verified&&!tail.state.rejected){snapshot={...tail.state};if(snapshot.cwd&&!samePath(snapshot.cwd,metadataCwd))loadCurrentWeek(snapshot.cwd);redraw();}}
  if(account&&snapshot?.verified&&!snapshot.rejected&&trackedId===id&&!costRequest&&Date.now()>=nextCost){
   const expectedAccount=account,epoch=accountEpoch;nextCost=Date.now()+60000;
   const request=beginRead({exe,cwd:snapshot.cwd||metadataCwd,home:codexHome,env,includeWeek:false,threadId:id,onCost:value=>{
    if(!finished&&trackedId===id&&account===expectedAccount&&accountEpoch===epoch){costId=id;costMicros=value;redraw();}
   }});costRequest=request;request.promise.finally(()=>{if(costRequest===request)costRequest=null;});
  }
 }catch{}finally{tailBusy=false;}
},500);
if(bootstrap&&bootstrap.account===account){
 bootstrap.onChange=()=>{if(!finished&&bootstrap.account===account){initialWeek=bootstrap.week;skillCount=effectiveCwd===null&&!snapshot?.cwd?null:bootstrap.skills;configHint=bootstrap.config;redraw();}};
} else {accountEpoch=Date.now();loadCurrentWeek();}
}
module.exports={runHost};
if(require.main===module){
 const hostArgs=process.argv.slice(2),useTitleMetadata=hostArgs[0]==='--title-metadata';if(useTitleMetadata)hostArgs.shift();
 const [exe,...args]=hostArgs;
 try{runHost({exe,args,useTitleMetadata});}catch(error){console.error(`Codex HUD: ${error.message}`);process.exitCode=1;}
}
