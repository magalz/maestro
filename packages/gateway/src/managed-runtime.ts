// Focused Story 1.1 foundation. No provider, command dispatch, GUI or lifecycle service.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {canonical,rawDigest} from '../../contracts/src/index.js';
import {VerifiedRelease} from '../../contracts/src/release.js';

const modules=Object.freeze({
 '@deepseek-ai/cordis':'dsh/node_modules/@deepseek-ai/cordis/lib/index.js',
 '@deepseek-ai/cordis-plugin-loader':'dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js',
 '@deepseek-ai/cosmokit':'dsh/node_modules/@deepseek-ai/cosmokit/lib/index.js',
 'maestro:host':'maestro-host.mjs'
});
const graph=Object.freeze([Object.freeze({id:'maestro-host',name:'maestro:host'}),Object.freeze({id:'maestro-client',name:'maestro:client'})]);
const graphBytes=canonical(graph);
const selected=Object.freeze([...Object.values(modules),'maestro-client.js']);
// Dedicated managed process: reject overlap before either activation changes hooks.
const activationKey=Symbol.for('maestro.managed-activation/1');
const processActivation=globalThis as unknown as Record<symbol,boolean>;

/** Prepare only from an admitted release and an empty caller-owned managed home. */
export function prepareManagedDsh(release:VerifiedRelease,home:string){
 const info=lstatSync(home);
 if(!info.isDirectory()||info.isSymbolicLink()||readdirSync(home).length)throw Error('MANAGED_HOME');
 release.assertSelectionUnchanged(selected);
 const captured=new Map(selected.map(path=>[path,release.select(path)]));
 const config=join(home,'effective-graph.json');
 writeFileSync(config,graphBytes,{flag:'wx',mode:0o600});
 let used=false;
 return Object.freeze({
  graphDigest:rawDigest(graphBytes),
  async activate(...extra:unknown[]){
   if(used||extra.length)throw Error('ACTIVATION_ARGUMENTS');used=true;
   assert.deepEqual(readdirSync(home),['effective-graph.json'],'managed home changed');
   assert.deepEqual(readFileSync(config),graphBytes,'effective graph changed before activation');
   release.assertSelectionUnchanged(selected);
   if(processActivation[activationKey])throw Error('ACTIVATION_BUSY');
   processActivation[activationKey]=true;
   try {
   // Node's ESM cache outlives hook registration and home cleanup. Each activation
   // therefore has a release-bound, unique namespace, even when a home is reused.
   const namespace=join(home,'captured',release.identity,randomUUID());
   const urls=new Map(Object.entries(modules).map(([name,path])=>[name,pathToFileURL(join(namespace,path)).href]));
   const byUrl=new Map(Object.entries(modules).map(([name,path])=>[urls.get(name)!,captured.get(path)!]));
   const loaded=new Set<string>();
   // No default file/package resolution or source reopening. Only the reviewed Loader
   // receives node:module; attempts to resolve its optional internal addon fail closed.
   const hooks=registerHooks({
    resolve(specifier,context){
     if(specifier==='node:module'&&context.parentURL===urls.get('@deepseek-ai/cordis-plugin-loader'))return {url:specifier,shortCircuit:true};
     const url=urls.get(specifier)??(byUrl.has(specifier)?specifier:undefined);
     if(!url)throw Error('MODULE_ALLOWLIST');
     return {url,shortCircuit:true};
    },
    load(url,context,nextLoad){
     if(url==='node:module')return nextLoad(url,context);
     const source=byUrl.get(url);if(!source)throw Error('MODULE_ALLOWLIST');loaded.add(url);
     return {format:'module',source,shortCircuit:true};
    }
   });
   let ctx:any;
   try{
    const {Context}=await import(urls.get('@deepseek-ai/cordis')!);
    const {Loader}=await import(urls.get('@deepseek-ai/cordis-plugin-loader')!);
    const host=await import(urls.get('maestro:host')!);
    const registrations:any[]=[];
    const sandbox=createContext({window:{__ModuleLoader__:{load(value:any){registrations.push(value);}}}});
    runInContext(captured.get('maestro-client.js')!.toString('utf8'),sandbox,{timeout:1000});
    assert.equal(registrations.length,1);assert.equal(registrations[0].id,'maestro-client-feasibility');
    Object.assign(sandbox,{registration:registrations[0]});
    const client=runInContext('registration.factory(()=>{throw Error("CLIENT_MODULE_ALLOWLIST")})',sandbox,{timeout:1000});
    const allowed=new Map([['maestro:host',host],['maestro:client',{default:client.apply}]]);
    class ManagedLoader extends Loader{
     import(name:string){if(!allowed.has(name))throw Error('PLUGIN_ALLOWLIST');return allowed.get(name);}
     create(row:any,...args:any[]){
      if(args.length||!graph.some(value=>canonical(value).equals(canonical(row))))throw Error('GRAPH_ALLOWLIST');
      return super.create(structuredClone(row));
     }
    }
    ctx=new Context();await ctx.plugin(ManagedLoader);
    for(const name of ['@deepseek-ai/dsh-tool-fs','./forbidden.mjs','cordis:include'])assert.throws(()=>ctx.loader.import(name),/PLUGIN_ALLOWLIST/);
    for(const forbidden of ['@deepseek-ai/dsh-tool-fs','file:///outside-unverified.mjs'])await assert.rejects(()=>import(forbidden),/MODULE_ALLOWLIST/);
    assert.throws(()=>ctx.loader.create({id:'forbidden',name:'maestro:host'}),/GRAPH_ALLOWLIST/);
    for(const row of graph)await ctx.loader.create(row);
    await ctx.loader.await();
    assert.equal(ctx.get('externalHostActivated'),true);
    assert.equal(ctx.get('externalClientActivated'),'sealed-task-fixture');
    assert.deepEqual([...ctx.loader.entries()].map((entry:any)=>({id:entry.id,name:entry.options.name})).sort((a:any,b:any)=>a.name.localeCompare(b.name)),[...graph].sort((a,b)=>a.name.localeCompare(b.name)));
    return {status:'pass',release:release.identity,graphDigest:rawDigest(graphBytes),activated:graph.map(v=>v.id),modules:[...loaded],scope:'Actual staged Cordis host and captured client bundle in Node VM; no rendered GUI or workflow authority'};
   }finally{try{if(ctx)await ctx.fiber.dispose();}finally{hooks.deregister();}}
   }finally{processActivation[activationKey]=false;}
  }
 });
}
