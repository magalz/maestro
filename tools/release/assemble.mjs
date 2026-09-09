// Reviewable development candidate only. No production key, enrollment or acceptance is created.
import { readFileSync as readFromDisk,writeFileSync,mkdirSync,mkdtempSync,readdirSync,lstatSync,existsSync } from 'node:fs';
import { join,resolve,dirname,basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync,sign } from 'node:crypto';
import { canonical,rawDigest,validateWithProfile } from '../../dist/packages/contracts/src/index.js';
import { TrustedDshClosure } from '../../dist/packages/contracts/src/dsh.js';
import { VerifiedRelease } from '../../dist/packages/contracts/src/release.js';
import { foundationAssets } from './foundation-assets.mjs';
import { captureBuild } from './build-inputs.mjs';
import {gatewayWrapper} from './controlled-assets.mjs';
import {persistAssemblyResult} from './assembly-result.mjs';
const run=(command,args,options={})=>{const r=spawnSync(command,args,{encoding:'utf8',...options});if(r.status!==0)throw Error(`${command} failed: ${r.stderr||r.error}`);return r.stdout.trim();};
if(process.argv.includes('--verify-fixture')) {console.log(run(process.execPath,['--test','packages/contracts/test/release.test.mjs']));process.exit(0);}
if(process.argv.length!==4)throw Error('Usage: node tools/release/assemble.mjs BUILD_RECORD EXPECTED_BUILD_RECORD_SHA256');
const build=captureBuild(process.cwd(),process.argv[2],process.argv[3]);
function readFileSync(path,encoding){const prefix=build.record.directory+String.fromCharCode(92);const text=String(path);if(text.startsWith(prefix)||text.startsWith(build.record.directory+'/')){const bytes=build.captured.get(text.slice(build.record.directory.length+1).replaceAll(String.fromCharCode(92),'/'));if(!bytes)throw Error('Uncaptured runtime input');return encoding?bytes.toString(encoding):bytes;}return readFromDisk(path,encoding);}
const target=resolve('tools/release/target');mkdirSync(target,{recursive:true});
const directory=mkdtempSync(join(target,'candidate-'));const stage=join(directory,'staged');mkdirSync(stage);
const blockers=[];const files=[];const components=[];
function add(path,role,bytes){mkdirSync(dirname(join(stage,path)),{recursive:true});writeFileSync(join(stage,path),bytes);const ref={path,sha256:rawDigest(bytes)};files.push({...ref,role,size:String(bytes.length),classification:['launcher','controller','gateway','plugin','dsh','node'].includes(role)?'executable':'data'});return ref;}
function copy(source,path,role){return add(path,role,readFileSync(source));}
function component(name,version,rationale,source,refs,notices){components.push({name,version,rationale,source,files:refs.map(v=>v.path),notices:notices.map(v=>v.path)});}
const ext=process.platform==='win32'?'.exe':'';
const local=[];
for(const [name,role] of [['maestro-launcher','launcher'],['maestro-controller','controller']])local.push(add(`${name}${ext}`,role,build.captured.get(`target/debug/${name}${ext}`)));
// Managed Node is copied from the executing pinned runtime; never resolved from a user's PATH at runtime.
if(process.version!=='v24.20.0')throw Error('Expected Node v24.20.0');
const node=copy(process.execPath,'node'+ext,'node');
const nodeNoticePath=join(resolve(process.execPath,'..'),'LICENSE');
let nodeNotice;try{nodeNotice=copy(nodeNoticePath,'NODE-NOTICE.txt','notice');}catch{blockers.push({kind:'missing_notice',component:'Node',path:nodeNoticePath});}
component('node','24.20.0','Managed JavaScript runtime','https://nodejs.org/dist/v24.20.0/',[node],nodeNotice?[nodeNotice]:[]);
// Preserve every production runtime file at its original relative location.
const probe=join(build.record.directory,'runtimes/dsh');
function capturedRuntime(source,path,role){const relative=source.slice(build.record.directory.length+1).replaceAll('\\','/');const bytes=build.captured.get(relative);if(!bytes)throw Error('Uncaptured runtime input');return add(path,role,bytes);}
function flat(source,prefix,role){const relative=source.slice(build.record.directory.length+1).replaceAll(String.fromCharCode(92),'/')+'/';const rows=[...build.captured].filter(([path])=>path.startsWith(relative));if(!rows.length)throw Error('Missing captured runtime');return rows.map(([path,bytes])=>add(prefix+'/'+path.slice(relative.length),role,bytes));}
const dsh=flat(join(probe,'node_modules'),'dsh/node_modules','dsh');
const lock=capturedRuntime(join(probe,'package-lock.json'),'dsh-package-lock.json','lock');
const lockValue=JSON.parse(readFileSync(join(probe,'package-lock.json')));
const packages=[];const notices=[];
const upstreamNotices=existsSync('tools/release/notices/sources.json')?JSON.parse(readFileSync('tools/release/notices/sources.json')):[];
for(const [path,pkg] of Object.entries(lockValue.packages)){
 if(!path || !path.startsWith('node_modules/'))continue;
 const full=join(probe,path);if(!existsSync(join(full,'package.json'))) {if(pkg.optional)continue;throw Error(`Missing locked package ${path}`);}const declared=JSON.parse(readFileSync(join(full,'package.json')));
 const noticeFiles=readdirSync(full).filter(name=>/^(license|licence|copying|notice)(\.|$)/i.test(name)&&lstatSync(join(full,name)).isFile());
 const readme=join(full,'README.md');
 if(!noticeFiles.length && existsSync(readme) && /Permission is hereby granted[\s\S]*THE SOFTWARE IS PROVIDED/i.test(readFileSync(readme,'utf8')))noticeFiles.push('README.md');
 if(!noticeFiles.length && declared.name==='@koromix/koffi-win32-x64'){
  const companion=JSON.parse(readFileSync(join(probe,'node_modules/koffi/package.json')));
  if(companion.version===declared.version)noticeFiles.push('../../koffi/LICENSE.txt');
 }
 const upstream=upstreamNotices.find(v=>v.name===declared.name&&v.version===declared.version&&v.integrity===pkg.integrity&&['immutable-source-associated','declared-standard-license-associated'].includes(v.status));
 const entry={name:declared.name,version:declared.version,integrity:pkg.integrity??'',license:declared.license??'',notices:noticeFiles,upstreamNotices:upstream?.notices??[]};packages.push(entry);
 if(!noticeFiles.length&&!upstream?.notices.length)blockers.push({kind:'notice_review',component:declared.name,version:declared.version,license:declared.license??'',path,detail:'No standalone notice or complete README license found for this package; immutable upstream source association remains unresolved.'});
 for(const name of noticeFiles)notices.push(`\n===== ${declared.name}@${declared.version}/${name} =====\n${readFileSync(join(full,name),'utf8')}\n`);
 for(const ref of upstream?.notices??[]){if(!/^[A-Za-z0-9_.-]+$/.test(ref.path))throw Error('Unsafe notice path');const bytes=readFileSync(join('tools/release/notices',ref.path));if(rawDigest(bytes)!==ref.sha256)throw Error('Notice digest mismatch');notices.push(`\n===== ${declared.name}@${declared.version} | ${ref.origin} | SHA256 ${ref.sha256} =====\n${bytes.toString('utf8')}\n`);}
}
const notice=add('DSH-THIRD-PARTY-NOTICES.txt','notice',Buffer.from(notices.join('')));
const dependencies=add('dsh-dependencies.json','provenance',canonical({schema:'maestro.build.dependency-evidence/1',packages}));
component('deepseek-harness','0.1.2-rc.1','Pinned managed DSH closure; no upstream modifications','https://github.com/deepseek-ai/deepseek-harness',dsh,[notice]);
// Contract consumers are shipped with their exact JavaScript dependency closure.
const gateway=add('gateway.js','gateway',gatewayWrapper);local.push(gateway);
for(const [path,bytes] of build.captured)if(path.startsWith('dist/'))local.push(add('gateway/'+path,'gateway',bytes));
local.push(...flat(join(build.record.directory,'runtimes/gateway/node_modules'),'gateway/node_modules','gateway'));
const plugin=add('maestro-client.js','plugin',build.captured.get('plugins/maestro-client.js'));local.push(plugin);
const host=add('maestro-host.mjs','plugin',build.captured.get('plugins/maestro-host.mjs'));local.push(host);
const schema={id:'maestro.contract-set/2',...copy('contracts/schemas/contract-set-v2.schema.json','contract-set.schema.json','schema')};local.push(schema);
const bindings=[copy('packages/contracts/src/generated.ts','bindings.ts','binding'),copy('crates/maestro-contracts/src/generated.rs','bindings.rs','binding')];local.push(...bindings);
const profile=add('artifact-profile.json','profile',canonical(JSON.parse(readFileSync('contracts/profiles/fixture-draft.json'))));local.push(profile);
const registry=add('registry.json','validator',canonical({schema:'maestro.validator.registry/1',validator:'maestro.validators/1',schemas:[schema],bindings,profiles:[profile]}));local.push(registry);
const bootstrap=add('bootstrap.json','bootstrap',canonical({schema:'maestro.runtime.bootstrap/1',runtime:'maestro.development/1',database_schema:'maestro.uninitialized/1',catalog_schema:'maestro.compatibility.catalog/1',minimum_policy:'maestro.development/1',migrations:[]}));local.push(bootstrap);
const catalog=add('catalog.json','catalog',canonical({schema:'maestro.compatibility.catalog/1',entries:[]}));local.push(catalog);
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url');
const fingerprint=rawDigest(Buffer.from(publicKey,'base64url'));
const policy=add('acceptance-policy.json','profile',canonical({schema:'maestro.release.acceptance-policy/1',signer:fingerprint,statement_schema:'maestro.release.acceptance/1',signature_profile:'maestro.ed25519-strict/1',required:[]}));local.push(policy);
for(const [source,path] of [['Cargo.lock','Cargo.lock'],['package-lock.json','package-lock.json'],['tools/contracts/probe/Cargo.lock','generator-Cargo.lock'],['contracts/generation.json','generation.json']])local.push(copy(source,path,source.endsWith('json')&&source.includes('generation')?'provenance':'lock'));
let localNotice;for(const name of ['LICENSE','LICENSE.md','LICENSE.txt']){try{localNotice=copy(name,'MAESTRO-NOTICE.txt','notice');break;}catch{}}
if(!localNotice)blockers.push({kind:'missing_notice',component:'Maestro',path:'LICENSE'});
component('maestro','0.1.0-development','Story 1.1 admission consumers and focused external plugin; no usable distribution','local-working-tree',local,localNotice?[localNotice]:[]);
if(!['win32','linux'].includes(process.platform)||process.arch!=='x64')throw Error('No dependency inventory for this target');
const runtimeInventoryPath=process.platform==='linux'?'tools/release/notices/runtime-inventory-linux.json':'tools/release/notices/runtime-inventory.json';
const runtimeInventory=JSON.parse(readFileSync(runtimeInventoryPath));
if(runtimeInventory.cargo_lock_sha256!==rawDigest(readFileSync('Cargo.lock'))||runtimeInventory.npm_lock_sha256!==rawDigest(readFileSync('package-lock.json')))throw Error('Notice inventory lock mismatch');
const runtimeNoticeRef=copy(runtimeInventoryPath,'runtime-dependency-notices.json','provenance');
for(const family of ['rust','gateway']) {
 const text=[];
 for(const dependency of runtimeInventory[family]){
  if(dependency.status!=='included'||!dependency.notices.length)throw Error(`Unresolved notice: ${dependency.name}`);
  for(const reference of dependency.notices){if(!/^texts\/[a-f0-9]{64}\.txt$/.test(reference.path))throw Error('Unsafe notice path');const bytes=readFileSync(join('tools/release/notices',reference.path));if(rawDigest(bytes)!==reference.sha256)throw Error('Notice bytes changed');text.push(`\n===== ${dependency.name}@${dependency.version} | ${reference.origin} | ${reference.member??''} | SHA256 ${reference.sha256} =====\n${bytes.toString('utf8')}\n`);}
 }
 const ref=add(`${family}-THIRD-PARTY-NOTICES.txt`,'notice',Buffer.from(text.join('')));
 /* dependency attribution is retained in the signed runtime inventory, not overlapping physical ownership. */
 // for(const dependency of runtimeInventory[family])component(`${family}:${dependency.name.replaceAll('@','')}`,dependency.version, family==='rust'?`Native verification dependency: ${dependency.requirement_path.join(' -> ')}`:dependency.requirement,dependency.origin,[runtimeNoticeRef,...local.filter(v=>family==='rust'?v.path.startsWith('maestro-launcher')||v.path.startsWith('maestro-controller'):v.path.startsWith('gateway'))],[ref]);
}
const commit=run('git',['rev-parse','HEAD']);const tree=run('git',['rev-parse','HEAD^{tree}']);
const dirty=run('git',['status','--porcelain','--untracked-files=normal']);
if(dirty)blockers.push({kind:'source_not_committed',detail:'Built source differs from declared commit/tree; commit reviewed work before a releasable seal.'});
blockers.push({kind:'candidate_execution_pending',detail:'Run isolated-runtime.mjs on this exact newly signed candidate; prior candidate evidence is not transferable.'});
blockers.push({kind:'human_custody',detail:'Development-only ephemeral key; independently authenticated production trust enrollment and signing custody remain human prerequisites.'});
const {directory:buildDirectory,commands:buildCommands,...publicBuild}=build.record;
const buildRecord=add('controlled-build.json','provenance',canonical({...publicBuild,commands:buildCommands.map(([exe,args,cwd='.'])=>[basename(exe),args.map(v=>v.includes('npm-cli.js')?'npm-cli.js':v),cwd])}));local.push(buildRecord);
const provenance=add('build-provenance.json','provenance',canonical({schema:'maestro.build.evidence/1',commit,tree,dirty:!!dirty,node:process.version,platform:process.platform,arch:process.arch,scope:'development candidate only',controlled_build:buildRecord,blockers}));
components.find(v=>v.name==='maestro').files.push(provenance.path);
foundationAssets(stage,files,components,build.captured.get('dist/packages/gateway/src/managed-runtime.js'));
const closureBytes=canonical({schema:'maestro.dsh.closure/1',profile:'maestro.release.inventory.dsh/1',lock_sha256:lock.sha256,owner:'deepseek-harness',files:files.filter(v=>v.role==='dsh')});
writeFileSync(join(directory,'REVIEWED-DSH-CLOSURE.json'),closureBytes);
const closureDigest=rawDigest(closureBytes);
const trustedClosure=TrustedDshClosure.verify(closureBytes,closureDigest,lock.sha256);
const assigned=new Set(components.flatMap(v=>v.files));
components.find(v=>v.name==='maestro').files.push(...files.filter(v=>!assigned.has(v.path)).map(v=>v.path));
const manifest={schema:'maestro.release.manifest.dsh/1',resource_profile:'maestro.release.inventory.dsh/1',dsh_closure:closureDigest,dsh_lock:lock,version:'0.1.0-development-unapproved',source_commit:commit,source_tree:tree,route:`development-${process.platform}-${process.arch}`,signer:fingerprint,trust_revision:'1',digest_profile:'maestro.raw-sha256/1',signature_profile:'maestro.ed25519-strict/1',files,components,registry,bootstrap,catalog,acceptance_policy:policy,migrations:[]};
const bytes=canonical(manifest);validateWithProfile(manifest.schema,bytes,true,'dsh-release');writeFileSync(join(stage,'release.manifest.json'),bytes);
const signature=canonical({schema:'maestro.release.signature/1',public_key:publicKey,signature:sign(null,Buffer.concat([Buffer.from('maestro.release.manifest/1\0'),bytes]),keys.privateKey).toString('base64url')});writeFileSync(join(stage,'release.signature.json'),signature);
const root=canonical({schema:'maestro.trust.root/1',purpose:'maestro.distribution',public_key:publicKey,fingerprint,revision:'1',status:'active'});writeFileSync(join(directory,'DEVELOPMENT-ONLY-root.json'),root);
const started=performance.now();let admission;try{admission={ok:true,identity:VerifiedRelease.verify(bytes,signature,root,stage,trustedClosure).identity};}catch(e){admission={ok:false,error:e.code??'FILE'};}
const result={directory,stage,closure_sha256:closureDigest,lock_sha256:lock.sha256,manifest_bytes:bytes.length,collection_entries:countEntries(manifest),admission_elapsed_ms:performance.now()-started,node_peak_rss_kib:process.resourceUsage().maxRSS,manifest:rawDigest(bytes),files:files.length,bytes:files.reduce((n,v)=>n+Number(v.size),0),components:components.length,admission,blockers,usable_distribution:false};
persistAssemblyResult(join(directory,'assembly-result.json'),result);console.log(JSON.stringify(result,null,2));

function countEntries(v){if(Array.isArray(v))return v.length+v.reduce((n,x)=>n+countEntries(x),0);if(v&&typeof v==='object')return Object.keys(v).length+Object.values(v).reduce((n,x)=>n+countEntries(x),0);return 0;}
