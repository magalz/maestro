// Fetch notice texts only at registry-associated immutable commits. No clearance inference.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const packages=[['@aws-sdk/credential-provider-http','3.972.72'],['@aws-sdk/credential-provider-login','3.972.77'],['@aws-sdk/nested-clients','3.997.44'],['@earendil-works/pi-ai','0.84.4'],['@earendil-works/pi-telemetry','0.84.4'],['@xterm/headless','6.0.0']];
const destination='tools/release/notices';mkdirSync(destination,{recursive:true});
const results=[];
for(const [name,version] of packages){
 const registry=`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`;
 const response=await fetch(registry);if(!response.ok)throw Error(`Registry ${response.status}`);const metadata=await response.json();
 const repository=typeof metadata.repository==='string'?metadata.repository:metadata.repository?.url;
 const repo=repository?.replace(/^git\+/,'').replace(/\.git$/,'').match(/^https:\/\/github.com\/([^/]+\/[^/]+)$/)?.[1];
 const gitHead=metadata.gitHead;
 const result={name,version,registry,repository,gitHead:gitHead??null,integrity:metadata.dist?.integrity,license:metadata.license,notices:[],status:'unresolved'};
 if(repo&&/^[a-f0-9]{40}$/.test(gitHead??'')){
  for(const filename of ['LICENSE','LICENSE.txt','LICENSE.md','NOTICE','NOTICE.txt']){
   const origin=`https://raw.githubusercontent.com/${repo}/${gitHead}/${filename}`;
   const res=await fetch(origin);if(res.status===404)continue;if(!res.ok)throw Error(`Notice ${res.status}: ${origin}`);
   const bytes=Buffer.from(await res.arrayBuffer());const path=`${name.replace(/[^A-Za-z0-9.-]/g,'_')}-${version}-${filename}`;
   writeFileSync(`${destination}/${path}`,bytes);result.notices.push({path,origin,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  }
  if(result.notices.length)result.status='immutable-source-associated';
  else result.reason='No root LICENSE/NOTICE text at registry gitHead; package-specific source evidence still required.';
 }else result.reason='Registry version metadata supplies no valid immutable gitHead/repository association.';
 if(result.status==='unresolved'&&metadata.license==='Apache-2.0'){
  const origin='https://www.apache.org/licenses/LICENSE-2.0.txt';const res=await fetch(origin);if(!res.ok)throw Error(`Apache license ${res.status}`);
  const bytes=Buffer.from(await res.arrayBuffer());const path='Apache-2.0.txt';writeFileSync(`${destination}/${path}`,bytes);
  result.notices.push({path,origin,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  result.status='declared-standard-license-associated';
  result.reason='Exact locked package metadata declares Apache-2.0; canonical standard text supplied. All shipped attribution remains in the exact closure. Missing gitHead remains source provenance uncertainty, not an unknown standard license or proof a separate NOTICE is required.';
 }
 results.push(result);
}
writeFileSync(`${destination}/sources.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
