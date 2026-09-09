// Developer build evidence, not a signer or an independently trusted attestation.
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const inputRoots=['Cargo.toml','Cargo.lock','package.json','package-lock.json','tsconfig.json','rust-toolchain.toml','crates','packages','contracts','tools/dev-smoke','tools/contracts','tools/release/build-inputs.mjs','tools/release/build-candidate.mjs','tools/release/build-plugins.mjs','tools/release/plugins','tools/release/probe/package.json','tools/release/probe/package-lock.json'];
const excluded=new Set(['target','dist','node_modules','.cache']);
export function inventory(root,paths,excludeBuildDirectories=true) {
 const rows=[];
 function visit(path){const full=join(root,path),stat=lstatSync(full);if(stat.isSymbolicLink())throw Error('Build input link: '+path);if(stat.isDirectory()){for(const name of readdirSync(full).sort())if(!excludeBuildDirectories||!excluded.has(name))visit(path+'/'+name);}else if(stat.isFile()&&stat.nlink===1){const bytes=readFileSync(full);rows.push({path,size:String(bytes.length),sha256:digest(bytes)});}else throw Error('Unsafe build file: '+path);}
 for(const path of paths)visit(path);
 return rows.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function matchInventory(expected,actual,label){if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Changed '+label+'; rebuild from reviewed inputs');}
export function captureBuild(workspace,recordPath,expectedDigest){
 if(!/^[a-f0-9]{64}$/.test(expectedDigest??''))throw Error('Expected independently retained build-record SHA256');
 const bytes=readFileSync(recordPath);if(digest(bytes)!==expectedDigest)throw Error('Build record identity mismatch');
 const record=JSON.parse(bytes);
 if(record.schema!=='maestro.local.build/1'||!Array.isArray(record.inputs)||!Array.isArray(record.outputs))throw Error('Unknown build record');
 matchInventory(record.inputs,inventory(workspace,inputRoots),'source inputs');
 const ext=process.platform==='win32'?'.exe':'';
 const roots=['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,'dist','plugins','runtimes'];
 matchInventory(record.outputs,inventory(record.directory,roots,false),'build outputs');
 const captured=new Map();
 for(const row of record.outputs){const value=readFileSync(join(record.directory,row.path));if(digest(value)!==row.sha256||String(value.length)!==row.size)throw Error('Build output substitution');captured.set(row.path,value);}
 return {record,bytes,captured};
}
