// Synthetic admission fixture. Its ephemeral key and dummy runtime bytes MUST NOT be distributed.
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, rawDigest, structuredDigest, validate } from '../../dist/packages/contracts/src/index.js';
export function fixture(){
 mkdirSync('tools/release/target',{recursive:true});const stage=mkdtempSync('tools/release/target/admission-');
 const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url');
 const fingerprint=rawDigest(Buffer.from(publicKey,'base64url'));
 const root=canonical({schema:'maestro.trust.root/1',purpose:'maestro.distribution',public_key:publicKey,fingerprint,revision:'1',status:'active'});
 const files=[];
 const add=(path,role,bytes)=>{writeFileSync(join(stage,path),bytes);const ref={path,sha256:rawDigest(bytes)};files.push({...ref,role,size:String(bytes.length),classification:['launcher','controller','gateway','plugin','dsh','node'].includes(role)?'executable':'data'});return ref;};
 for(const role of ['launcher','controller','gateway','plugin','dsh','node','lock','provenance','notice'])add(role+'.fixture',role,Buffer.from('SYNTHETIC ADMISSION TEST ONLY: '+role));
 const schema={id:'maestro.contract-set/2',...add('schema.json','schema',readFileSync('contracts/schemas/contract-set-v2.schema.json'))};
 const binding=add('binding.ts','binding',readFileSync('packages/contracts/src/generated.ts'));
 const rustBinding=add('binding.rs','binding',readFileSync('crates/maestro-contracts/src/generated.rs'));
 const profile=add('profile.json','profile',canonical(JSON.parse(readFileSync('contracts/profiles/fixture-draft.json'))));
 const registry=add('registry.json','validator',canonical({schema:'maestro.validator.registry/1',validator:'maestro.validators/1',schemas:[schema],bindings:[binding,rustBinding],profiles:[profile]}));
 const bootstrap=add('bootstrap.json','bootstrap',canonical({schema:'maestro.runtime.bootstrap/1',runtime:'fixture/1',database_schema:'fixture/1',catalog_schema:'maestro.compatibility.catalog/1',minimum_policy:'fixture/1',migrations:[]}));
 const entry={domain:'installation',source_contract:'fixture/1',source_schema:'fixture/1',source_profile:'fixture/1',reader:{kind:'self'},route:'fixture-only',minimum_policy:'fixture/1',capability:'current_state_read',implementation:[],preconditions:[],postconditions:[],recovery:'stop'};
 const catalog=add('catalog.json','catalog',canonical({schema:'maestro.compatibility.catalog/1',entries:[entry]}));
 const required=['fixture-byte-selection'];
 const policy=add('policy.json','profile',canonical({schema:'maestro.release.acceptance-policy/1',signer:fingerprint,statement_schema:'maestro.release.acceptance/1',signature_profile:'maestro.ed25519-strict/1',required:[{capability:entry.capability,cases:required}]}));
 const manifest={schema:'maestro.release.manifest/1',version:'synthetic-test-only',source_commit:'0'.repeat(40),source_tree:'0'.repeat(40),route:entry.route,signer:fingerprint,trust_revision:'1',digest_profile:'maestro.raw-sha256/1',signature_profile:'maestro.ed25519-strict/1',files,components:[{name:'synthetic-test',version:'1',rationale:'Admission test fixture; no executable distribution',files:files.map(v=>v.path),notices:['notice.fixture'],source:'local-test'}],registry,bootstrap,catalog,acceptance_policy:policy,migrations:[]};
 const envelope=(purpose,bytes)=>canonical({schema:purpose==='maestro.release.manifest/1'?'maestro.release.signature/1':purpose.replace('/1','-signature/1'),public_key:publicKey,signature:sign(null,Buffer.concat([Buffer.from(purpose+'\0'),bytes]),keys.privateKey).toString('base64url')});
 const seal=()=>{const bytes=canonical(manifest);validate(manifest.schema,bytes,true);writeFileSync(join(stage,'release.manifest.json'),bytes);writeFileSync(join(stage,'release.signature.json'),envelope(manifest.schema,bytes));return bytes;};
 const bytes=seal();
 const evidence=new Map([['evidence.json',Buffer.from('synthetic pass evidence')]]);
 const acceptance={schema:'maestro.release.acceptance/1',release:rawDigest(bytes),entry:structuredDigest('maestro.compatibility.entry/1',entry),policy:policy.sha256,route:entry.route,case_set:rawDigest(canonical(required)),outcome:'pass',cases:[{id:required[0],outcome:'pass',evidence:{path:'evidence.json',sha256:rawDigest(evidence.get('evidence.json'))}}]};
 const record=()=>{const statement=canonical(acceptance);return {statement,signature:envelope(acceptance.schema,statement)};};
 return {stage,root,manifest,seal,envelope,acceptance,record,evidence};
}
