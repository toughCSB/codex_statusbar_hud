'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {layout,ansi,width,compact,isLightTheme,formatCost}=require('./hud-render.cjs');
const strip=s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const fixture={cwd:'한글프로젝트',branch:'main',gitSummary:'✓',sessionId:'01a17c45-322f-78e3-9d15-9f2e2f5b393f',badge:'✦ 15 skills',model:'GPT-6.1-Sol',effort:'high',permissions:'Full Access',status:'Ready',contextPercent:49,window:828000,weeklyPercent:36,input:268000000,cached:262000000,output:679000};
test('explicit HUD theme wins over the configured Codex theme',()=>{
 assert.equal(isLightTheme('', 'catppuccin-latte'),true);assert.equal(isLightTheme('dark','catppuccin-latte'),false);
 assert.equal(isLightTheme(' light ','tokyo-night'),true);assert.equal(isLightTheme('', 'tokyo-night'),false);
});
test('optional verified enterprise cost uses the existing HUD format',()=>{
 assert.equal(formatCost(1),'~$0.000001');assert.equal(formatCost(1234),'~$0.0012');assert.equal(formatCost(123456),'~$0.12');assert.equal(formatCost(null),null);
 const text=layout({...fixture,usdMicros:123456},160)[2].map(x=>x.text).join('');assert.match(text,/~\$0\.12/);
});
test('existing three rows contain the same values and gradient pill',()=>{
 const lines=layout(fixture,130),text=lines.map(row=>row.map(x=>x.text).join(''));
 assert.equal(lines.length,3);assert.match(text[0],/한글프로젝트.*main.*01a17c45-322f-78e3-9d15-9f2e2f5b393f/);
 assert.match(text[1],/GPT-6\.1-Sol \(high\).*Full Access.*Ready.*49%/);
 assert.match(text[2],/36% used.*IN 268M.*CACHE 262M.*OUT 679K.*Σ 6\.68M/);
 assert.match(ansi(lines[1],129),/48;2;/);assert.match(ansi(lines[2],129),/38;2;/);
});
test('small widths preserve cwd and do not wrap a double-width grapheme',()=>{
 const lines=layout(fixture,56);assert.match(lines[0].map(x=>x.text).join(''),/^╭─ ▸ 한글프로젝트/);
 for(const line of lines)assert.ok(width(strip(ansi(line,55)))<=55);
 assert.ok(!lines[0].map(x=>x.text).join('').includes(fixture.sessionId));
});
test('missing usage remains unknown instead of pretending zero',()=>{
 const lines=layout({...fixture,input:null,cached:null,output:null,weeklyPercent:null},130),s=lines[2].map(x=>x.text).join('');
 assert.match(s,/WEEK⁷ᵈ.*--%/);assert.match(s,/IN --.*CACHE --.*OUT --/);
});
test('control characters in external labels do not create terminal escapes',()=>{
 const lines=layout({...fixture,cwd:'safe\x1b[2Jname',branch:'main\nline'},130);
 assert.ok(!lines.some(row=>row.some(x=>/[\x00-\x1f\x7f]/.test(x.text))));
});
test('compact values retain integer zeroes',()=>{
 assert.equal(compact(120000),'120K');assert.equal(compact(6000000),'6M');assert.equal(compact(6679000),'6.68M');
});
test('responsive layout fits cleanly across every terminal width from 20 to 180 cols',()=>{
 for(const cols of [20,25,30,35,40,45,50,56,60,65,70,80,92,100,120,160,180]){
  const lines=layout({...fixture,model:'GPT-6.2-Astra',effort:'xhigh',fast:true,usdMicros:123456},cols);
  assert.equal(lines.length,3,`width ${cols} must produce 3 rows`);
  const plain=lines.map(line=>strip(ansi(line,cols-1)));
  for(let r=0;r<3;r++){
   const rawText=lines[r].map(x=>x.text).join('');
   assert.ok(width(rawText)<=cols-1,`width ${cols} row ${r+1} overflowed: ${width(rawText)} > ${cols-1} (${rawText})`);
   assert.equal(plain[r],rawText,`width ${cols} row ${r+1} should not require hard clipping`);
  }
  assert.match(plain[0],/^╭─ ▸ /);
  assert.match(plain[1],/^├─ ▐.*▌.*49%/,`width ${cols} row 2 lost pill caps or CTX%: ${plain[1]}`);
  assert.match(plain[2],/^╰─ .*36%.*↓268M|^╰─ .*36%.*IN 268M/,`width ${cols} row 3 lost WEEK% or IN: ${plain[2]}`);
 }
});
