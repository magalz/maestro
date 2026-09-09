import { canonical, deny, rawDigest, validateWithProfile } from './index.js';
import { safePath } from './release.js';
type Obj = Record<string, any>;
/** The digest and lock identity come from reviewed local bootstrap policy, never the candidate. */
export class TrustedDshClosure {
  private constructor(readonly identity:string, readonly lock:string, private entries:Map<string,Obj>) {}
  static verify(bytes:Uint8Array, expectedDigest:string, expectedLock:string):TrustedDshClosure {
    if(!/^[a-f0-9]{64}$/.test(expectedDigest) || !/^[a-f0-9]{64}$/.test(expectedLock) || rawDigest(bytes)!==expectedDigest) deny('DSH_TRUST');
    const closure=validateWithProfile('maestro.dsh.closure/1',bytes,true,'dsh-release') as Obj;
    if(closure.lock_sha256!==expectedLock) deny('DSH_LOCK');
    const entries=new Map<string,Obj>(), folded=new Set<string>();
    for(const entry of closure.files) {
      safePath(entry.path,true);
      if(folded.has(entry.path.toLowerCase()) || entry.role!=='dsh') deny('DSH_CLOSURE');
      folded.add(entry.path.toLowerCase());entries.set(entry.path,entry);
    }
    return new TrustedDshClosure(expectedDigest,expectedLock,entries);
  }
  check(manifest:Obj):void {
    if(manifest.dsh_closure!==this.identity || manifest.dsh_lock.sha256!==this.lock) deny('DSH_BINDING');
    const owned=new Map<string,string>(), inventory=new Map<string,Obj>();
    for(const entry of manifest.files) {
      if(inventory.has(entry.path)) deny('INVENTORY');
      inventory.set(entry.path,entry);
    }
    for(const component of manifest.components) for(const path of component.files) {
      if(owned.has(path) || !inventory.has(path)) deny('OWNERSHIP');
      owned.set(path,component.name);
    }
    if(owned.size!==inventory.size || inventory.size>32768 || inventory.size-this.entries.size>4096) deny('INVENTORY');
    for(const [path,entry] of this.entries) {
      if(!inventory.has(path) || !canonical(inventory.get(path)).equals(canonical(entry)) || owned.get(path)!=='deepseek-harness') deny('DSH_CLOSURE');
    }
    for(const [path,owner] of owned) if(owner==='deepseek-harness' && !this.entries.has(path)) deny('DSH_CLOSURE');
  }
}
