import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { canonical, parse, rawDigest, validate } from '../../../dist/packages/contracts/src/index.js';
import { strictVerify } from '../../../dist/packages/contracts/src/release.js';
import { checkFixture, validateReport } from '../../../dist/packages/contracts/src/report.js';
const executable=`target/debug/contract-probe${process.platform==='win32'?'.exe':''}`;
function rust(requests) {
 const result=spawnSync(executable,[],{input:requests.map(v=>JSON.stringify(v)).join('\n')+'\n',encoding:'utf8',maxBuffer:32*1024*1024});
 assert.equal(result.status,0,result.stderr??String(result.error));
 return result.stdout.trim().split('\n').map(v=>JSON.parse(v));
}
test('strict JSON admission and canonical bytes agree across languages',()=>{
 const good=['{}','{"emoji":"😀","number":9007199254740991}','{"x":"é"}','{"x":"é"}','{"x":-1}','[true,false,null]'];
 const bad=['{"x":1,"x":2}','{"x":1,"\\u0078":2}','{"x":1.0}','{"x":1e0}','{"x":-0}','{"x":9007199254740992}','{"x":"\\ud800"}','{"x":"\\udc00"}','{"x":1,}','/*comment*/{}','\ufeff{}','{"x":NaN}','{"x":Infinity}','[01]','[+1]','{} trailing','['.repeat(65)+'0'+']'.repeat(65),'"'+'a'.repeat(1048577)+'"','['+'0,'.repeat(65536)+'0]'];
 const result=rust([...good,...bad].map(text=>({op:'parse',text})));
 [...good,...bad].forEach((text,i)=>{let ok=true;try{parse(Buffer.from(text));}catch{ok=false;}assert.equal(ok,i<good.length,text.slice(0,80));assert.equal(result[i].ok,ok,text.slice(0,80));});
 const canon=rust(good.map(text=>({op:'canonical',text})));
 good.forEach((text,i)=>assert.equal(canon[i].value,canonical(parse(Buffer.from(text))).toString()));
 assert.notEqual(rawDigest(canonical(parse(Buffer.from(good[2])))),rawDigest(canonical(parse(Buffer.from(good[3])))));
});
test('closed schema, duplicate semantic identities and immutable bytes',()=>{
 const value={schema:'maestro.fixture.json/1',value:'hello',dependencies:[]};
 const variants=[canonical(value).toString(),JSON.stringify(value),JSON.stringify({...value,extra:true}),JSON.stringify({...value,schema:'unknown/1'}),JSON.stringify({...value,dependencies:[{id:'a',digest:'0'.repeat(64)},{id:'a',digest:'0'.repeat(64)}]})];
 for(const immutable of [false,true]){
 const result=rust(variants.map(text=>({op:'validate',schema:value.schema,text,immutable})));
 variants.forEach((text,i)=>{let ok=true;try{validate(value.schema,Buffer.from(text),immutable);}catch{ok=false;}assert.equal(result[i].ok,ok);assert.equal(ok, i===0 || (i===1&&!immutable));});
 }
});
test('strict Ed25519 rejects message changes, identities and noncanonical scalars',()=>{
 const keys=generateKeyPairSync('ed25519'),message=Buffer.from('development vector');
 const publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32), signature=sign(null,message,keys.privateKey);
 const mutated=Buffer.from(signature);mutated.fill(255,32);
 const identity=Buffer.alloc(32);identity[0]=1;
 const vectors=[{publicKey,signature,message,ok:true},{publicKey,signature,message:Buffer.from('other'),ok:false},{publicKey,signature:mutated,message,ok:false},{publicKey:identity,signature,message,ok:false},{publicKey,signature:Buffer.concat([identity,signature.subarray(32)]),message,ok:false}];
 const result=rust(vectors.map(v=>({op:'signature',key:v.publicKey.toString('base64url'),signature:v.signature.toString('base64url'),text:v.message.toString()})));
 vectors.forEach((v,i)=>{let ok=true;try{strictVerify(v.publicKey,v.signature,v.message);}catch{ok=false;}assert.equal(ok,v.ok);assert.equal(result[i].ok,v.ok);});
});
test('complete report coverage and every bound identity are enforced',()=>{
 const profile=readFileSync('contracts/profiles/fixture-draft.json'),input=canonical({schema:'maestro.fixture.json/1',value:'draft',dependencies:[]});
 const binding={project:'p',scope:'s',subject:'a',revision:'1',input:rawDigest(input),dependencies:rawDigest(canonical([])),family:'maestro.fixture.json/1',stage:'draft',profile:rawDigest(profile),schema:'0'.repeat(64),validator:'0'.repeat(64),configuration:'0'.repeat(64),executor:'0'.repeat(64),environment:'0'.repeat(64)};
 const report=checkFixture(input,profile,binding);assert.equal(report.outcome,'pass');
 const native=rust([{op:'report',text:input.toString(),profile:profile.toString(),binding}])[0];assert.equal(native.ok,true);validateReport(canonical(native.value),profile,binding);
 const variants=[{...report,checks:report.checks.slice(1)},{...report,checks:[report.checks[0],report.checks[0],report.checks[2]]},{...report,outcome:'fail'},{...report,truncated:true},{...report,provenance:{kind:'reused',source_receipt:'0'.repeat(64)}}];
 for(const key of Object.keys(binding))variants.push({...report,binding:{...binding,[key]:key==='revision'?'2':key==='stage'?'accepted':key==='family'?'unknown/1':/^(input|dependencies|profile|schema|validator|configuration|executor|environment)$/.test(key)?'1'.repeat(64):'other'}});
 const result=rust(variants.map(v=>({op:'validate_report',text:canonical(v).toString(),profile:profile.toString(),binding})));
 variants.forEach((v,i)=>{assert.throws(()=>validateReport(canonical(v),profile,binding));assert.equal(result[i].ok,false);});
 const failed=checkFixture(Buffer.from('{invalid'),profile,binding);assert.notEqual(failed.outcome,'pass');
});
