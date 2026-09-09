// Review-only reseal from verified flat bytes; all copies are independently readmitted.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical,rawDigest,validateWithProfile} from '../../dist/packages/contracts/src/index.js';
import {VerifiedRelease} from '../../dist/packages/contracts/src/release.js';
import {TrustedDshClosure} from '../../dist/packages/contracts/src/dsh.js';
import {foundationAssets} from './foundation-assets.mjs';
import {captureBuild} from './build-inputs.mjs';
import {controlledAssets,verifyRetainedRuntimes} from './controlled-assets.mjs';
if(process.argv.length!==5)throw Error('Usage: node tools/release/reseal.mjs OLD_CANDIDATE BUILD_RECORD EXPECTED_BUILD_RECORD_SHA256');
const build=captureBuild(process.cwd(),process.argv[3],process.argv[4]);
const old=resolve(process.argv[2]),oldStage=join(old,'staged'),oldResult=JSON.parse(readFileSync(join(old,'assembly-result.json')));
const closureBytes=readFileSync(join(old,'REVIEWED-DSH-CLOSURE.json'));
const closure=TrustedDshClosure.verify(closureBytes,oldResult.closure_sha256,oldResult.lock_sha256);
const originalManifestBytes=readFileSync(join(oldStage,'release.manifest.json'));
verifyRetainedRuntimes(JSON.parse(originalManifestBytes),build);
VerifiedRelease.verify(originalManifestBytes,readFileSync(join(oldStage,'release.signature.json')),readFileSync(join(old,'DEVELOPMENT-ONLY-root.json')),oldStage,closure);
const directory=mkdtempSync(resolve('tools/release/target/candidate-')),stage=join(directory,'staged');mkdirSync(stage);
const manifest=JSON.parse(originalManifestBytes);
manifest.source_commit=build.record.commit;manifest.source_tree=build.record.tree;
console.error('Copying verified flat candidate to '+directory);
for(const entry of manifest.files){mkdirSync(dirname(join(stage,entry.path)),{recursive:true});copyFileSync(join(oldStage,entry.path),join(stage,entry.path));}
const update=(path,bytes)=>{writeFileSync(join(stage,path),bytes);const entry=manifest.files.find(v=>v.path===path);entry.sha256=rawDigest(bytes);entry.size=String(bytes.length);return {path,sha256:entry.sha256};};
controlledAssets(stage,manifest,build);
foundationAssets(stage,manifest.files,manifest.components,build.captured.get('dist/packages/gateway/src/managed-runtime.js'));
// Reseal preserves historical input provenance but cannot imply those old inputs
// were rebuilt. The captured controlled record identifies only refreshed outputs.
const oldProvenance=JSON.parse(readFileSync(join(stage,'build-provenance.json')));
const {directory:buildDirectory,commands:buildCommands,...publicBuild}=build.record;
const blockers=[...(build.record.dirty?[{kind:'source_not_committed',detail:'Controlled build is an uncommitted review snapshot.'}]:[]),{kind:'candidate_execution_pending',detail:'Run isolated-runtime.mjs against this exact newly signed candidate.'},{kind:'human_custody',detail:'Fixture key only; authenticated production enrollment and offline signing custody remain human prerequisites.'}];
update('build-provenance.json',canonical({schema:'maestro.build.evidence/1',historical_build:oldProvenance,refreshed_build:{...publicBuild,commands:buildCommands.map(([exe,args,cwd='.'])=>[exe.replaceAll('\\','/').split('/').at(-1),args.map(v=>v.includes('npm-cli.js')?'npm-cli.js':v),cwd])},historical_source_manifest:oldResult.manifest,blockers}));
const keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64url');
manifest.signer=rawDigest(Buffer.from(publicKey,'base64url'));
const policy=JSON.parse(readFileSync(join(stage,manifest.acceptance_policy.path)));policy.signer=manifest.signer;
manifest.acceptance_policy=update(manifest.acceptance_policy.path,canonical(policy));
const bytes=canonical(manifest);validateWithProfile(manifest.schema,bytes,true,'dsh-release');
const signature=canonical({schema:'maestro.release.signature/1',public_key:publicKey,signature:sign(null,Buffer.concat([Buffer.from('maestro.release.manifest/1\0'),bytes]),keys.privateKey).toString('base64url')});
const root=canonical({schema:'maestro.trust.root/1',purpose:'maestro.distribution',public_key:publicKey,fingerprint:manifest.signer,revision:'1',status:'active'});
writeFileSync(join(stage,'release.manifest.json'),bytes);writeFileSync(join(stage,'release.signature.json'),signature);
writeFileSync(join(directory,'DEVELOPMENT-ONLY-root.json'),root);writeFileSync(join(directory,'REVIEWED-DSH-CLOSURE.json'),closureBytes);
const start=performance.now(),verified=VerifiedRelease.verify(bytes,signature,root,stage,closure);
const count=v=>Array.isArray(v)?v.length+v.reduce((n,x)=>n+count(x),0):v&&typeof v==='object'?Object.keys(v).length+Object.values(v).reduce((n,x)=>n+count(x),0):0;
const result={...oldResult,directory,stage,manifest:verified.identity,manifest_bytes:bytes.length,files:manifest.files.length,components:manifest.components.length,collection_entries:count(manifest),bytes:manifest.files.reduce((n,v)=>n+Number(v.size),0),admission:{ok:true,identity:verified.identity},admission_elapsed_ms:performance.now()-start,node_peak_rss_kib:process.resourceUsage().maxRSS,resealed_from:oldResult.manifest,entrypoints_current:true,foundation_assets:true,historical_blockers:oldResult.blockers,blockers};
writeFileSync(join(directory,'assembly-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
