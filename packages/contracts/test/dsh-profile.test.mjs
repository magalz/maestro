import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {canonical,rawDigest,parse,parseWithProfile,validate,validateWithProfile} from '../../../dist/packages/contracts/src/index.js';
import {TrustedDshClosure} from '../../../dist/packages/contracts/src/dsh.js';
import {fixture} from '../../../tools/release/test-fixture.mjs';
const binary=`target/debug/contract-probe${process.platform==='win32'?'.exe':''}`;
function rust(request){const r=spawnSync(binary,[],{input:JSON.stringify(request)+'\n',encoding:'utf8',maxBuffer:64*1024*1024});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).ok;}
const okay=fn=>{try{fn();return true;}catch{return false;}};
function inventory(dshCount,otherCount){
 const base=fixture().manifest;
 const entry=(i,role)=>({path:`${role}/file-${i}.js`,role,sha256:'0'.repeat(64),size:'0',classification:'executable'});
 const files=Array.from({length:dshCount},(_,i)=>entry(i,'dsh'));
 const lock='a'.repeat(64);
 const closure=canonical({schema:'maestro.dsh.closure/1',profile:'maestro.release.inventory.dsh/1',lock_sha256:lock,owner:'deepseek-harness',files});
 const digest=rawDigest(closure),others=Array.from({length:otherCount},(_,i)=>entry(i,'gateway'));
 const manifest={...base,schema:'maestro.release.manifest.dsh/1',resource_profile:'maestro.release.inventory.dsh/1',dsh_closure:digest,dsh_lock:{path:'lock.json',sha256:lock},files:[...files,...others],components:[{name:'deepseek-harness',version:'1',source:'fixture',rationale:'exact test closure',files:files.map(v=>v.path),notices:['notice.txt']},...(others.length?[{name:'other',version:'1',source:'fixture',rationale:'outside closure',files:others.map(v=>v.path),notices:['notice.txt']}]:[])]};
 return {manifest,closure,digest,lock};
}
function check(v){const bytes=canonical(v.manifest);const ts=okay(()=>{const closure=TrustedDshClosure.verify(v.closure,v.digest,v.lock);closure.check(validateWithProfile(v.manifest.schema,bytes,true,'dsh-release'));});assert.equal(rust({op:'dsh_inventory',text:bytes.toString(),closure:v.closure.toString(),digest:v.digest,lock:v.lock}),ts);return ts;}
test('trusted DSH collection entry boundary preserves small parser bounds',()=>{
 for(const [n,expected] of [[65536,true],[65537,true],[262144,true],[262145,false]]){
  const bytes=Buffer.from('['+Array(n).fill('0').join(',')+']');
  assert.equal(okay(()=>parseWithProfile(bytes,'dsh-release')),expected);
  assert.equal(rust({op:'parse_dsh',text:bytes.toString()}),expected);
  assert.equal(okay(()=>parse(bytes)),n<=65536);
 }
});
test('total DSH file and aggregate outside-closure limits are independent',()=>{
 assert.equal(check(inventory(32768,0)),true);
 assert.equal(check(inventory(32768,1)),false);
 assert.equal(check(inventory(1,4096)),true);
 assert.equal(check(inventory(1,4097)),false);
 const v=inventory(1,0);assert.throws(()=>validate(v.manifest.schema,canonical(v.manifest),true));
 for(const n of [4096,4097]){
  const small=fixture().manifest;small.files=Array.from({length:n},(_,i)=>({...small.files[0],path:`file-${i}.js`}));
  const text=canonical(small).toString();
  assert.equal(okay(()=>validate(small.schema,Buffer.from(text),true)),n===4096);
  assert.equal(rust({op:'validate',schema:small.schema,text,immutable:true}),n===4096);
 }
 assert.throws(()=>validateWithProfile('maestro.fixture.json/1',Buffer.from('{"schema":"maestro.fixture.json/1","value":"x","dependencies":[]}'),true,'dsh-release'));
});
test('exact reviewed closure rejects relabeling, missing files, overlapping ownership and wrong lock',()=>{
 const changes=[v=>{v.manifest.files[0].role='gateway';},v=>{v.manifest.files[0].path='dsh/impostor.js';},v=>{v.manifest.components[1].files.push(v.manifest.files[0].path);},v=>{v.manifest.components[0].files.push(v.manifest.files[0].path);},v=>{v.manifest.dsh_lock.sha256='b'.repeat(64);},v=>{v.manifest.dsh_closure='b'.repeat(64);},v=>{v.lock='b'.repeat(64);},v=>{v.digest='b'.repeat(64);}];
 assert.equal(check(inventory(1,1)),true);
 for(const change of changes){const v=inventory(1,1);change(v);assert.equal(check(v),false);}
});
