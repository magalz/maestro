import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {canonical,rawDigest} from '../../dist/packages/contracts/src/index.js';
import {imports} from './pe-imports.mjs';

/** Append only reproducibly collected runtime bytes; never search PATH for DLLs. */
export function foundationAssets(stage,files,components,managedSource){
 const add=(path,role,bytes)=>{
  if(files.some(v=>v.path===path))throw Error('Duplicate foundation asset');
  mkdirSync(dirname(join(stage,path)),{recursive:true});writeFileSync(join(stage,path),bytes);
  const entry={path,role,sha256:rawDigest(bytes),size:String(bytes.length),classification:['controller','gateway'].includes(role)?'executable':'data'};
  files.push(entry);return path;
 };
 const managedPath='gateway/dist/packages/gateway/src/managed-runtime.js',managedBytes=managedSource??readFileSync('dist/packages/gateway/src/managed-runtime.js');
 const existing=files.find(v=>v.path===managedPath);
 if(existing){if(existing.sha256!==rawDigest(managedBytes))throw Error('Managed bootstrap mismatch');}
 else {const managed=add(managedPath,'gateway',managedBytes);components.find(v=>v.name==='maestro').files.push(managed);}
 if(process.platform!=='win32')return;
 // The caller has admitted and copied the old candidate. Reconcile this owned
 // component in the new stage only; never mutate the historical source stage.
 const previous=components.find(v=>v.name==='gnu-llvm-runtime');
 if(previous){for(const path of previous.files){unlinkSync(join(stage,path));const index=files.findIndex(v=>v.path===path);if(index<0)throw Error('Missing prior runtime ownership');files.splice(index,1);}components.splice(components.indexOf(previous),1);}
 const inventory=JSON.parse(readFileSync('tools/release/notices/native-runtime/inventory.json'));
 if(inventory.toolchain!=='1.98.1-x86_64-pc-windows-gnullvm'||inventory.dlls.length!==1)throw Error('Unknown runtime origin');
 const dll=readFileSync('.cache/native-runtime/libunwind.dll');
 if(rawDigest(dll)!==inventory.dlls[0].sha256||dll.length!==inventory.dlls[0].size)throw Error('Runtime DLL integrity');
 const system=name=>['kernel32.dll','ntdll.dll','bcryptprimitives.dll'].includes(name)||/^api-ms-win-(crt|core)-[a-z0-9-]+\.dll$/.test(name);
 const graph=[];
 for(const path of ['maestro-launcher.exe','maestro-controller.exe','libunwind.dll']){
  const dependencies=imports(path==='libunwind.dll'?dll:readFileSync(join(stage,path)));
  if(dependencies.some(v=>!system(v.name)&&v.name!=='libunwind.dll'))throw Error('Unresolved native runtime dependency');
  graph.push({path,imports:dependencies});
 }
 const owned=[add('libunwind.dll','controller',dll)],notices=[];
 for(const reference of inventory.notices){
  if(!/^[a-f0-9]{64}\.(html|txt)$/.test(reference.path))throw Error('Unsafe notice path');
  const bytes=readFileSync(join('tools/release/notices/native-runtime',reference.path));
  if(rawDigest(bytes)!==reference.sha256)throw Error('Runtime notice integrity');
  const path=add('native-notices/'+reference.path,'notice',bytes);owned.push(path);notices.push(path);
 }
 owned.push(add('native-runtime-inventory.json','provenance',canonical({...inventory,import_graph:graph,system_dependency_policy:'Windows/UCRT system APIs are OS prerequisites; only libunwind.dll is redistributed for the observed Rust binaries.'})));
 components.push({name:'gnu-llvm-runtime',version:'rustc-1.98.1',rationale:'Observed dynamic unwind dependency of native development launcher/controller; exact compiler archive member and complete shipped notices',source:inventory.archive.origin,files:owned,notices});
}
