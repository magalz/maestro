// Fresh isolated native/TypeScript build. No existing target/dist artifacts are consumed.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,openSync,closeSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {inventory,inputRoots,matchInventory,digest} from './build-inputs.mjs';
const workspace=process.cwd(),review=process.argv.includes('--review-snapshot');
if(process.argv.slice(2).some(v=>v!=='--review-snapshot'))throw Error('Unknown build option');
const run=(exe,args,options={})=>{const p=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,...options});if(p.status!==0)throw Error('Build command failed: '+exe+' '+args.join(' ')+' '+(p.stderr??''));return p.stdout?.trim();};
if(process.version!=='v24.20.0')throw Error('Expected Node 24.20.0');
const npmCli=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const versions={node:process.version,npm:run(process.execPath,[npmCli,'--version']),rustc:run('rustc',['--version','--verbose']),cargo:run('cargo',['--version'])};
if(versions.npm!=='11.19.0'||!versions.rustc.startsWith('rustc 1.98.1 ')||!versions.cargo.startsWith('cargo 1.98.1 '))throw Error('Pinned toolchain mismatch');
const commit=run('git',['rev-parse','HEAD']),tree=run('git',['rev-parse','HEAD^{tree}']),dirty=!!run('git',['status','--porcelain','--untracked-files=normal']);
if(dirty&&!review)throw Error('Clean reviewed source required; --review-snapshot produces development evidence only');
const inputs=inventory(workspace,inputRoots);
mkdirSync('tools/release/target',{recursive:true});const directory=mkdtempSync(resolve('tools/release/target/build-'));
for(const row of inputs){const bytes=readFileSync(row.path);if(digest(bytes)!==row.sha256)throw Error('Source changed during capture');mkdirSync(dirname(join(directory,row.path)),{recursive:true});writeFileSync(join(directory,row.path),bytes,{flag:'wx'});}
// This is a fresh local build, not a sandbox against the local administrator.
// Reject ancestor/home Cargo configuration and supply empty npm configuration.
const cargoConfigDirectories=new Set([resolve(process.env.CARGO_HOME??join(process.env.USERPROFILE??process.env.HOME,'.cargo'))]);
for(let path=directory;;path=dirname(path)){cargoConfigDirectories.add(join(path,'.cargo'));if(dirname(path)===path)break;}
for(const path of cargoConfigDirectories)for(const name of ['config','config.toml'])if(existsSync(join(path,name)))throw Error('Unrecorded Cargo configuration: '+join(path,name));
const emptyUserConfig=join(directory,'empty-npm-user-config'),emptyGlobalConfig=join(directory,'empty-npm-global-config');
writeFileSync(emptyUserConfig,'',{flag:'wx'});writeFileSync(emptyGlobalConfig,'',{flag:'wx'});
// Clear inherited compiler/Node injection. Keep the explicit host/toolchain lookup.
const env={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME','LOCALAPPDATA','APPDATA','RUSTUP_HOME','CARGO_HOME','RUSTUP_TOOLCHAIN','CARGO_TARGET_X86_64_PC_WINDOWS_GNULLVM_LINKER'])if(process.env[key])env[key]=process.env[key];
env.CARGO_TARGET_DIR=join(directory,'target');
env.npm_config_userconfig=emptyUserConfig;env.npm_config_globalconfig=emptyGlobalConfig;
const commands=[[process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund']],['cargo',['build','--workspace','--locked']],[process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.json']],[process.execPath,['tools/release/build-plugins.mjs']]];
const log=openSync(join(directory,'build.log'),'wx');
try{for(const [exe,args] of commands){console.log('Building: '+exe+' '+args.join(' '));run(exe,args,{cwd:directory,env,stdio:['ignore',log,log]});}}finally{closeSync(log);}
matchInventory(inputs,inventory(directory,inputRoots),'isolated source inputs');
matchInventory(inputs,inventory(workspace,inputRoots),'working source inputs');
const ext=process.platform==='win32'?'.exe':'';
// Cargo may hard-link its top-level binary to deps/. Retain independent regular
// copies as the assembly inputs, leaving Cargo's original output untouched.
const outputDirectory=join(directory,'outputs');
for(const path of ['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,...inventory(directory,['dist','plugins'],false).map(v=>v.path)]){mkdirSync(dirname(join(outputDirectory,path)),{recursive:true});writeFileSync(join(outputDirectory,path),readFileSync(join(directory,path)),{flag:'wx'});}
// Fresh npm-ci roots use captured repository locks; no cached installed tree can
// manufacture provenance. npm verifies locked archive integrity before install.
for(const [name,source] of [['gateway',''],['dsh','tools/release/probe/']]){
 const cwd=join(outputDirectory,'runtimes',name);mkdirSync(cwd,{recursive:true});
 for(const file of ['package.json','package-lock.json'])writeFileSync(join(cwd,file),readFileSync(join(directory,source+file)),{flag:'wx'});
 const args=[npmCli,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'];
 console.log('Installing fresh locked runtime: '+name);const runtimeLog=openSync(join(directory,name+'-install.log'),'wx');
 try{run(process.execPath,args,{cwd,env,stdio:['ignore',runtimeLog,runtimeLog]});}finally{closeSync(runtimeLog);}
 for(const file of ['package.json','package-lock.json'])if(digest(readFileSync(join(cwd,file)))!==digest(readFileSync(join(directory,source+file))))throw Error('Runtime install changed reviewed input');
 commands.push([process.execPath,args,'outputs/runtimes/'+name]);
}
matchInventory(inputs,inventory(workspace,inputRoots),'working source inputs after runtime installation');
const outputs=inventory(outputDirectory,['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,'dist','plugins','runtimes'],false);
const record={schema:'maestro.local.build/1',directory:outputDirectory,commit,tree,dirty,scope:dirty?'review snapshot; not a committed release':'clean local build; review and custody still required',configuration:{cargo:'ancestor/home config rejected',npm:'empty user/global config; no project .npmrc',isolation:'fresh outputs, explicit source snapshot; trusted local host, not a hermetic sandbox'},versions,commands,inputs,outputs};
const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n'),path=join(directory,'build-record.json');writeFileSync(path,bytes,{flag:'wx'});
console.log(JSON.stringify({path,sha256:digest(bytes),inputs:inputs.length,outputs:outputs.length,dirty}));
