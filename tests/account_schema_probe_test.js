/* Synthetic responses only; never accesses production. */
'use strict';
const assert=require('node:assert/strict');
const {probe,RPCS}=require('../scripts/probe_account_schema_readonly');
const key='fixture-service-secret';
const schema={paths:Object.fromEntries(RPCS.map(n=>['/rpc/'+n,{post:{}}]))};
(async()=>{
 let calls=[];
 const fetchImpl=async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify(url.includes('?')?[]:schema),{status:200,headers:{'content-type':'application/json'}})};
 let r=await probe({base:'https://fixture.invalid',key,fetchImpl});
 assert.equal(r.columns,'visible');assert.equal(r.openapi,'visible');assert(RPCS.every(n=>r.rpcs[n]==='listed'));
 assert.equal(calls.length,2);for(const c of calls){assert.equal(c.opts.method,'GET');assert.equal(c.opts.redirect,'manual');assert.equal(c.opts.headers.authorization,'Bearer '+key);assert(!c.url.includes(key));assert(!c.url.includes('/rpc/'));}
 calls=[];r=await probe({base:'https://fixture.invalid',key,fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response('',{status:403})}});
 assert.equal(r.columns,'inconclusive');assert.equal(r.openapi,'inconclusive');assert(RPCS.every(n=>r.rpcs[n]==='inconclusive'));
 r=await probe({base:'https://fixture.invalid',key,fetchImpl:async()=>{throw Error('network')}});assert.equal(r.openapi,'inconclusive');assert.equal(r.columns,'inconclusive');
 r=await probe({base:'https://fixture.invalid',key,fetchImpl:async(url)=>new Response(JSON.stringify(url.includes('?')?[{user_id:'unexpected'}]:{paths:{}}),{status:200})});assert.equal(r.columns,'inconclusive');assert(RPCS.every(n=>r.rpcs[n]==='inconclusive'));
 console.log('PASS read-only schema probe: GET only, no redirects or user rows, missing/failed evidence inconclusive (synthetic)');
})().catch(e=>{console.error(e);process.exitCode=1});
