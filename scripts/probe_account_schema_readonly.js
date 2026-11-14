/* Read-only production readiness probe. No RPC invocation, writes or user data.
 * Run only with the existing service key already present in the process
 * environment; never print or pass credentials as command-line arguments.
 * OpenAPI may be disabled/filtered; in that case this remains inconclusive. */
'use strict';
const PROJECT='https://lbblhpscncqsyzvuujpw.supabase.co';
const RPCS=['save_autopilot_guarded','set_autopilot_enabled_guarded','link_autopilot_platform_guarded'];
async function probe({base, key, fetchImpl=fetch}) {
  const headers={apikey:key,authorization:`Bearer ${key}`};
  async function read(path,accept) {
    // Do not follow redirects: service credentials must never be forwarded.
    const response=await fetchImpl(base+path,{method:'GET',headers:{...headers,accept},redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!response.ok) return null;
    const length=Number(response.headers.get('content-length'));
    if(Number.isFinite(length)&&length>4_000_000)return null;
    if(!response.body)return null;
    const chunks=[];let size=0;
    for await (const chunk of response.body) {
      size+=chunk.byteLength;
      if(size>4_000_000)return null;
      chunks.push(Buffer.from(chunk));
    }
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return null}
  }
  const result={columns:'inconclusive',openapi:'inconclusive',rpcs:Object.fromEntries(RPCS.map(name=>[name,'inconclusive']))};
  // limit=0 requests no rows, and the returned content is never printed.
  try {const rows=await read('/rest/v1/autopilot?select=user_id,settings_revision&limit=0','application/json');if(Array.isArray(rows)&&rows.length===0)result.columns='visible';} catch {}
  try {
    const schema=await read('/rest/v1/','application/openapi+json');
    if(schema&&typeof schema==='object'&&schema.paths&&typeof schema.paths==='object'&&!Array.isArray(schema.paths)) {
      result.openapi='visible';
      for(const name of RPCS) {
        const endpoint=schema.paths['/rpc/'+name];
        // A missing path may be an access/OpenAPI policy, not a missing function.
        if(endpoint && typeof endpoint.post==='object' && endpoint.post!==null)result.rpcs[name]='listed';
      }
    }
  } catch {}
  return result;
}
if(require.main===module){
  const key=process.env.SUPABASE_SERVICE_KEY;
  if(!key){console.error('Inconclusive: service key not present in the process environment.');process.exitCode=2;}
  else probe({base:PROJECT,key}).then(result=>{
    console.log(JSON.stringify(result,null,2));
    console.log('Read-only evidence only: OpenAPI listing does not prove RPC calls, signatures, behavior, or compatibility; inconclusive is not proof of absence.');
    if(result.columns!=='visible'||RPCS.some(name=>result.rpcs[name]!=='listed'))process.exitCode=2;
  }).catch(()=>{console.error('Inconclusive: probe failed; no response details or credentials are printed.');process.exitCode=2});
}
module.exports={probe,RPCS};
