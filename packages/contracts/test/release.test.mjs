import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,renameSync,linkSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from '../../../tools/release/test-fixture.mjs';
import { VerifiedRelease } from '../../../dist/packages/contracts/src/release.js';
import { canonical,rawDigest } from '../../../dist/packages/contracts/src/index.js';
const binary=`target/debug/contract-probe${process.platform==='win32'?'.exe':''}`;
function check(f,extra={}) {
 const request={op:'release',stage:f.stage,root:f.root.toString(),...extra};
 const result=spawnSync(binary,[],{input:JSON.stringify(request)+'\n',encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
function load(f){return VerifiedRelease.verify(readFileSync(join(f.stage,'release.manifest.json')),readFileSync(join(f.stage,'release.signature.json')),f.root,f.stage);}

test('pre-activation selection denies changed bytes and replaced file identities',()=>{
 const f=fixture(),release=load(f),path=join(f.stage,'launcher.fixture');
 release.assertSelectionUnchanged(['launcher.fixture']);
 const original=readFileSync(path);writeFileSync(path,'modified');
 assert.throws(()=>release.assertSelectionUnchanged(['launcher.fixture']));
 writeFileSync(path,original);release.assertSelectionUnchanged(['launcher.fixture']);
 renameSync(path,path+'.preserved');writeFileSync(path,original);
 assert.throws(()=>release.assertSelectionUnchanged(['launcher.fixture']));
 assert.deepEqual(release.select('launcher.fixture'),original);
});
test('every inventoried role rejects byte tampering in Rust and TypeScript',()=>{
 const f=fixture();assert.equal(check(f).ok,true);const release=load(f);
 for(const file of f.manifest.files){const path=join(f.stage,file.path),bytes=readFileSync(path);writeFileSync(path,Buffer.concat([bytes,Buffer.from('tamper')]));assert.throws(()=>load(f),file.role);assert.equal(check(f).ok,false,file.role);writeFileSync(path,bytes);}
 // Previously captured bytes remain immutable after path substitution.
 const selected=release.select('launcher.fixture');writeFileSync(join(f.stage,'launcher.fixture'),'changed');assert.deepEqual(release.select('launcher.fixture'),selected);
});
test('closed inventory rejects extra files, missing files, hard links and traversal',()=>{
 const f=fixture(),path=join(f.stage,'launcher.fixture');
 writeFileSync(join(f.stage,'extra'),'unexpected');assert.throws(()=>load(f));assert.equal(check(f).ok,false);unlinkSync(join(f.stage,'extra'));
 renameSync(path,path+'.backup');assert.throws(()=>load(f));assert.equal(check(f).ok,false);renameSync(path+'.backup',path);
 linkSync(path,path+'.alias');assert.throws(()=>load(f));assert.equal(check(f).ok,false);unlinkSync(path+'.alias');
 f.manifest.files[0].path='nested/../escape';f.seal();assert.throws(()=>load(f));assert.equal(check(f).ok,false);
});
test('external acceptance requires exact passing coverage and rejects conflicts',()=>{
 const f=fixture(),release=load(f);
 const checkRecord=(records)=>check(f,{entry:f.acceptance.entry,records:records.map(v=>({statement:v.statement.toString(),signature:v.signature.toString()})),evidence:Object.fromEntries([...f.evidence].map(([k,v])=>[k,v.toString()]))});
 const record=f.record();release.admitCapability(f.acceptance.entry,[record],f.evidence);assert.equal(checkRecord([record]).ok,true);
 for(const records of [[],[record,record]]){assert.throws(()=>release.admitCapability(f.acceptance.entry,records,f.evidence));assert.equal(checkRecord(records).ok,false);}
 for(const field of ['release','entry','policy','case_set']){const prior=f.acceptance[field];f.acceptance[field]='1'.repeat(64);const bad=f.record();assert.throws(()=>release.admitCapability(prior===f.acceptance.entry?prior:f.acceptance.entry,[bad],f.evidence));assert.equal(checkRecord([bad]).ok,false);f.acceptance[field]=prior;}
 f.acceptance.cases=[];const omitted=f.record();assert.throws(()=>release.admitCapability(f.acceptance.entry,[omitted],f.evidence));assert.equal(checkRecord([omitted]).ok,false);
});
test('a freshly signed substituted binding does not replace the compiled trusted binding',()=>{
 const f=fixture();const binding=f.manifest.files.find(v=>v.path==='binding.ts');
 const bytes=Buffer.concat([readFileSync(join(f.stage,binding.path)),Buffer.from('\n// substitution')]);writeFileSync(join(f.stage,binding.path),bytes);binding.sha256=rawDigest(bytes);binding.size=String(bytes.length);
 const registry=JSON.parse(readFileSync(join(f.stage,'registry.json')));registry.bindings.find(v=>v.path===binding.path).sha256=binding.sha256;
 const registryBytes=canonical(registry);writeFileSync(join(f.stage,'registry.json'),registryBytes);const registryFile=f.manifest.files.find(v=>v.path==='registry.json');registryFile.sha256=rawDigest(registryBytes);registryFile.size=String(registryBytes.length);f.manifest.registry.sha256=registryFile.sha256;f.seal();
 assert.throws(()=>load(f),/BINDING_INTEGRITY/);assert.equal(check(f).ok,false);
});
test('acceptance route, disposition, evidence bytes and signer cannot be substituted',()=>{
 const f=fixture(),release=load(f),original=structuredClone(f.acceptance);
 for(const mutate of [v=>v.route='other-route',v=>v.outcome='fail',v=>v.cases[0].outcome='error',v=>v.cases[0].evidence.sha256='0'.repeat(64)]){
  Object.assign(f.acceptance,structuredClone(original));mutate(f.acceptance);const record=f.record();assert.throws(()=>release.admitCapability(original.entry,[record],f.evidence));
  assert.equal(check(f,{entry:original.entry,records:[{statement:record.statement.toString(),signature:record.signature.toString()}],evidence:Object.fromEntries([...f.evidence].map(([k,v])=>[k,v.toString()]))}).ok,false);
 }
 Object.assign(f.acceptance,structuredClone(original));const record=f.record();assert.throws(()=>release.admitCapability(original.entry,[record],new Map()));assert.equal(check(f,{entry:original.entry,records:[{statement:record.statement.toString(),signature:record.signature.toString()}],evidence:{}}).ok,false);
 const other=fixture();assert.throws(()=>VerifiedRelease.verify(readFileSync(join(f.stage,'release.manifest.json')),readFileSync(join(f.stage,'release.signature.json')),other.root,f.stage));assert.equal(check({...f,root:other.root}).ok,false);
});
