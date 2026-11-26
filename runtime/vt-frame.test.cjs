'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {FrameBoundary}=require('./vt-frame.cjs');
test('drawing waits for split CSI and extended-color sequences',()=>{const f=new FrameBoundary();assert.equal(f.feed('text\x1b[38;2;'),false);assert.equal(f.feed('255;8;1m한글'),true);});
test('OSC and DCS strings remain intact across arbitrary chunks',()=>{const f=new FrameBoundary();assert.equal(f.feed('\x1b]2;example'),false);assert.equal(f.feed('\x1b'),false);assert.equal(f.feed('\\ok\x1bPpayload'),false);assert.equal(f.feed('\x1b\\'),true);});
test('charset designators and cancellation do not allow premature drawing',()=>{const f=new FrameBoundary();assert.equal(f.feed('\x1b('),false);assert.equal(f.feed('B'),true);assert.equal(f.feed('\x1b[123;'),false);assert.equal(f.feed('\x18'),true);});
test('HUD composition is suspended while the child owns a saved cursor',()=>{
 const f=new FrameBoundary();f.feed('\x1b7text');assert.equal(f.cursorSaved,true);f.feed('\x1b8');assert.equal(f.cursorSaved,false);
 f.feed('\x1b[?1048h');assert.equal(f.cursorSaved,true);f.feed('\x1b[?1048l');assert.equal(f.cursorSaved,false);
});
test('DEC synchronized output suspends painting until ?2026l or safety timeout',()=>{
 const f=new FrameBoundary();
 f.feed('\x1b[?2026hpartial frame',1000);assert.equal(f.syncOutput,true);assert.equal(f.inSync(1100),true);assert.equal(f.inSync(1600),false);
 f.feed('\x1b[?2026l',1200);assert.equal(f.syncOutput,false);assert.equal(f.inSync(1200),false);
 f.feed('\x1b7\x1b[?2026h\x1b[?1049h',2000);assert.equal(f.cursorSaved,false);assert.equal(f.syncOutput,false);
});
