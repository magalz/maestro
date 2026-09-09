import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {inputRoots,inventory,digest,captureBuild} from './build-inputs.mjs';
test('controlled build rejects missing/stale identity, source changes and output substitution',()=>{
 mkdirSync('tools/release/target',{recursive:true});const root=mkdtempSync(resolve('tools/release/target/build-test-'));
 for(const path of inputRoots){const full=join(root,path);mkdirSync(dirname(full),{recursive:true});if(['crates','packages','contracts','tools/dev-smoke','tools/contracts','tools/release/plugins'].includes(path))mkdirSync(full);else writeFileSync(full,'input');}
 const ext=process.platform==='win32'?'.exe':'',output=join(root,'output');
 mkdirSync(join(output,'plugins'),{recursive:true});mkdirSync(join(output,'runtimes'),{recursive:true});
 const paths=['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,'dist/main.js'];
 for(const path of paths){mkdirSync(dirname(join(output,path)),{recursive:true});writeFileSync(join(output,path),'built');}
 const record={schema:'maestro.local.build/1',directory:output,inputs:inventory(root,inputRoots),outputs:inventory(output,['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,'dist'])};
 const path=join(root,'record.json'),bytes=Buffer.from(JSON.stringify(record)),identity=digest(bytes);writeFileSync(path,bytes);
 assert.throws(()=>captureBuild(root,path),/retained/);
 assert.throws(()=>captureBuild(root,path,'0'.repeat(64)),/identity/);
 const accepted=captureBuild(root,path,identity);assert.equal(accepted.captured.size,3);
 writeFileSync(join(output,'dist/main.js'),'substituted');assert.throws(()=>captureBuild(root,path,identity),/outputs/);
 assert.equal(accepted.captured.get('dist/main.js').toString(),'built');
 writeFileSync(join(output,'dist/main.js'),'built');writeFileSync(join(output,'dist/extra.js'),'extra');assert.throws(()=>captureBuild(root,path,identity),/outputs/);
 // A separately recorded output set still cannot authorize changed source inputs.
 record.outputs=inventory(output,['target/debug/maestro-launcher'+ext,'target/debug/maestro-controller'+ext,'dist']);writeFileSync(path,JSON.stringify(record));writeFileSync(join(root,'Cargo.toml'),'changed');
 assert.throws(()=>captureBuild(root,path,digest(readFileSync(path))),/source inputs/);
});
