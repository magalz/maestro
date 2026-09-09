import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {digest} from './build-inputs.mjs';
import assert from 'node:assert/strict';
export function verifyRetainedRuntimes(manifest,build){
 for(const [source,destination] of [['runtimes/dsh/node_modules/','dsh/node_modules/'],['runtimes/gateway/node_modules/','gateway/node_modules/']]){
  const expected=[...build.captured].filter(([path])=>path.startsWith(source)).map(([path,bytes])=>({path:destination+path.slice(source.length),sha256:digest(bytes),size:String(bytes.length)})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.ok(expected.length);const actual=manifest.files.filter(v=>v.path.startsWith(destination)).map(({path,sha256,size})=>({path,sha256,size})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.deepEqual(actual,expected,'Retained runtime differs from fresh locked build');
 }
}
export const gatewayWrapper=Buffer.from("import './gateway/dist/packages/gateway/src/main.js';\n");
export function controlledAssets(stage,manifest,build){
 const ext=process.platform==='win32'?'.exe':'';
 const owned=path=>['maestro-launcher'+ext,'maestro-controller'+ext,'gateway.js','maestro-host.mjs','maestro-client.js'].includes(path)||path.startsWith('gateway/dist/');
 const removed=new Set(manifest.files.filter(v=>owned(v.path)).map(v=>v.path));
 for(const path of removed)unlinkSync(join(stage,path));
 manifest.files=manifest.files.filter(v=>!removed.has(v.path));
 for(const component of manifest.components)component.files=component.files.filter(path=>!removed.has(path));
 const owner=manifest.components.find(v=>v.name==='maestro');if(!owner)throw Error('Missing controlled component');
 const add=(path,role,bytes)=>{if(!bytes)throw Error('Missing controlled output');mkdirSync(dirname(join(stage,path)),{recursive:true});writeFileSync(join(stage,path),bytes);manifest.files.push({path,role,size:String(bytes.length),sha256:digest(bytes),classification:'executable'});owner.files.push(path);};
 for(const name of ['maestro-launcher','maestro-controller'])add(name+ext,name==='maestro-launcher'?'launcher':'controller',build.captured.get('target/debug/'+name+ext));
 for(const [path,bytes] of build.captured)if(path.startsWith('dist/'))add('gateway/'+path,'gateway',bytes);
 add('gateway.js','gateway',gatewayWrapper);
 for(const path of ['maestro-host.mjs','maestro-client.js'])add(path,'plugin',build.captured.get('plugins/'+path));
}
