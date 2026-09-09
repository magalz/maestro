import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
import {ed25519} from '@noble/curves/ed25519.js';
import {canonical,parse,validate,rawDigest,structuredDigest} from '../../../dist/packages/contracts/src/index.js';
import {strictVerify,enroll,transition,transitionSet} from '../../../dist/packages/contracts/src/release.js';
import {checkFixture,validateReport} from '../../../dist/packages/contracts/src/report.js';
import {assertSubset} from '../../../tools/contracts/generate.mjs';
const binary=`target/debug/contract-probe${process.platform==='win32'?'.exe':''}`;
function rust(requests){const result=spawnSync(binary,[],{input:requests.map(v=>JSON.stringify(v)).join('\n')+'\n',encoding:'utf8',maxBuffer:64*1024*1024});assert.equal(result.status,0,result.stderr);return result.stdout.trim().split('\n').map(v=>JSON.parse(v));}
const succeeds=fn=>{try{fn();return true;}catch{return false;}};
test('unsupported references and schema vocabularies fail before generation or resolution',()=>{
 for(const ref of ['https://example.invalid/schema','file:///secret.json','#/$defs/Unknown','#/properties/schema'])assert.throws(()=>assertSubset({$ref:ref}));
 for(const schema of [{type:'string',maxLength:10,format:'email'},{type:'object',properties:{},required:[],additionalProperties:true},{type:'integer',minimum:0,maximum:9007199254740992},{type:'array',items:{type:'boolean'},maxItems:65537}])assert.throws(()=>assertSubset(schema));
 assertSubset(JSON.parse(readFileSync('contracts/schemas/contract-set.schema.json')));
});
test('raw malformed UTF-8, exact bounds and UTF-16 canonical key ordering agree',()=>{
 const values=[Buffer.from([0x22,0xc0,0xaf,0x22]),Buffer.from([0x22,0xed,0xa0,0x80,0x22]),Buffer.from([0x22,0xf4,0x90,0x80,0x80,0x22]),Buffer.from([0x22,0xe2,0x82]),Buffer.alloc(16777217,0x20),Buffer.from('['.repeat(64)+'0'+']'.repeat(64)),Buffer.from('['.repeat(65)+'0'+']'.repeat(65)),Buffer.from('['+Array(65536).fill('0').join(',')+']'),Buffer.from('['+Array(65537).fill('0').join(',')+']'),Buffer.from('"'+'a'.repeat(1048576)+'"'),Buffer.from('"'+'a'.repeat(1048577)+'"')];
 const expected=[false,false,false,false,false,true,false,true,false,true,false];
 const results=rust(values.map(bytes=>({op:'parse_bytes',bytes:bytes.toString('base64url'),length:bytes.length})));
 values.forEach((bytes,i)=>{assert.equal(succeeds(()=>parse(bytes)),expected[i],String(i));assert.equal(results[i].ok,expected[i],String(i));});
 const text='{"\\ue000":1,"😀":2,"a":3,"é":4}';const expectedText='{"a":3,"é":4,"😀":2,"":1}';
 assert.equal(canonical(parse(Buffer.from(text))).toString(),expectedText);assert.equal(rust([{op:'canonical',text}])[0].value,expectedText);
 for(const schema of ['maestro.fixture.json/1','other/1'])assert.equal(rust([{op:'structured_digest',text,schema}])[0].value,structuredDigest(schema,parse(Buffer.from(text))));
 assert.notEqual(structuredDigest('maestro.fixture.json/1',parse(Buffer.from(text))),structuredDigest('other/1',parse(Buffer.from(text))));
});
test('canonical, low-order and mixed-torsion A/R and S+L are rejected strictly',()=>{
 const key=generateKeyPairSync('ed25519'),publicKey=key.publicKey.export({type:'spki',format:'der'}).subarray(-32),message=Buffer.from('strict-purpose\0payload'),signature=sign(null,message,key.privateKey);
 const little=value=>{const b=Buffer.alloc(32);for(let i=0;i<32;i++){b[i]=Number(value&255n);value>>=8n;}return b;};
 const low=ed25519.Point.fromBytes(Buffer.alloc(32),true);assert.equal(low.isSmallOrder(),true);
 const mixed=ed25519.Point.BASE.add(low);assert.equal(mixed.isSmallOrder(),false);assert.equal(mixed.isTorsionFree(),false);
 const points=[Buffer.from(ed25519.Point.ZERO.toBytes()),Buffer.from(low.toBytes()),Buffer.from(mixed.toBytes()),little((1n<<255n)-19n),little((1n<<255n)-18n)];
 const vectors=[{key:publicKey,sig:signature,text:message.toString(),ok:true}];
 for(const point of points){vectors.push({key:point,sig:signature,text:message.toString(),ok:false});vectors.push({key:publicKey,sig:Buffer.concat([point,signature.subarray(32)]),text:message.toString(),ok:false});}
 const scalar=BigInt('0x'+Buffer.from(signature.subarray(32)).reverse().toString('hex'));
 const order=ed25519.Point.Fn.ORDER;
 for(const s of [order,scalar+order,(1n<<256n)-1n])vectors.push({key:publicKey,sig:Buffer.concat([signature.subarray(0,32),little(s)]),text:message.toString(),ok:false});
 vectors.push({key:publicKey,sig:signature,text:'other-purpose\0payload',ok:false});
 const results=rust(vectors.map(v=>({op:'signature',key:v.key.toString('base64url'),signature:v.sig.toString('base64url'),text:v.text})));
 vectors.forEach((v,i)=>{assert.equal(succeeds(()=>strictVerify(v.key,v.sig,Buffer.from(v.text))),v.ok,String(i));assert.equal(results[i].ok,v.ok,String(i));});
});
test('independent enrollment, dual signatures, explicit acceptance and trust replay',()=>{
 const key=()=>{const value=generateKeyPairSync('ed25519');return {...value,encoded:value.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url')};};
 const old=key(),next=key();const fingerprint=rawDigest(Buffer.from(old.encoded,'base64url'));
 const root={schema:'maestro.trust.root/1',purpose:'maestro.distribution',public_key:old.encoded,fingerprint,revision:'1',status:'active'};
 for(const [fp,accepted,ok] of [[fingerprint,true,true],['0'.repeat(64),true,false],[fingerprint,false,false]]){assert.equal(succeeds(()=>enroll(canonical(root),fp,accepted)),ok);assert.equal(rust([{op:'enroll',text:canonical(root).toString(),fingerprint:fp,accepted}])[0].ok,ok);}
 const statement={schema:'maestro.trust.transition/1',purpose:'maestro.distribution',old_key:old.encoded,new_key:next.encoded,revision:'2'};
 const envelope=(s,key,purpose=statement.schema)=>canonical({schema:'maestro.trust.transition-signature/1',public_key:key.encoded,signature:sign(null,Buffer.concat([Buffer.from(purpose+'\0'),canonical(s)]),key.privateKey).toString('base64url')});
 const cases=[{root,statement,accepted:true,ok:true},{root,statement,accepted:false,ok:false},{root:{...root,status:'revoked'},statement,accepted:true,ok:false},{root:{...root,revision:'2'},statement,accepted:true,ok:false},{root,statement:{...statement,revision:'4'},accepted:true,ok:false},{root,statement:{...statement,new_key:old.encoded},accepted:true,ok:false}];
 for(const v of cases){const a=envelope(v.statement,old),b=envelope(v.statement,next);const request={op:'transition',root:canonical(v.root).toString(),text:canonical(v.statement).toString(),old:a.toString(),new:b.toString(),accepted:v.accepted};assert.equal(succeeds(()=>transition(canonical(v.root),canonical(v.statement),a,b,v.accepted)),v.ok);assert.equal(rust([request])[0].ok,v.ok);}
 const a=envelope(statement,old),b=envelope(statement,next,'wrong-purpose/1');assert.throws(()=>transition(canonical(root),canonical(statement),a,b,true));assert.equal(rust([{op:'transition',root:canonical(root).toString(),text:canonical(statement).toString(),old:a.toString(),new:b.toString(),accepted:true}])[0].ok,false);
 const record={statement:canonical(statement),oldSignature:a,newSignature:envelope(statement,next)};
 const expectedRoot=canonical({...root,public_key:next.encoded,fingerprint:rawDigest(Buffer.from(next.encoded,'base64url')),revision:'2'});
 const rotated=transition(canonical(root),record.statement,record.oldSignature,record.newSignature,true);
 assert.deepEqual(rotated,expectedRoot);
 const rotateRequest={op:'transition',root:canonical(root).toString(),text:record.statement.toString(),old:record.oldSignature.toString(),new:record.newSignature.toString(),accepted:true};
 const nativeRotated=rust([rotateRequest])[0];assert.equal(nativeRotated.ok,true);assert.equal(nativeRotated.value,expectedRoot.toString());
 assert.throws(()=>transition(rotated,record.statement,record.oldSignature,record.newSignature,true));
 assert.equal(rust([{...rotateRequest,root:nativeRotated.value}])[0].ok,false);
 const third=key(),thirdStatement={...statement,old_key:next.encoded,new_key:third.encoded,revision:'3'};
 const thirdOld=envelope(thirdStatement,next),thirdNew=envelope(thirdStatement,third),expectedThird=canonical({...root,public_key:third.encoded,fingerprint:rawDigest(Buffer.from(third.encoded,'base64url')),revision:'3'});
 assert.deepEqual(transition(rotated,canonical(thirdStatement),thirdOld,thirdNew,true),expectedThird);
 assert.equal(rust([{op:'transition',root:nativeRotated.value,text:canonical(thirdStatement).toString(),old:thirdOld.toString(),new:thirdNew.toString(),accepted:true}])[0].value,expectedThird.toString());
 for(const records of [[],[record],[record,record]]){const ok=records.length===1;assert.equal(succeeds(()=>transitionSet(canonical(root),records,true)),ok);assert.equal(rust([{op:'transition_set',root:canonical(root).toString(),records:records.map(v=>Object.fromEntries(Object.entries(v).map(([k,bytes])=>[k,bytes.toString()]))),accepted:true}])[0].ok,ok);}
});
test('report resource, disclosure, required error, unknown identities and dependency mismatch',()=>{
 const profile=JSON.parse(readFileSync('contracts/profiles/fixture-draft.json'));const profileBytes=canonical(profile);
 const input=canonical({schema:'maestro.fixture.json/1',value:'do not leak: secret-fixture',dependencies:[]});
 const binding={project:'p',scope:'s',subject:'x',revision:'1',input:rawDigest(input),dependencies:rawDigest(canonical([])),family:'maestro.fixture.json/1',stage:'draft',profile:rawDigest(profileBytes),schema:'0'.repeat(64),validator:'0'.repeat(64),configuration:'0'.repeat(64),executor:'0'.repeat(64),environment:'0'.repeat(64)};
 const good=checkFixture(input,profileBytes,binding);
 for(const report of [{...good,checker:'unknown/1'},{...good,checks:[{id:'parse',outcome:'error'},...good.checks.slice(1)]},{...good,duration_ms:1001},{...good,diagnostics:[{rule:'STRUCTURE',location:'secret-path',message:'secret-fixture',hint:'unsafe'}],diagnostic_count:1},{...good,diagnostic_count:65537},{...good,provenance:{kind:'reused',source_receipt:'0'.repeat(64)}}]){assert.throws(()=>validateReport(canonical(report),profileBytes,binding));assert.equal(rust([{op:'validate_report',text:canonical(report).toString(),profile:profileBytes.toString(),binding}])[0].ok,false);}
 for(const key of ['schema','family','validator']){const bad=canonical({...profile,[key]:'unknown/1'});assert.throws(()=>checkFixture(input,bad,binding));assert.equal(rust([{op:'report',text:input.toString(),profile:bad.toString(),binding}])[0].ok,false);}
 const tiny=canonical({...profile,max_diagnostics:0});const tinyBinding={...binding,profile:rawDigest(tiny)};
 const failed=checkFixture(Buffer.from('{"secret-fixture":'),tiny,tinyBinding);assert.notEqual(failed.outcome,'pass');assert.equal(failed.truncated,true);assert.equal(failed.diagnostics.length,0);assert.ok(failed.diagnostic_count>0);assert.ok(!canonical(failed).toString().includes('secret-fixture'));
 const native=rust([{op:'report',text:'{"secret-fixture":',profile:tiny.toString(),binding:tinyBinding}])[0];assert.equal(native.ok,true);assert.notEqual(native.value.outcome,'pass');assert.equal(native.value.truncated,true);
 const dependencies=[{id:'same',text:'a'},{id:'same',text:'b'}];const mismatch=rust([{op:'report',text:input.toString(),profile:profileBytes.toString(),binding,dependencies}])[0];assert.equal(mismatch.ok,true);assert.notEqual(mismatch.value.outcome,'pass');assert.notEqual(checkFixture(input,profileBytes,binding,dependencies.map(v=>({id:v.id,bytes:Buffer.from(v.text)}))).outcome,'pass');
 // A concurrent edit changes the independently observed binding before admission.
 const edited=canonical({...JSON.parse(input),value:'edited after check'}),changed={...binding,input:rawDigest(edited)};
 assert.throws(()=>validateReport(canonical(good),profileBytes,changed));assert.equal(rust([{op:'validate_report',text:canonical(good).toString(),profile:profileBytes.toString(),binding:changed}])[0].ok,false);
 const reused={...good,provenance:{kind:'reused',source_receipt:'0'.repeat(64)},fresh_count:0,reused_count:1};
 validate('maestro.validation.report/1',canonical(reused));assert.throws(()=>validateReport(canonical(reused),profileBytes,binding));
 const accepted=canonical({...profile,stage:'accepted'}),noncanonical=Buffer.from(JSON.stringify({schema:'maestro.fixture.json/1',value:'accepted',dependencies:[]})),prior=Buffer.from(noncanonical);
 const acceptedBinding={...binding,stage:'accepted',profile:rawDigest(accepted),input:rawDigest(noncanonical)};
 assert.notEqual(checkFixture(noncanonical,accepted,acceptedBinding).outcome,'pass');assert.equal(rust([{op:'report',text:noncanonical.toString(),profile:accepted.toString(),binding:acceptedBinding}])[0].value.outcome,'fail');assert.deepEqual(noncanonical,prior);
});
test('finite execution and report-wire limits fail closed without repairing input',()=>{
 const profile=JSON.parse(readFileSync('contracts/profiles/fixture-draft.json'));profile.max_duration_ms=1;
 const profileBytes=canonical(profile),record=canonical({schema:'maestro.fixture.json/1',value:'bounded work',dependencies:[]});
 const input=Buffer.concat([record,Buffer.alloc(262144-record.length,0x20)]),before=rawDigest(input);
 const binding={project:'p',scope:'s',subject:'x',revision:'1',input:before,dependencies:rawDigest(canonical([])),family:'maestro.fixture.json/1',stage:'draft',profile:rawDigest(profileBytes),schema:'0'.repeat(64),validator:'0'.repeat(64),configuration:'0'.repeat(64),executor:'0'.repeat(64),environment:'0'.repeat(64)};
 const report=checkFixture(input,profileBytes,binding);assert.equal(report.outcome,'error');assert.ok(report.duration_ms>profile.max_duration_ms);assert.ok(report.diagnostics.some(v=>v.rule==='TIMEOUT'));assert.equal(rawDigest(input),before);
 const native=rust([{op:'report',text:input.toString(),profile:profileBytes.toString(),binding}])[0];assert.equal(native.ok,true);assert.equal(native.value.outcome,'error');assert.ok(native.value.diagnostics.some(v=>v.rule==='TIMEOUT'));
 assert.ok(native.value.duration_ms>profile.max_duration_ms);
 const tiny=canonical({...profile,max_duration_ms:1000,max_report_bytes:1}),tinyBinding={...binding,profile:rawDigest(tiny)};
 assert.throws(()=>checkFixture(record,tiny,tinyBinding));assert.equal(rust([{op:'report',text:record.toString(),profile:tiny.toString(),binding:tinyBinding}])[0].ok,false);
});
