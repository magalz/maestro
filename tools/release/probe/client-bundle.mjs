// Real DSH client registry and browser module runtime; HTTP/DOM rendering are not exercised.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const tsRequire = createRequire(new URL('../../contracts/probe/package.json', import.meta.url));
const ts = tsRequire('typescript');
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const { Loader } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')));
const { ClientModuleRegistry } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-client-modules')));
const { SlotCore } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-client-ui-slots')));
const root = process.argv[2];
const pkg = join(root, 'external-client');
mkdirSync(pkg, { recursive: true });
const id = 'maestro-client-feasibility';
const host = join(pkg, 'host.mjs');
const client = join(pkg, 'client.js');
writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: id, version: '0.0.0',
  type: 'module', main: './host.mjs', exports: { '.': './host.mjs', './client': './client.js' },
  dsh: { client: { platform: 'web', inject: [], external: [] } } }));
writeFileSync(host, 'export default function(ctx) { ctx.provide("externalHostActivated", true); }\n');
const source = 'export const mode: "sealed-task-fixture" = "sealed-task-fixture";\n' +
  'export function apply(ctx: { provide(key: string, value: unknown): void }) { ctx.provide("externalClientActivated", mode); }\n';
const transpiled = ts.transpileModule(source, { reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.deepEqual(transpiled.diagnostics, []);
const bundle = `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:(require)=>{var module={exports:{}};var exports=module.exports;${transpiled.outputText}\nreturn module.exports;}});\n`;
writeFileSync(join(pkg, 'client.ts'), source);
writeFileSync(client, bundle);
const ctx = new Context();
let route;
try {
  ctx.baseUrl = pathToFileURL(root).href + '/';
  ctx.provide('webServer', { register(value) { route = value; return () => {}; } });
  await ctx.plugin(Loader);
  await ctx.loader.create({ id: 'external-host', name: pathToFileURL(host).href });
  await ctx.loader.await();
  assert.equal(ctx.get('externalHostActivated'), true);
  await ctx.plugin(ClientModuleRegistry);
  const graph = ctx.clientModules.graph();
  assert.deepEqual(graph.entries.map(row => row.id), [id]);
  assert.equal(ctx.clientModules.clientPath(id), client);
  assert.equal(route.path, '/plugins');
  const served = url => {
    let status;
    let body;
    route.handler({ method: 'GET', url }, { writeHead(code) { status = code; }, end(value) { body = value; } });
    assert.equal(status, 200);
    return body.toString();
  };
  const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration); } };
  const sandbox = createContext({ window: { __ModuleLoader__: target }, console,
    document: { querySelectorAll() { return []; } } });
  runInContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-modules/client'), 'utf8'), sandbox);
  const registration = target.pendingQueue.shift();
  const moduleRuntime = registration.factory(() => { throw Error('unexpected bootstrap external'); });
  const system = moduleRuntime.createClientModuleSystem(target,
    { id: registration.id, exports: moduleRuntime }, { boot: JSON.parse(JSON.stringify(graph)), staticModules: {},
      loadBundle: async url => runInContext(served(url), sandbox) });
  const external = await system.import(id);
  let active;
  external.apply({ provide(key, value) { assert.equal(key, 'externalClientActivated'); active = value; } });
  assert.equal(active, 'sealed-task-fixture');
  await assert.rejects(() => system.import('@deepseek-ai/dsh-tool-fs'));
  assert.strictEqual(await system.import(id + '/client'), external);
  // Exercise the actual slot core at the documented replaceable center-column seam.
  // The guarded composition excludes the stock conversation/composer plugin entirely.
  const slots = new SlotCore();
  slots.register({ name: 'root', children: { conversation: { kind: 'single', scope: 'session-maybe' } } }, () => null);
  slots.register({ name: 'conversation' }, () => 'sealed-task-fixture');
  const [sealed] = slots.entriesOfSlot('conversation');
  assert.equal(sealed.component(), 'sealed-task-fixture');
  slots.reportEntryError('conversation', sealed, Error('fixture renderer failure'), { abdicate: true });
  assert.equal(slots.entriesOfSlot('conversation').length, 0, 'failure must not restore a raw composer');
  console.log(JSON.stringify({ status: 'pass', id, checks: ['external TypeScript client bundle built',
    'actual host activation', 'dsh.client and ./client discovery', 'exact bundle served by registry',
    'actual browser module runtime materialization', 'unknown browser module denied',
    'conversation slot admits replacement; failed replacement exposes no raw fallback'],
    bundleSha256: createHash('sha256').update(bundle).digest('hex'),
    scope: 'Node VM executes the actual browser module runtime; HTTP transport and rendered GUI are untested.' }));
} finally {
  await ctx.fiber.dispose();
}
