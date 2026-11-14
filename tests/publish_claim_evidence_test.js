/* A malformed claim reply must never dispatch or write a different row. */
'use strict';
const assert=require('node:assert/strict');
let returned,queries=[];
const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async(sql)=>{queries.push(sql);if(/set status='publishing'/.test(sql))return returned;throw Error('unexpected query after unconfirmed claim')},q1:async()=>null}};
global.fetch=async()=>{throw Error('unexpected network')};
const {publishRow}=require('../lib/publish');
const row={id:'job',user_id:'owner',platform:'youtube',connection_id:'channel',status:'scheduled'};
const saved={...row,status:'publishing'};
(async()=>{
 const incomplete={...saved};delete incomplete.connection_id;
 for(const bad of [{...saved,id:'other'},{...saved,user_id:'other'},{...saved,platform:'tiktok'},{...saved,status:'scheduled'},{...saved,connection_id:null},incomplete]){
  queries=[];returned=[bad];const out=await publishRow(row);assert.equal(out.skipped,'claim-unconfirmed');assert.equal(queries.length,1);
 }
 queries=[];assert.equal((await publishRow({...row,connection_id:undefined})).skipped,'not-claimable');assert.equal(queries.length,0);
 queries=[];assert.equal((await publishRow(row,'tiktok')).skipped,'not-claimable');assert.equal(queries.length,0);
 console.log('PASS unconfirmed claim evidence never dispatches or writes another row (mock only)');
})().catch(e=>{console.error(e);process.exitCode=1});
