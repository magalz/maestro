import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture} from '../../../tools/release/test-fixture.mjs';
import {VerifiedRelease} from '../../../dist/packages/contracts/src/release.js';
import {rawDigest,canonical,validateWithProfile} from '../../../dist/packages/contracts/src/index.js';
import {TrustedDshClosure} from '../../../dist/packages/contracts/src/dsh.js';
import {prepareManagedDsh} from '../../../dist/packages/gateway/src/managed-runtime.js';
// Signed minimal module fixtures isolate Node cache/cleanup behavior. Actual
// Cordis activation is separately exercised by isolated-runtime.mjs.
function admitted({hostFailure=false,disposeFailure=false,loopFactory=false}={}){
 const f=fixture();
 const files={
  'dsh/node_modules/@deepseek-ai/cordis/lib/index.js':`export class Context { constructor(){this.values=new Map();this.fiber={dispose:async()=>{${disposeFailure?'throw Error("DISPOSE_FIXTURE")':''}}};} provide(k,v){this.values.set(k,v)} get(k){return this.values.get(k)} async plugin(L){this.loader=new L(this)} }`,
  'dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js':'export class Loader {constructor(ctx){this.ctx=ctx;this.rows=[]} async create(row){this.rows.push({id:row.id,options:row});await this.import(row.name).default(this.ctx)} async await(){} entries(){return this.rows}}',
  'dsh/node_modules/@deepseek-ai/cosmokit/lib/index.js':'export const fixture=true;',
  'maestro-host.mjs':`export default function(ctx){${hostFailure?'throw Error("SECOND_RELEASE_HOST")':'ctx.provide("externalHostActivated",true)'}}`,
  'maestro-client.js':'window.__ModuleLoader__.load({id:"maestro-client-feasibility",factory(){return {apply(ctx){ctx.provide("externalClientActivated","sealed-task-fixture")}}}});'
 };
 if(loopFactory)files['maestro-client.js']='window.__ModuleLoader__.load({id:"maestro-client-feasibility",factory(){while(true){}}});';
 const dsh=[];
 for(const [path,source] of Object.entries(files)){const bytes=Buffer.from(source);mkdirSync(dirname(join(f.stage,path)),{recursive:true});writeFileSync(join(f.stage,path),bytes);const row={path,role:path.startsWith('dsh/')?'dsh':'plugin',sha256:rawDigest(bytes),size:String(bytes.length),classification:'executable'};f.manifest.files.push(row);if(row.role==='dsh')dsh.push(row);else f.manifest.components[0].files.push(path);}
 const lock=f.manifest.files.find(v=>v.path==='lock.fixture');
 const closureBytes=canonical({schema:'maestro.dsh.closure/1',profile:'maestro.release.inventory.dsh/1',lock_sha256:lock.sha256,owner:'deepseek-harness',files:dsh});
 const closure=TrustedDshClosure.verify(closureBytes,rawDigest(closureBytes),lock.sha256);
 f.manifest.components.push({name:'deepseek-harness',version:'fixture',rationale:'Signed cache and cleanup regression modules',source:'local-test',files:dsh.map(v=>v.path),notices:['notice.fixture']});
 Object.assign(f.manifest,{schema:'maestro.release.manifest.dsh/1',resource_profile:'maestro.release.inventory.dsh/1',dsh_closure:rawDigest(closureBytes),dsh_lock:{path:lock.path,sha256:lock.sha256}});
 const bytes=canonical(f.manifest);validateWithProfile(f.manifest.schema,bytes,true,'dsh-release');
 const signature=f.envelope('maestro.release.manifest/1',bytes);writeFileSync(join(f.stage,'release.manifest.json'),bytes);writeFileSync(join(f.stage,'release.signature.json'),signature);
 return VerifiedRelease.verify(bytes,signature,f.root,f.stage,closure);
}
test('reusing an emptied home cannot execute a prior admitted release from the ESM cache',async()=>{
 mkdirSync('tools/release/target',{recursive:true});const home=mkdtempSync(resolve('tools/release/target/cache-home-'));
 const first=admitted(),second=admitted({hostFailure:true});assert.notEqual(first.identity,second.identity);
 assert.equal((await prepareManagedDsh(first,home).activate()).status,'pass');
 unlinkSync(join(home,'effective-graph.json'));
 await assert.rejects(()=>prepareManagedDsh(second,home).activate(),/SECOND_RELEASE_HOST/);
});
test('module hooks are deregistered even when context disposal rejects',async()=>{
 const home=mkdtempSync(resolve('tools/release/target/dispose-home-'));
 await assert.rejects(()=>prepareManagedDsh(admitted({disposeFailure:true}),home).activate(),/DISPOSE_FIXTURE/);
 const path=join(home,'after-cleanup.mjs');writeFileSync(path,'export const cleanupPassed=true;');
 assert.equal((await import(pathToFileURL(path).href)).cleanupPassed,true);
});
test('overlapping managed activation is rejected without disrupting the active operation',async()=>{
 const other=await import('../../../dist/packages/gateway/src/managed-runtime.js?second-bootstrap');
 const first=prepareManagedDsh(admitted(),mkdtempSync(resolve('tools/release/target/overlap-')));
 const second=other.prepareManagedDsh(admitted(),mkdtempSync(resolve('tools/release/target/overlap-')));
 const pending=first.activate();await assert.rejects(()=>second.activate(),/ACTIVATION_BUSY/);assert.equal((await pending).status,'pass');
});
test('looping client factory times out and releases hooks and activation ownership',async()=>{
 const home=mkdtempSync(resolve('tools/release/target/factory-'));
 await assert.rejects(()=>prepareManagedDsh(admitted({loopFactory:true}),home).activate(),/Script execution timed out/);
 const path=join(home,'cleanup.mjs');writeFileSync(path,'export const clean=true;');assert.equal((await import(pathToFileURL(path).href)).clean,true);
 assert.equal((await prepareManagedDsh(admitted(),mkdtempSync(resolve('tools/release/target/after-timeout-'))).activate()).status,'pass');
});
