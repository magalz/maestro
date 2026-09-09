import { ed25519 } from '@noble/curves/ed25519.js';
import { createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { lstatSync, readdirSync, openSync, fstatSync, closeSync, constants } from 'node:fs';
import {readBoundedDescriptor} from './io.js';
import { resolve, join } from 'node:path';
import { canonical, deny, rawDigest, structuredDigest, validate, verifySchemaAsset } from './index.js';
import { TrustedDshClosure } from './dsh.js';
import { validateWithProfile } from './index.js';
import { bindingDigests } from './schema.js';
type Obj = Record<string, any>;
export function decodeBase64(value: string, length: number): Buffer {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== length || decoded.toString('base64url') !== value) deny('BASE64');
  return decoded;
}
export function strictVerify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): void {
  try {
    if (publicKey.length !== 32 || signature.length !== 64) deny('SIGNATURE');
    for (const bytes of [publicKey, signature.slice(0,32)]) {
      const point = ed25519.Point.fromBytes(bytes, false);
      if (!Buffer.from(point.toBytes()).equals(Buffer.from(bytes)) || point.isSmallOrder() || !point.isTorsionFree()) deny('SIGNATURE');
    }
    if (!ed25519.verify(signature, message, publicKey, { zip215: false })) deny('SIGNATURE');
    const key = createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(publicKey)]),format:'der',type:'spki'});
    if (!cryptoVerify(null, message, key, signature)) deny('SIGNATURE');
  } catch { deny('SIGNATURE'); }
}
export function verifyEnvelope(purpose:string, message:Uint8Array, envelopeBytes:Uint8Array, expectedKey:string):void {
  const envelope = validate(purpose === 'maestro.release.manifest/1' ? 'maestro.release.signature/1' : purpose.replace(/\/1$/, '-signature/1'), envelopeBytes, true) as Obj;
  if (envelope.public_key !== expectedKey) deny('SIGNER');
  strictVerify(decodeBase64(expectedKey,32),decodeBase64(envelope.signature,64),Buffer.concat([Buffer.from(purpose),Buffer.from([0]),Buffer.from(message)]));
}
export function enroll(rootBytes:Uint8Array, authenticatedFingerprint:string, explicitlyAccepted:boolean):Obj {
  const root=validate('maestro.trust.root/1',rootBytes,true) as Obj;
  if (!explicitlyAccepted || root.status!=='active' || root.fingerprint!==authenticatedFingerprint ||
      rawDigest(decodeBase64(root.public_key,32))!==authenticatedFingerprint) deny('ENROLLMENT');
  return root;
}
export function transition(rootBytes:Uint8Array, statementBytes:Uint8Array, oldSignature:Uint8Array,
  newSignature:Uint8Array, accepted:boolean):Buffer {
  const root=validate('maestro.trust.root/1',rootBytes,true) as Obj;
  const statement=validate('maestro.trust.transition/1',statementBytes,true) as Obj;
  if (!accepted || root.status!=='active' || rawDigest(decodeBase64(root.public_key,32))!==root.fingerprint || statement.old_key!==root.public_key ||
      statement.new_key===root.public_key || BigInt(statement.revision)!==BigInt(root.revision)+1n) deny('TRANSITION');
  verifyEnvelope('maestro.trust.transition/1',statementBytes,oldSignature,statement.old_key);
  verifyEnvelope('maestro.trust.transition/1',statementBytes,newSignature,statement.new_key);
  return canonical({...root,public_key:statement.new_key,fingerprint:rawDigest(decodeBase64(statement.new_key,32)),revision:statement.revision});
}
export function transitionSet(rootBytes:Uint8Array,records:{statement:Uint8Array;oldSignature:Uint8Array;newSignature:Uint8Array}[],accepted:boolean):Buffer {
  if(records.length!==1) deny('TRANSITION_CONFLICT');
  const record=records[0];return transition(rootBytes,record.statement,record.oldSignature,record.newSignature,accepted);
}
export function safePath(path:string,dsh=false):void {
  if (!(dsh?/^[A-Za-z0-9][A-Za-z0-9@+._/-]{0,239}$/:/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/).test(path) || path.split('/').some(p=>!p || p==='.' || p==='..' || p.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(p))) deny('PATH');
}
function snapshot(root:string, path:string, size:string, digest:string,dsh=false,identities?:Map<string,string>):Buffer {
  safePath(path,dsh);
  const full=join(root,path); const before=lstatSync(full,{bigint:true});
  if (!before.isFile() || before.isSymbolicLink() || before.nlink!==1n || before.size!==BigInt(size) || before.size>268435456n) deny('FILE');
  const fd=openSync(full,constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened=fstatSync(fd,{bigint:true});
    if (opened.ino!==before.ino || opened.dev!==before.dev || opened.nlink!==1n) deny('SUBSTITUTION');
    const bytes=readBoundedDescriptor(fd,Number(before.size)); const after=fstatSync(fd,{bigint:true}); const selected=lstatSync(full,{bigint:true});
    if (after.ino!==selected.ino || after.dev!==selected.dev || after.mtimeNs!==opened.mtimeNs || after.ctimeNs!==opened.ctimeNs || BigInt(bytes.length)!==before.size || rawDigest(bytes)!==digest) deny('INTEGRITY');
    identities?.set(path,`${opened.dev}:${opened.ino}:${opened.birthtimeNs}`);
    return bytes;
  } finally {closeSync(fd);}
}
export class VerifiedRelease {
  private constructor(readonly identity:string, private manifest:Obj, private files:Map<string,Buffer>, private root:Obj, private staged:string, private identities:Map<string,string>,private dsh:boolean) {}
  static verify(manifestBytes:Uint8Array, signatureBytes:Uint8Array, enrolledRootBytes:Uint8Array, staged:string, closure?:TrustedDshClosure):VerifiedRelease {
    const root=validate('maestro.trust.root/1',enrolledRootBytes,true) as Obj;
    if(root.status!=='active' || rawDigest(decodeBase64(root.public_key,32))!==root.fingerprint) deny('TRUST');
    const manifest=(closure?validateWithProfile('maestro.release.manifest.dsh/1',manifestBytes,true,'dsh-release'):validate('maestro.release.manifest/1',manifestBytes,true)) as Obj;
    closure?.check(manifest);
    const envelope=validate('maestro.release.signature/1',signatureBytes,true) as Obj;
    if (manifest.signer!==root.fingerprint || manifest.trust_revision!==root.revision || envelope.public_key!==root.public_key) deny('TRUST');
    strictVerify(decodeBase64(root.public_key,32),decodeBase64(envelope.signature,64),Buffer.concat([Buffer.from('maestro.release.manifest/1\0'),Buffer.from(manifestBytes)]));
    const files=new Map<string,Buffer>(); const identities=new Map<string,string>(); const folded=new Set<string>(); let total=0;
    const base=resolve(staged); if(lstatSync(base).isSymbolicLink() || !lstatSync(base).isDirectory()) deny('PATH');
    for(const entry of manifest.files) {
      safePath(entry.path,!!closure);
      if(folded.has(entry.path.toLowerCase()) || ['release.manifest.json','release.signature.json'].includes(entry.path)) deny('INVENTORY');
      folded.add(entry.path.toLowerCase());
      for(const part of entry.path.split('/').slice(0,-1).reduce((parts:string[],p:string)=>[...parts,parts.length?parts.at(-1)+'/'+p:p],[])) {
        const info=lstatSync(join(base,part)); if(info.isSymbolicLink() || !info.isDirectory()) deny('PATH');
      }
      total+=Number(entry.size); if(total>1073741824) deny('SIZE');
      files.set(entry.path,snapshot(base,entry.path,entry.size,entry.sha256,!!closure,identities));
    }
    let enumerated=0;
    const walk=(directory:string,prefix='')=>{ for(const name of readdirSync(directory)) {
      if(++enumerated>(closure?262144:8192)) deny('INVENTORY');
      const path=prefix+name, info=lstatSync(join(directory,name));
      safePath(path,!!closure);
      if(info.isSymbolicLink()) deny('PATH');
      if(info.isDirectory()) walk(join(directory,name),path+'/');
      else if(!files.has(path) && !['release.manifest.json','release.signature.json'].includes(path)) deny('EXTRA_FILE');
    }}; walk(base);
    snapshot(base,'release.manifest.json',String(manifestBytes.length),rawDigest(manifestBytes));
    snapshot(base,'release.signature.json',String(signatureBytes.length),rawDigest(signatureBytes));
    for(const key of ['registry','bootstrap','catalog','acceptance_policy',...(closure?['dsh_lock']:[])]) {
      const reference=manifest[key]; if(!files.has(reference.path) || rawDigest(files.get(reference.path)!)!==reference.sha256) deny('REFERENCE');
    }
    for(const role of ['launcher','controller','gateway','plugin','dsh','node','schema','binding','validator','profile','bootstrap','catalog','lock','provenance','notice']) if(!manifest.files.some((v:Obj)=>v.role===role)) deny('COMPONENT');
    const ownership=new Set<string>(),roles=new Map<string,string>(manifest.files.map((v:Obj)=>[v.path,v.role]));
    for(const component of manifest.components){
      if(!component.files.length || !component.notices.length || [...component.files,...component.notices].some(path=>!files.has(path)) || component.notices.some((path:string)=>roles.get(path)!=='notice'))deny('NOTICES');
      for(const path of component.files){if(ownership.has(path))deny('OWNERSHIP');ownership.add(path);}
    }
    if(ownership.size!==files.size)deny('OWNERSHIP');
    if(!manifest.components.length) deny('COMPONENT');
    const registry=validate('maestro.validator.registry/1',files.get(manifest.registry.path)!,true) as Obj;
    if(!registry.schemas.length || !registry.bindings.length || !registry.profiles.length) deny('REGISTRY');
    for(const reference of [...registry.schemas,...registry.bindings,...registry.profiles]) if(!files.has(reference.path) || rawDigest(files.get(reference.path)!)!==reference.sha256) deny('REGISTRY');
    for(const reference of registry.schemas) { if(reference.id!=='maestro.contract-set/2') deny('SCHEMA'); verifySchemaAsset(files.get(reference.path)!); }
    if(registry.schemas.length!==1 || registry.bindings.length!==2 || new Set(registry.bindings.map((v:Obj)=>v.sha256)).size!==2 || registry.bindings.some((v:Obj)=>!bindingDigests.includes(v.sha256))) deny('BINDING_INTEGRITY');
    for(const reference of registry.profiles) validate('maestro.artifact.profile/1',files.get(reference.path)!,true);
    validate('maestro.runtime.bootstrap/1',files.get(manifest.bootstrap.path)!,true);
    validate('maestro.compatibility.catalog/1',files.get(manifest.catalog.path)!,true);
    const policy=validate('maestro.release.acceptance-policy/1',files.get(manifest.acceptance_policy.path)!,true) as Obj;
    if(policy.signer!==root.fingerprint) deny('POLICY_SIGNER');
    return new VerifiedRelease(rawDigest(manifestBytes),manifest,files,root,base,identities,!!closure);
  }
  assertSelectionUnchanged(paths:readonly string[]):void {
    const base=lstatSync(this.staged);if(base.isSymbolicLink()||!base.isDirectory())deny('SUBSTITUTION');
    for(const path of paths){
      const bytes=this.select(path);let parent=this.staged;
      for(const part of path.split('/').slice(0,-1)){parent=join(parent,part);const info=lstatSync(parent);if(info.isSymbolicLink()||!info.isDirectory())deny('SUBSTITUTION');}
      const current=new Map<string,string>();snapshot(this.staged,path,String(bytes.length),rawDigest(bytes),this.dsh,current);
      if(current.get(path)!==this.identities.get(path))deny('SUBSTITUTION');
    }
  }
  select(path:string):Buffer {const bytes=this.files.get(path); if(!bytes) return deny('FILE'); return Buffer.from(bytes);}
  admitCapability(entryDigest:string, records:{statement:Uint8Array;signature:Uint8Array}[], evidence:Map<string,Uint8Array>):void {
    const catalog=validate('maestro.compatibility.catalog/1',this.select(this.manifest.catalog.path),true) as Obj;
    const entries=catalog.entries.filter((v:Obj)=>structuredDigest('maestro.compatibility.entry/1',v)===entryDigest);
    if(entries.length!==1 || records.length!==1) deny('CONFLICT');
    const entry=entries[0];
    for(const reference of entry.implementation)if(!this.files.has(reference.path)||rawDigest(this.files.get(reference.path)!)!==reference.sha256)deny('IMPLEMENTATION');
    if(entry.reader.kind!=='self' && entry.reader.manifest!==this.identity) deny('READER');
    const policyBytes=this.select(this.manifest.acceptance_policy.path);
    const policy=validate('maestro.release.acceptance-policy/1',policyBytes,true) as Obj;
    const required=policy.required.filter((v:Obj)=>v.capability===entry.capability);
    if(required.length!==1 || !required[0].cases.length || new Set(required[0].cases).size!==required[0].cases.length) deny('COVERAGE');
    const record=records[0]; const statement=validate('maestro.release.acceptance/1',record.statement,true) as Obj;
    verifyEnvelope('maestro.release.acceptance/1',record.statement,record.signature,this.root.public_key);
    if(statement.release!==this.identity || statement.entry!==entryDigest || statement.policy!==rawDigest(policyBytes) || statement.route!==this.manifest.route || entry.route!==this.manifest.route || statement.case_set!==rawDigest(canonical(required[0].cases)) || statement.outcome!=='pass') deny('ACCEPTANCE');
    if(!canonical(statement.cases.map((v:Obj)=>v.id)).equals(canonical(required[0].cases))) deny('COVERAGE');
    for(const value of statement.cases) if(value.outcome!=='pass' || !evidence.has(value.evidence.path) || rawDigest(evidence.get(value.evidence.path)!)!==value.evidence.sha256) deny('EVIDENCE');
    if(entry.capability==='full_migration' || entry.capability==='prospective_adoption') deny('UNSUPPORTED_CAPABILITY');
  }
}
