/* HTTP handler with mock auth and database: no upload to production. */
const assert=require('node:assert/strict'), {Readable}=require('node:stream');
const uid='31767a76-47ae-4487-9026-852ee258c808', other='ff4f75a2-cadc-4459-af2a-6e2e4fde3006';
const jpg=Buffer.from('ffd8ffc00011080002000303011100021101031101ffd9','hex');
const image='data:image/jpeg;base64,'+jpg.toString('base64');
let currentUser=uid, rows={}, images={}, writes=0;
const dbPath=require.resolve('../lib/db'), sessPath=require.resolve('../lib/sess');
require.cache[sessPath]={id:sessPath,filename:sessPath,loaded:true,exports:{getUserId:async()=>currentUser}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{q:async()=>[],q1:async(sql,args)=>rows[args[0]]||null,rest:async(path,opts={})=>{
 if(path.includes('social_connections'))return [{platform:'youtube'}];
 if(path.includes('/rpc/save_autopilot_guarded')){const a=JSON.parse(opts.body),u=a.p_config.user_id;if((rows[u]?.settings_revision||null)!==a.p_expected_revision)return [];writes++;if(a.p_image_id){if(a.p_jpeg_base64) images[u]={id:a.p_image_id,data:a.p_jpeg_base64};else if(images[u]?.id!==a.p_image_id)throw Error('background not found')}else delete images[u];rows[u]={...a.p_config,settings_revision:require('node:crypto').randomUUID()};return [rows[u]]}
 if(path.includes('private_autopilot_backgrounds')){const url=new URL('https://x'+path);const u=url.searchParams.get('user_id').slice(3),id=url.searchParams.get('image_id').slice(3);return images[u]?.id===id?[{jpeg_base64:images[u].data}]:[]}
 throw Error('unexpected '+path)
}}};
const api=require('../api/autopilot');
async function req(method,body,url='/api/autopilot'){if(body?.action==='save' && !('expected_revision' in body))body={...body,expected_revision:rows[currentUser]?.settings_revision||null};const r=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(r,{method,url,headers:{}});const h={};const res={setHeader(k,v){h[k]=v},end(s){this.body=JSON.parse(s)}};await api(r,res);return {...res,h}}
const base={action:'save',enabled:true,platforms:['youtube'],all_channels:true,template:{content_mode:'mix',reciter_mode:'rotate',background:'custom'}};
(async()=>{
 currentUser=null;let r=await req('POST',{...base,custom_image:image});assert.equal(r.statusCode,401);assert.equal(writes,0);
 currentUser=uid;r=await req('POST',{...base,custom_image:'data:image/svg+xml;base64,AAAA'});assert.equal(r.statusCode,400);assert.equal(writes,0);
 r=await req('POST',base);assert.equal(r.statusCode,400);assert.equal(writes,0);
 r=await req('POST',{...base,custom_image:image});assert.equal(r.statusCode,200);const id=r.body.config.template.background_image_id;assert(id);assert(!JSON.stringify(r.body).includes(image));assert.equal(images[uid].id,id);assert(r.body.config.enabled && r.body.config.all_channels);
 r=await req('GET',null,'/api/autopilot?background=1');assert.equal(r.statusCode,200);assert.equal(r.body.image,image);assert.equal(r.body.image_id,id);assert.equal(r.h['Cache-Control'],'no-store');
 currentUser=other;r=await req('GET',null,'/api/autopilot?background=1');assert.equal(r.statusCode,404);
 r=await req('POST',{...base,template:{...base.template,background_image_id:id}});assert.equal(r.statusCode,409);assert(!rows[other]);
 currentUser=uid;r=await req('POST',{...base,template:{...base.template,background_image_id:id}});assert.equal(r.statusCode,200);assert.equal(images[uid].id,id);
 r=await req('POST',{...base,template:{...base.template,background:'rotate'}});assert.equal(r.statusCode,200);assert(!images[uid]);r=await req('GET',null,'/api/autopilot?background=1');assert.equal(r.statusCode,404);
 console.log('private background API auth, owner isolation, explicit save and removal: OK (mock DB)');
})().catch(e=>{console.error(e);process.exitCode=1});
