'use strict';
/* Meta callback validation with synthetic provider and in-memory write fakes. */
const assert=require('node:assert/strict');
Object.assign(process.env,{TOKEN_ENC_KEY:'meta-fixture-only',SITE_ORIGIN:'https://app.test',META_APP_ID:'fixture-id',META_APP_SECRET:'fixture-secret'});
const writes=[],defaults=[],automations=[];let failPlatform='',autoOut={};
const db=require.resolve('../lib/db');require.cache[db]={id:db,filename:db,loaded:true,exports:{q:async(sql,args)=>{const platform=sql.includes("'facebook'")?'facebook':'instagram';writes.push({platform,args});if(platform===failPlatform)throw Error('fixture store failure');return []}}};
const def=require.resolve('../lib/soc_default'),d=()=>{};d.ensureDefault=async(...args)=>{defaults.push(args);return true};require.cache[def]={id:def,filename:def,loaded:true,exports:d};
const auto=require.resolve('../lib/autopilot');require.cache[auto]={id:auto,filename:auto,loaded:true,exports:{enableDefaultAutomation:async(...args)=>{automations.push(args);return autoOut[args[1]]||'created'}}};
const {setStCookie}=require('../lib/oauth'),{open}=require('../lib/crypt'),handler=require('../lib/cb_meta');
const response=(json,ok=true)=>({ok,json:async()=>json});
const page=(extra={})=>({id:'page-1',name:'Fixture Page',access_token:'page-token',...extra});
let steps,requests;
function reset(){writes.length=0;defaults.length=0;automations.length=0;failPlatform='';autoOut={};requests=[];steps=[response({access_token:'short-token'}),response({access_token:'long-token',expires_in:600}),response({data:[page()]})]}
global.fetch=async(url,opts)=>{requests.push({url:String(url),opts});assert(steps.length,'unexpected provider request');const val=steps.shift();if(val instanceof Error)throw val;return val};
const mkRes=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},end(){this.ended=true}});
async function run(){const state='meta.fixture',cookie=setStCookie(null,'meta','owner-1',state).split(';')[0],r=mkRes();await handler({url:'/api/oauth/callback?code=code%26special&state=meta.fixture',headers:{cookie}},r);return r.headers.location}
async function rejected(reason){assert.equal(await run(),`/#/account?linked=meta_err&w=${reason}`);assert.equal(writes.length,0);assert.equal(defaults.length,0);assert.equal(automations.length,0)}
(async()=>{
 for(const value of [response({},false),response(null),response({access_token:''}),response({access_token:'bad',error:{message:'failed'}}),new Error('network'),{ok:true,json:async()=>{throw Error('invalid JSON')}}]){reset();steps[0]=value;await rejected('token')}
 for(const value of [response({},false),response({error:'failed'}),response({access_token:'bad',error:{message:'failed'}}),response({access_token:'   '}),new Error('network'),{ok:true,json:async()=>{throw Error('invalid JSON')}}]){reset();steps[1]=value;await rejected('token')}
 for(const value of [response({},false),response(null),response({data:[]}),response({data:{}}),response({data:[page()],error:{message:'failed'}}),new Error('network'),{ok:true,json:async()=>{throw Error('invalid JSON')}},response({data:[null]}),response({data:[page({id:'me'})]}),response({data:[page({id:123})]}),response({data:[page({access_token:''})]}),response({data:[page({instagram_business_account:{username:'without-id'}})]})]){reset();steps[2]=value;await rejected('identity')}
 for(const value of [response({data:[page(),page({id:'page-2'})]}),response({data:[page()],paging:{next:'https://not-followed.test/'}})]){reset();steps[2]=value;await rejected('pages');assert.equal(requests.length,3)}
 reset();const before=Date.now(),result=await run();assert.equal(result,'/#/account?linked=meta');assert.equal(writes.length,1);assert.equal(writes[0].platform,'facebook');const a=writes[0].args;assert.equal(a[0],'owner-1');assert.equal(a[1],'page-1');assert.equal(open(a[4]),'long-token');assert(a[5]>=before+600000&&a[5]<=Date.now()+600000);assert.deepEqual(JSON.parse(open(a[3])).pages,[{id:'page-1',name:'Fixture Page',access_token:'page-token',ig:null}]);assert.deepEqual(defaults,[['owner-1','facebook']]);assert.deepEqual(automations,[['owner-1','facebook']]);assert.equal(new URL(requests[0].url).searchParams.get('code'),'code&special');
 reset();steps[1]=response({access_token:'long-token'});await run();assert.equal(writes[0].args[5],null,'unknown expiry is not guessed as 60 days');
 reset();steps[2]=response({data:[page({instagram_business_account:{id:'ig-1',username:'fixture'}})]});assert.equal(await run(),'/#/account?linked=meta');assert.deepEqual(writes.map(w=>w.platform),['facebook','instagram']);assert.equal(writes[1].args[1],'ig-1');assert.deepEqual(automations,[['owner-1','facebook'],['owner-1','instagram']]);
 for(const target of ['facebook','instagram']){reset();autoOut[target]='error';steps[2]=response({data:[page({instagram_business_account:{id:'ig-1'}})]});assert.equal(await run(),'/#/account?linked=meta&auto_error=1')}
 // IG store failure is not atomic: FB may already be stored and enabled.
 reset();failPlatform='instagram';steps[2]=response({data:[page({instagram_business_account:{id:'ig-1'}})]});const prev=console.error;console.error=()=>{};let failed;try{failed=await run()}finally{console.error=prev};assert.equal(failed,'/#/account?linked=meta_err&w=store');assert.deepEqual(writes.map(w=>w.platform),['facebook','instagram']);assert.deepEqual(automations,[['owner-1','facebook']]);
 console.log('ALL OK: Meta rejects unknown or ambiguous page targets before writes; partial IG failure remains visible (mocked)');
})().catch(e=>{console.error(e);process.exitCode=1});
