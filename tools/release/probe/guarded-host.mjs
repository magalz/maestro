// An isolated feasibility harness, not a production bootstrap or security boundary.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const { Loader } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Expected identity arrives from the parent fixture authority, never from the candidate.
const [profilePath, expectedDigest, mode, ...extra] = process.argv.slice(2);
if (extra.length) throw Error('CLI overlays and alternate profiles are forbidden');
const bytes = readFileSync(profilePath);
assert.equal(digest(bytes), expectedDigest, 'trusted profile mismatch');
const rows = JSON.parse(bytes);
const expected = [{ id: 'maestro-host', name: 'maestro:host' },
  { id: 'maestro-client', name: 'maestro:client' }];
assert.deepEqual(rows, expected, 'effective graph differs from immutable allowlist');
if (mode === 'race') {
  process.send?.('captured');
  await new Promise(resolve => process.once('message', resolve));
}
assert.equal(digest(readFileSync(profilePath)), expectedDigest, 'profile changed before activation');

// Plugin source is captured from independently specified fixture bytes. No file-based
// plugin resolution runs after validation, so profile/home fallback cannot substitute it.
const hostSource = 'export default function (ctx) { ctx.provide("maestroHostProbe", true); }';
const clientSource = 'export default function (ctx) { ctx.provide("maestroClientProbe", true); }';
const captured = new Map([
  ['maestro:host', await import('data:text/javascript;base64,' + Buffer.from(hostSource).toString('base64'))],
  ['maestro:client', await import('data:text/javascript;base64,' + Buffer.from(clientSource).toString('base64'))]
]);
class GuardedLoader extends Loader {
  import(name) {
    if (!captured.has(name)) throw Error('module outside immutable allowlist');
    return captured.get(name);
  }
}
const ctx = new Context();
try {
  await ctx.plugin(GuardedLoader);
  if (mode === 'fallback') {
    assert.throws(() => ctx.loader.import('@deepseek-ai/dsh-tool-fs'), /immutable allowlist/);
    assert.throws(() => ctx.loader.import('./forbidden.mjs'), /immutable allowlist/);
    assert.throws(() => ctx.loader.import('cordis:include'), /immutable allowlist/);
  }
  for (const row of rows) await ctx.loader.create(structuredClone(row));
  await ctx.loader.await();
  assert.equal(ctx.get('maestroHostProbe'), true);
  assert.equal(ctx.get('maestroClientProbe'), true);
  assert.deepEqual([...ctx.loader.entries()].map(entry => entry.options.name).sort(),
    ['maestro:client', 'maestro:host']);
  console.log(JSON.stringify({ status: 'pass', activated: ['maestro-host', 'maestro-client'],
    profileDigest: expectedDigest, mode }));
} finally {
  await ctx.fiber.dispose();
}
