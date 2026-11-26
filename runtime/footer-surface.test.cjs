'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {findFooter,joinWrapped}=require('./footer-surface.cjs');
const {parseStatus}=require('./hud-status.cjs');
const status='01a19a07-80b9-7d93-9a20-fac312d9caf2 · GPT-6.1-Sol xhigh · Full Access · Ready · Context 0% used · weekly 73% left';
function select(lines,childRows=118,totalRows=121,extra={}) {
  return findFooter({childRows,totalRows,getText:i=>lines[i]??'',parseStatus,...extra});
}
test('keeps the full-screen native status and shortcut row together',()=>{
  const rows=[];rows[116]=status;rows[117]='  ? for shortcuts';
  const found=select(rows,118,120);assert.equal(found?.row,116);assert.equal(found.helpRow,117);
});
test('finds the real inline footer near the cursor with blank viewport space below',()=>{
  const rows=[];rows[9]='› Ask Codex to do anything';rows[11]=status+'       ⚠ 1 warning · f2 to view';
  const found=select(rows);assert.equal(found?.row,11);assert.equal(found.helpRow,null);assert.equal(found.inlineWarning,true);
});
test('allows a last-row footer when three extra HUD rows have been reserved',()=>{
  const rows=[];rows[117]=status;
  assert.equal(select(rows)?.row,117);
  assert.equal(select(rows,118,120),null,'insufficient output space must not overwrite beyond the viewport');
});
test('does not mistake a historical status line followed by a composer for the footer',()=>{
  const rows=[];rows[11]=status;rows[12]='';rows[13]='› A new user draft';
  assert.equal(select(rows),null);
  const tight=[];tight[11]=status;tight[12]='› A new user draft';
  assert.equal(select(tight),null);
});
test('matches 2-line wrapped status with extra Codex agent suffix (mac/t1fr 92 cols)',()=>{
  const rows=[];
  rows[22]='› Ask Codex to do anything';
  rows[24]='  01a0ff39-d97b-79a0-b912-87c21cadc3d7 · GPT-6.2-Astra xhigh fast · Full Access · Ready ·';
  rows[25]='  Context 89% used · 475K window · weekly 83% left · Main [default]';
  rows[26]='  ← for agents · ? for shortcuts                                  ⚠ 2 warnings · f2 to view';
  const found=select(rows,27,30);
  assert.equal(found?.row,24);
  assert.equal(found.statusEnd,25);
  assert.equal(found.helpRow,26);
  assert.equal(found.status.sessionId,'01a0ff39-d97b-79a0-b912-87c21cadc3d7');
  assert.equal(found.status.model,'GPT-6.2-Astra');
  assert.equal(found.status.effort,'xhigh');
  assert.equal(found.status.fast,true);
  assert.equal(found.status.permissions,'Full Access');
  assert.equal(found.status.status,'Ready');
  assert.equal(found.status.contextPercent,89);
  assert.equal(found.status.contextWindow,475000);
  assert.equal(found.status.weeklyRemaining,83);
});
test('rejoins 3-line wrapped status with hyphenated model name (50 cols)',()=>{
  const rows=[];
  rows[21]='› Ask Codex to do anything';
  rows[23]='  01a21773-92d9-7e63-877f-d256e56c1ada · GPT-6.2-';
  rows[24]='  Astra xhigh fast · Full Access · Ready · Context';
  rows[25]='  0% used · 1M window · weekly 83% left';
  rows[26]='  ← for agents · ? for shortcuts';
  const found=select(rows,27,30);
  assert.equal(found?.row,23);
  assert.equal(found.statusEnd,25);
  assert.equal(found.helpRow,26);
  assert.equal(found.status.model,'GPT-6.2-Astra');
  assert.equal(found.status.effort,'xhigh');
  assert.equal(found.status.fast,true);
  assert.equal(found.status.permissions,'Full Access');
  assert.equal(found.status.contextPercent,0);
  assert.equal(found.status.contextWindow,1000000);
  assert.equal(found.status.weeklyRemaining,83);
});
test('rejoins UUID wrapped across 2 or 3 lines in ultra-narrow terminals (30 and 20 cols)',()=>{
  const rows30=[];
  rows30[21]='› Ask Codex to do anything';
  rows30[23]='  01a21773-c667-7c71-a61f-    ';
  rows30[24]='  4255a0e5382a · GPT-6.2-Astra';
  rows30[25]='  xhigh fast · Full Access ·… ';
  rows30[26]='  ← for agents';
  const f30=select(rows30,27,30);
  assert.equal(f30?.row,23);
  assert.equal(f30.status.sessionId,'01a21773-c667-7c71-a61f-4255a0e5382a');
  assert.equal(f30.status.model,'GPT-6.2-Astra');
  assert.equal(f30.status.permissions,'Full Access');
  assert.equal(f30.helpRow,26);

  const rows20=[];
  rows20[21]='› Ask Codex';
  rows20[23]='  01a21775-54b0-    ';
  rows20[24]='  7e62-af33-        ';
  rows20[25]='  7c2064e4f8e5 ·…   ';
  rows20[26]='  ← for agents      ';
  const f20=select(rows20,27,30);
  assert.equal(f20?.row,23);
  assert.equal(f20.status.sessionId,'01a21775-54b0-7e62-af33-7c2064e4f8e5');
  assert.equal(f20.helpRow,26);
});
test('detects narrow inline truncated UUID both with and without title metadata',()=>{
  const rows40=[];rows40[12]='› Ask Codex';rows40[14]='  01a21774-0a7f-7542-bfd1-7a6209e85428 …';rows40[15]='  ← for agents · ? for shortcuts';
  const f40=select(rows40,27,30);
  assert.equal(f40?.row,14);assert.equal(f40.status.sessionId,'01a21774-0a7f-7542-bfd1-7a6209e85428');assert.equal(f40.helpRow,15);

  const rows25=[];rows25[10]='› Ask Codex';rows25[12]='  01a21775-cf4a-7242-a55…';rows25[13]='  ← for agents';
  const f25NoTitle=select(rows25,27,30);
  assert.equal(f25NoTitle?.row,12);assert.equal(f25NoTitle.status.partial,true);assert.equal(f25NoTitle.status.sessionId,'01a21775-cf4a-7242-a55');
  const f25WithTitle=select(rows25,27,30,{titleMeta:{sessionPrefix:'01a21775-cf4a-7242-a553-d3012',sessionId:'01a21775-cf4a-7242-a553-d30125598b5a'}});
  assert.equal(f25WithTitle?.row,12);assert.equal(f25WithTitle.status.sessionId,'01a21775-cf4a-7242-a553-d30125598b5a');assert.equal(f25WithTitle.status.partial,false);
});
test('detects startup status line before a session UUID is assigned',()=>{
  const rows=[];
  rows[23]='› Ask Codex to do anything';
  rows[25]='  GPT-6.2-Astra default fast · Full Access · Ready · Context 0% used · 1M window';
  rows[26]='  ← for agents · ? for shortcuts';
  const found=select(rows,27,30);
  assert.equal(found?.row,25);
  assert.equal(found.status.sessionId,null);
  assert.equal(found.status.partial,true);
  assert.equal(found.status.model,'GPT-6.2-Astra');
  assert.equal(found.status.effort,'default');
  assert.equal(found.status.fast,true);
  assert.equal(found.status.permissions,'Full Access');
  assert.equal(found.status.status,'Ready');
  assert.equal(found.helpRow,26);
});
test('supports wrapped 2-line help footer below wrapped status',()=>{
  const rows=[];
  rows[20]='› Ask Codex';
  rows[22]='  01a0ff39-d97b-79a0-b912-87c21cadc3d7 · GPT-6.2-';
  rows[23]='  Astra xhigh fast · Full Access · Ready · Context 10% used';
  rows[24]='  ← for agents · ? for shortcuts';
  rows[25]='  ⚠ 2 warnings · f2 to view';
  const found=select(rows,27,30);
  assert.equal(found?.row,22);
  assert.equal(found.statusEnd,23);
  assert.deepEqual(found.helpRows,[24,25]);
  assert.equal(found.status.contextPercent,10);
});
test('joinWrapped preserves hyphens without inserting spaces',()=>{
  assert.equal(joinWrapped(['  01a21775-54b0-','  7e62-af33-','  7c2064e4f8e5 · GPT-6.2-','  Astra xhigh']),'01a21775-54b0-7e62-af33-7c2064e4f8e5 · GPT-6.2-Astra xhigh');
});
