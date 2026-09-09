import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyMembership} from './notice-membership.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root='tools/release/notices/';
const cargoChecksums=new Map(readFileSync('Cargo.lock','utf8').split('[[package]]').slice(1).map(block=>[block.match(/^name = "([^"]+)"/m)?.[1]+'@'+block.match(/^version = "([^"]+)"/m)?.[1],block.match(/^checksum = "([^"]+)"/m)?.[1]]));
const npmLock=JSON.parse(readFileSync('package-lock.json'));
const expectedGateway=Object.entries(npmLock.packages).filter(([path,p])=>path&&!p.dev).map(([path,p])=>({path,version:p.version,integrity:p.integrity,origin:p.resolved}));
for(const filename of ['runtime-inventory.json','runtime-inventory-linux.json']) {
 const inventory=JSON.parse(readFileSync(root+filename));
 assert.equal(inventory.cargo_lock_sha256,hash(readFileSync('Cargo.lock')));
 assert.equal(inventory.npm_lock_sha256,hash(readFileSync('package-lock.json')));
 const metadata=JSON.parse(execFileSync('cargo',['metadata','--format-version','1','--locked','--filter-platform',inventory.target],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const packages=new Map(metadata.packages.map(v=>[v.id,v])),nodes=new Map(metadata.resolve.nodes.map(v=>[v.id,v])),seen=new Set();
 const visit=id=>{if(seen.has(id))return;seen.add(id);for(const dep of nodes.get(id).deps)if(dep.dep_kinds.some(v=>v.kind!=='dev'))visit(dep.pkg);};
 for(const pkg of metadata.packages)if(['maestro-launcher','maestro-controller'].includes(pkg.name))visit(pkg.id);
 const expectedRust=[...seen].map(id=>packages.get(id)).filter(p=>p.source).map(p=>({name:p.name,version:p.version,checksum:cargoChecksums.get(p.name+'@'+p.version)}));
 verifyMembership(inventory,expectedRust,expectedGateway);
 for(const dependency of [...inventory.rust,...inventory.gateway]) {
  assert.equal(dependency.status,'included',dependency.name);assert.ok(dependency.notices.length);
  for(const notice of dependency.notices){assert.match(notice.path,/^texts\/[a-f0-9]{64}\.txt$/);const bytes=readFileSync(root+notice.path);assert.equal(hash(bytes),notice.sha256);assert.equal(bytes.length,notice.bytes);}
 }
 console.log(`${inventory.target}: ${inventory.rust.length} Rust and ${inventory.gateway.length} gateway dependencies, all notice bytes verified.`);
}
const lock=JSON.parse(readFileSync('tools/release/probe/package-lock.json'));
for(const source of JSON.parse(readFileSync(root+'sources.json'))) {
 assert.equal(source.integrity,lock.packages['node_modules/'+source.name].integrity);
 assert.ok(source.notices.length);
 for(const notice of source.notices){assert.match(notice.path,/^[A-Za-z0-9_.-]+$/);assert.equal(hash(readFileSync(root+notice.path)),notice.sha256);}
}
console.log('Supplemental DSH notices match locked package identities and exact retained bytes.');
const native=JSON.parse(readFileSync(root+'native-runtime/inventory.json'));
assert.equal(native.toolchain,'1.98.1-x86_64-pc-windows-gnullvm');
assert.equal(native.archive.sha256,'f87230d2643171715c2fc4af81bb28849bfc2f62fc7413f899988748c82cbbd3');
assert.equal(native.dlls.length,1);assert.equal(native.dlls[0].sha256,'13bf4e99b0193634ebdeb0bbdeff9753b39f1d04799183f664111014aabf4c2c');
assert.equal(native.notices.length,14);
for(const notice of native.notices){assert.match(notice.path,/^[a-f0-9]{64}\.(html|txt)$/);assert.equal(hash(readFileSync(root+'native-runtime/'+notice.path)),notice.sha256);}
console.log('Native libunwind archive identity and 14 exact shipped notice files verified.');
