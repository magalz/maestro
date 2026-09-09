// Development-only authority; never enrolls a production signer or starts a provider.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import {VerifiedRelease} from '../../dist/packages/contracts/src/release.js';
import {TrustedDshClosure} from '../../dist/packages/contracts/src/dsh.js';
const workspace=fileURLToPath(new URL('../../',import.meta.url));
if(process.argv.length!==3)throw Error('ACTIVATION_ARGUMENTS');
const directory=resolve(process.argv[2]),stage=join(directory,'staged');
const result=JSON.parse(readFileSync(join(directory,'assembly-result.json')));
const closure=TrustedDshClosure.verify(readFileSync(join(directory,'REVIEWED-DSH-CLOSURE.json')),result.closure_sha256,result.lock_sha256);
const release=VerifiedRelease.verify(readFileSync(join(stage,'release.manifest.json')),readFileSync(join(stage,'release.signature.json')),readFileSync(join(directory,'DEVELOPMENT-ONLY-root.json')),stage,closure);
const bootstrapPath='gateway/dist/packages/gateway/src/managed-runtime.js',bootstrapUrl=pathToFileURL(join(stage,bootstrapPath)).href;
release.assertSelectionUnchanged([bootstrapPath]);
const bootstrap=release.select(bootstrapPath),trustedContracts=pathToFileURL(join(workspace,'dist/packages/contracts/src/index.js')).href;
const builtins=new Set(['node:assert/strict','node:module','node:fs','node:path','node:url','node:vm','node:crypto']);
const bootstrapHooks=registerHooks({
 resolve(specifier,context,nextResolve){
  if(specifier===bootstrapUrl)return {url:bootstrapUrl,shortCircuit:true};
  if(context.parentURL===bootstrapUrl){
   if(specifier==='../../contracts/src/index.js')return {url:trustedContracts,shortCircuit:true};
   if(!builtins.has(specifier))throw Error('BOOTSTRAP_IMPORT');
  }
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){if(url===bootstrapUrl)return {format:'module',source:bootstrap,shortCircuit:true};return nextLoad(url,context);}
});
let prepareManagedDsh;try{({prepareManagedDsh}=await import(bootstrapUrl));}finally{bootstrapHooks.deregister();}
mkdirSync(join(workspace,'tools/release/target/managed-homes'),{recursive:true});
const home=()=>mkdtempSync(join(workspace,'tools/release/target/managed-homes/home-'));
const cases=[];
for(const path of ['cordis.yml','cordis.patch.yml','profiles/stock/package.json']){
 const root=home();mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),'forbidden-overlay');
 assert.throws(()=>prepareManagedDsh(release,root),/MANAGED_HOME/);cases.push('reject home input '+path);
}
{
 const root=home(),prepared=prepareManagedDsh(release,root);
 writeFileSync(join(root,'effective-graph.json'),'[{"id":"forbidden","name":"@deepseek-ai/dsh-tool-fs"}]');
 await assert.rejects(()=>prepared.activate(),/effective graph changed/);cases.push('reject concurrent graph rewrite before activation');
}
{
 const prepared=prepareManagedDsh(release,home());await assert.rejects(()=>prepared.activate('--profile','stock'),/ACTIVATION_ARGUMENTS/);cases.push('reject CLI overlay arguments');
}
const activated=await prepareManagedDsh(release,home()).activate();
cases.push('activate exact staged host/client bytes','deny bare/relative/include plugin fallback','deny unreviewed module resolution','verify effective active graph');
const output={...activated,bootstrap_path:bootstrapPath,node:process.version,node_executable:process.execPath,cases,private_home_scope:'Fresh caller-owned development homes only; no real user DSH home read or written'};
writeFileSync(join(directory,'managed-activation.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
