import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,truncateSync,openSync,closeSync,appendFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture} from '../../../tools/release/test-fixture.mjs';
import {canonical,rawDigest,structuredDigest} from '../../../dist/packages/contracts/src/index.js';
import {VerifiedRelease} from '../../../dist/packages/contracts/src/release.js';
import {TrustedDshClosure} from '../../../dist/packages/contracts/src/dsh.js';
import {readBoundedDescriptor,readRegularFile} from '../../../dist/packages/contracts/src/io.js';
import {checkFixture,validateReport} from '../../../dist/packages/contracts/src/report.js';
import {verifyMembership} from '../../../tools/release/notice-membership.mjs';
import {controlledAssets,verifyRetainedRuntimes} from '../../../tools/release/controlled-assets.mjs';
const ext=process.platform==='win32'?'.exe':'';
function rust(request){const p=spawnSync('target/debug/contract-probe'+ext,[],{input:JSON.stringify(request)+'\n',encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
function load(f){return VerifiedRelease.verify(readFileSync(join(f.stage,'release.manifest.json')),readFileSync(join(f.stage,'release.signature.json')),f.root,f.stage,f.closure);}
function dshProfile(f){
 const rows=f.manifest.files.filter(v=>v.role==='dsh'),lock=f.manifest.files.find(v=>v.role==='lock');
 const bytes=canonical({schema:'maestro.dsh.closure/1',profile:'maestro.release.inventory.dsh/1',lock_sha256:lock.sha256,owner:'deepseek-harness',files:rows});
 f.manifest.components[0].files=f.manifest.components[0].files.filter(path=>!rows.some(v=>v.path===path));
 f.manifest.components.push({name:'deepseek-harness',version:'fixture',rationale:'Owned DSH fixture',source:'local-test',files:rows.map(v=>v.path),notices:['notice.fixture']});
 Object.assign(f.manifest,{schema:'maestro.release.manifest.dsh/1',resource_profile:'maestro.release.inventory.dsh/1',dsh_closure:rawDigest(bytes),dsh_lock:{path:lock.path,sha256:lock.sha256}});
 f.closure=TrustedDshClosure.verify(bytes,rawDigest(bytes),lock.sha256);
 const path=join(mkdtempSync(resolve('tools/release/target/closure-')),'closure.json');writeFileSync(path,bytes);
 f.request={op:'release_dsh',closure_path:path,digest:rawDigest(bytes),lock:lock.sha256};
 f.seal=()=>{const manifest=canonical(f.manifest);writeFileSync(join(f.stage,'release.manifest.json'),manifest);writeFileSync(join(f.stage,'release.signature.json'),f.envelope('maestro.release.manifest/1',manifest));};
}
test('both profiles require notice roles and complete unique component ownership',()=>{
 for(const dsh of [false,true])for(const mutate of [f=>f.manifest.components[0].notices=['launcher.fixture'],f=>f.manifest.components[0].files.pop(),f=>f.manifest.components[0].files.push('launcher.fixture')]){const f=fixture();if(dsh)dshProfile(f);f.seal();load(f);mutate(f);f.seal();assert.throws(()=>load(f));assert.equal(rust({op:'release',...f.request,stage:f.stage,root:f.root.toString()}).ok,false);}
});
test('capability implementation references must identify captured paths and hashes',()=>{
 for(const reference of [{path:'missing.js',sha256:'0'.repeat(64)},{path:'launcher.fixture',sha256:'0'.repeat(64)}]){
  const f=fixture(),path=join(f.stage,'catalog.json'),catalog=JSON.parse(readFileSync(path));catalog.entries[0].implementation=[reference];const bytes=canonical(catalog);writeFileSync(path,bytes);
  const row=f.manifest.files.find(v=>v.path==='catalog.json');row.sha256=rawDigest(bytes);row.size=String(bytes.length);f.manifest.catalog.sha256=row.sha256;const manifestBytes=f.seal();
  f.acceptance.entry=structuredDigest('maestro.compatibility.entry/1',catalog.entries[0]);f.acceptance.release=rawDigest(manifestBytes);const record=f.record();
  assert.throws(()=>load(f).admitCapability(f.acceptance.entry,[record],f.evidence));
  assert.equal(rust({op:'release',stage:f.stage,root:f.root.toString(),entry:f.acceptance.entry,records:[{statement:record.statement.toString(),signature:record.signature.toString()}],evidence:Object.fromEntries([...f.evidence].map(([k,v])=>[k,v.toString()]))}).ok,false);
 }
});
test('parse and structure outcomes are distinct and over-budget pass is denied',()=>{
 const profile=canonical(JSON.parse(readFileSync('contracts/profiles/fixture-draft.json'))),input=Buffer.from('{}');
 const binding={project:'p',scope:'s',subject:'x',revision:'1',input:rawDigest(input),dependencies:rawDigest(canonical([])),family:'maestro.fixture.json/1',stage:'draft',profile:rawDigest(profile),schema:'0'.repeat(64),validator:'0'.repeat(64),configuration:'0'.repeat(64),executor:'0'.repeat(64),environment:'0'.repeat(64)};
 const report=checkFixture(input,profile,binding),native=rust({op:'report',text:'{}',profile:profile.toString(),binding}).value;
 for(const r of [report,native]){assert.equal(r.checks[0].outcome,'pass');assert.equal(r.checks[1].outcome,'fail');}
 const short=canonical({...JSON.parse(profile),max_duration_ms:1}),expected={...binding,profile:rawDigest(short)};
 const forged={...report,binding:expected,duration_ms:2,checks:report.checks.map(v=>({...v,outcome:'pass'})),outcome:'pass',diagnostics:[],diagnostic_count:0,truncated:false};
 assert.throws(()=>validateReport(canonical(forged),short,expected));assert.equal(rust({op:'validate_report',text:canonical(forged).toString(),profile:short.toString(),binding:expected}).ok,false);
});
test('regular bounded CLI ingress rejects oversized files and directories',()=>{
 const root=mkdtempSync(resolve('tools/release/target/ingress-')),big=join(root,'big');writeFileSync(big,'');truncateSync(big,16777217);
 for(const path of [root,big]){assert.throws(()=>readRegularFile(path));for(const [exe,args] of [['target/debug/maestro-launcher'+ext,[path,root]],['target/debug/maestro-controller'+ext,[path,path,path]],[process.execPath,['dist/packages/gateway/src/main.js',path,root]]]){const p=spawnSync(exe,args,{encoding:'utf8',timeout:10000});assert.equal(p.status,1,p.stderr);}}
 const path=join(root,'growing');writeFileSync(path,'a');const fd=openSync(path,'r');appendFileSync(path,'x'.repeat(65536));try{assert.throws(()=>readBoundedDescriptor(fd,1));assert.equal(readFileSync(fd).length,65535,'descriptor consumed at most declared size plus one');}finally{closeSync(fd);}
});
test('notice membership rejects omitted empty and duplicate production dependency rows',()=>{
 const rust=[{name:'a',version:'1',checksum:'hash'}],gateway=[{path:'node_modules/a',version:'1',integrity:'sri',origin:'url'}],good={rust,gateway};verifyMembership(good,rust,gateway);
 for(const bad of [{rust:[],gateway},{rust,gateway:[]},{rust:[...rust,...rust],gateway},{rust,gateway:[...gateway,...gateway]}])assert.throws(()=>verifyMembership(bad,rust,gateway));
});
test('controlled reseal reconciles added and removed modules and ownership',()=>{
 const stage=mkdtempSync(resolve('tools/release/target/reconcile-'));mkdirSync(join(stage,'gateway/dist'),{recursive:true});writeFileSync(join(stage,'gateway/dist/old.js'),'old');
 const manifest={files:[{path:'gateway/dist/old.js'}],components:[{name:'maestro',files:['gateway/dist/old.js']}]};
 const captured=new Map([['dist/new.js',Buffer.from('new')],['target/debug/maestro-launcher'+ext,Buffer.from('launcher')],['target/debug/maestro-controller'+ext,Buffer.from('controller')],['plugins/maestro-host.mjs',Buffer.from('host')],['plugins/maestro-client.js',Buffer.from('client')]]);
 controlledAssets(stage,manifest,{captured});assert(!manifest.files.some(v=>v.path.endsWith('old.js')));assert(manifest.files.some(v=>v.path==='gateway/dist/new.js'));assert.deepEqual(manifest.components[0].files,manifest.files.map(v=>v.path));
});
test('retained runtime membership and bytes must match fresh locked build evidence',()=>{
 const captured=new Map([['runtimes/dsh/node_modules/a.js',Buffer.from('a')],['runtimes/gateway/node_modules/b.js',Buffer.from('b')]]);
 const files=[{path:'dsh/node_modules/a.js',sha256:rawDigest('a'),size:'1'},{path:'gateway/node_modules/b.js',sha256:rawDigest('b'),size:'1'}];
 verifyRetainedRuntimes({files},{captured});
 for(const changed of [files.slice(1),[...files,{path:'dsh/node_modules/extra.js',sha256:rawDigest('x'),size:'1'}],files.map(v=>({...v,sha256:rawDigest('tampered')}))])assert.throws(()=>verifyRetainedRuntimes({files:changed},{captured}));
});
test('failed assembly admission retains evidence and returns nonzero to automation',()=>{
 const root=mkdtempSync(resolve('tools/release/target/failed-assembly-')),path=join(root,'assembly-result.json');
 const module=new URL('../../../tools/release/assembly-result.mjs',import.meta.url).href;
 const p=spawnSync(process.execPath,['--input-type=module','-e',`import {persistAssemblyResult} from ${JSON.stringify(module)};persistAssemblyResult(${JSON.stringify(path)},{admission:{ok:false,error:'INTEGRITY'}});`],{encoding:'utf8'});
 assert.equal(p.status,1,p.stderr);assert.deepEqual(JSON.parse(readFileSync(path)),{admission:{ok:false,error:'INTEGRITY'}});
});
