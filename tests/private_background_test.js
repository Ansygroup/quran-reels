const assert=require('node:assert/strict');
const bg=require('../lib/private_background');
const uid='31767a76-47ae-4487-9026-852ee258c808', id='e6babd90-5848-4327-a948-b282b87dad08';
const jpg=Buffer.from('ffd8ffc00011080002000303011100021101031101ffd9','hex');
const data=bg.PREFIX+jpg.toString('base64');
(async()=>{
  assert.equal(bg.validateImage(data),jpg.toString('base64'));
  for(const bad of ['', 'data:image/svg+xml;base64,AAAA', bg.PREFIX+'!!', bg.PREFIX+Buffer.alloc(bg.MAX_BYTES+1).toString('base64'),bg.PREFIX+Buffer.from('not an image').toString('base64')]) assert.throws(()=>bg.validateImage(bad));
  const full=Buffer.alloc(bg.MAX_BYTES); jpg.copy(full,0,0,jpg.length-2); full[full.length-2]=0xff; full[full.length-1]=0xd9; assert.equal(bg.validateImage(bg.PREFIX+full.toString('base64')).length,Math.ceil(bg.MAX_BYTES/3)*4);
  const huge=Buffer.from(jpg); huge.writeUInt16BE(1601,9); assert.throws(()=>bg.validateImage(bg.PREFIX+huge.toString('base64')));
  let path; const rest=async p=>(path=p,[{jpeg_base64:jpg.toString('base64')}]);
  assert.equal(await bg.loadBackground(rest,uid,id),data);
  assert(path.includes('user_id=eq.'+uid) && path.includes('image_id=eq.'+id));
  await assert.rejects(bg.loadBackground(rest,'bad',id));
  await assert.rejects(bg.loadBackground(async()=>[],uid,id),/غير متاحة/);
  await assert.rejects(bg.loadBackground(async()=>[{jpeg_base64:'bad'}],uid,id));
  console.log('private background validation and owner-scoped loading: OK (mock database)');
})().catch(e=>{console.error(e);process.exitCode=1});
