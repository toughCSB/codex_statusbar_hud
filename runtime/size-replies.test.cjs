'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {SizeReplies}=require('./size-replies.cjs');
test('split terminal-size replies update only the parent and preserve Korean input',()=>{
 let size;const f=new SizeReplies((r,c)=>size=[r,c]);f.noteParentQuery(0);
 const out=f.feed('한글\x1b[')+f.feed('8;90;116t확인');assert.equal(out,'한글확인');assert.deepEqual(size,[90,116]);
});
test('child and parent size replies are dispatched in query order',()=>{
 let size;const f=new SizeReplies((r,c)=>size=[r,c]);f.noteChildOutput('x\x1b[1',0);f.noteChildOutput('8t',0);f.noteParentQuery(0);
 assert.equal(f.feed('\x1b[8;90;116t\x1b[8;90;116t'),'\x1b[8;90;116t');assert.deepEqual(size,[90,116]);
});
test('an Escape key and bracketed paste are forwarded unchanged',()=>{
 const f=new SizeReplies();f.noteParentQuery(0);assert.equal(f.feed('\x1b')+f.feed('\x1b[8;90;116t'),'\x1b');
 f.noteParentQuery(1);const paste='\x1b[200~복사\x1b[8;90;116t한글\x1b[201~';assert.equal(f.feed(paste),paste);
});
test('a timed-out query flushes a partial Escape instead of trapping input',()=>{
 const f=new SizeReplies();f.noteParentQuery(0);assert.equal(f.feed('\x1b['),'');assert.equal(f.expire(1001),'\x1b[');
});
