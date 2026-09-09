// Feasibility evidence only: never run a provider, shell, or raw capability.
import assert from 'node:assert/strict';
import { execFileSync, fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('./probe/', import.meta.url));
const require = createRequire(join(base, 'package.json'));
const output = fileURLToPath(new URL('./target/', import.meta.url));
mkdirSync(output, { recursive: true });
const home = mkdtempSync(join(output, 'dsh-home-'));
const profile = join(home, 'profiles', 'maestro-probe');
const bundle = join(profile, 'node_modules', 'maestro-probe-bundle');
mkdirSync(bundle, { recursive: true });
const evidence = { stage: 'dsh-composition-feasibility', platform: process.platform,
  arch: process.arch, node: process.version, status: 'error', checks: [],
  remaining: ['Full GUI and route certification belong to later stories; production inventory/notices are checked during assembly.'] };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  assert.equal(process.version, 'v24.20.0');
  const packagePath = join(base, 'node_modules', '@deepseek-ai', 'dsh', 'package.json');
  const packageBytes = readFileSync(packagePath);
  const manifest = JSON.parse(packageBytes);
  assert.equal(manifest.version, '0.1.2-rc.1');
  evidence.dshVersion = manifest.version;
  evidence.packageSha256 = hash(packageBytes);
  evidence.lockSha256 = hash(readFileSync(join(base, 'package-lock.json')));
  const cli = join(base, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  evidence.cliSha256 = hash(readFileSync(cli));
  const yaml = require('js-yaml');
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'maestro-probe-profile',
    private: true, dsh: { profile: { bundles: ['maestro-probe-bundle'], patchReload: 'startup' } } }));
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'maestro-probe-bundle',
    version: '0.0.0', type: 'module', main: './host.mjs', exports: { '.': './host.mjs', './client': './client.mjs' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: './client.mjs' } }));
  // Harmless sentinels characterize configuration admission; they grant no capabilities.
  writeFileSync(join(bundle, 'host.mjs'), 'export default function () {}\n');
  writeFileSync(join(bundle, 'client.mjs'), 'export const name = "maestro-probe-client";\n');
  const insertion = [{ insert: [{ id: 'maestro-host', name: 'maestro-probe-bundle' },
    { id: 'forbidden-sentinel', name: 'maestro-probe-bundle', disabled: true }] }];
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify(insertion));
  writeFileSync(join(profile, 'cordis.patch.yml'), '[]\n');
  const root = join(profile, 'cordis.yml');
  writeFileSync(root, '# prior probe root\n[]\n');
  const priorRoot = hash(readFileSync(root));
  const dump = patches => {
    const args = [cli, '--profile', 'maestro-probe', '--dump-config', ...patches];
    const stdout = execFileSync(process.execPath, args, { cwd: home, encoding: 'utf8',
      timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: '1' } });
    return yaml.load(stdout);
  };
  const baseline = dump([]);
  assert.equal(baseline.find(row => row.id === 'forbidden-sentinel')?.disabled, true);
  evidence.checks.push({ id: 'baseline-disabled-sentinel', status: 'pass' });
  evidence.rootRewritten = priorRoot !== hash(readFileSync(root));
  const patch = JSON.stringify([{ id: 'forbidden-sentinel', disabled: false }]);
  writeFileSync(join(home, 'cordis.patch.yml'), patch);
  const homeRows = dump([]);
  evidence.stockHomeOverrideRestoresRow = homeRows.find(row => row.id === 'forbidden-sentinel')?.disabled !== true;
  writeFileSync(join(home, 'cordis.patch.yml'), '[]\n');
  const overlay = join(home, 'cli-overlay.json');
  writeFileSync(overlay, patch);
  const cliRows = dump(['--patch', overlay]);
  evidence.stockCliOverrideRestoresRow = cliRows.find(row => row.id === 'forbidden-sentinel')?.disabled !== true;
  const guard = join(base, 'guarded-host.mjs');
  const frozenProfile = join(home, 'verified-profile.json');
  writeFileSync(frozenProfile, JSON.stringify([{ id: 'maestro-host', name: 'maestro:host' },
    { id: 'maestro-client', name: 'maestro:client' }]));
  const trustedDigest = hash(readFileSync(frozenProfile));
  const activate = (path, mode, extras = []) => execFileSync(process.execPath,
    [guard, path, trustedDigest, mode, ...extras], { cwd: home, encoding: 'utf8', timeout: 30000,
      maxBuffer: 1024 * 1024, stdio: 'pipe', env: { ...process.env, DSH_HOME: home } });
  writeFileSync(join(home, 'cordis.patch.yml'), patch);
  const activated = JSON.parse(activate(frozenProfile, 'fallback'));
  assert.equal(activated.status, 'pass');
  evidence.checks.push({ id: 'guarded-host-and-client-sentinel-activation', status: 'pass' });
  evidence.checks.push({ id: 'guarded-home-overlay-and-module-fallback-denied', status: 'pass' });
  assert.throws(() => activate(frozenProfile, 'baseline', ['--patch', overlay]),
    error => String(error.stderr).includes('CLI overlays and alternate profiles are forbidden'));
  evidence.checks.push({ id: 'guarded-cli-overlay-denied', status: 'pass' });
  const changedProfile = join(home, 'changed-profile.json');
  writeFileSync(changedProfile, JSON.stringify([{ id: 'forbidden', name: '@deepseek-ai/dsh-tool-fs' }]));
  assert.throws(() => activate(changedProfile, 'baseline'),
    error => String(error.stderr).includes('trusted profile mismatch'));
  evidence.checks.push({ id: 'guarded-profile-rewrite-denied-against-prior-digest', status: 'pass' });
  assert.equal(hash(readFileSync(frozenProfile)), trustedDigest);
  evidence.checks.push({ id: 'original-profile-preserved', status: 'pass' });
  const raceProfile = join(home, 'race-profile.json');
  writeFileSync(raceProfile, readFileSync(frozenProfile));
  await new Promise((resolve, reject) => {
    const child = fork(guard, [raceProfile, trustedDigest, 'race'], { silent: true });
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('race probe timeout')); }, 30000);
    child.stderr.on('data', data => { stderr += data; });
    child.once('message', () => {
      writeFileSync(raceProfile, readFileSync(changedProfile));
      child.send('continue');
    });
    child.once('error', reject);
    child.once('exit', code => {
      clearTimeout(timer);
      if (code !== 0 && stderr.includes('profile changed before activation')) resolve();
      else reject(Error('race was not denied before activation'));
    });
  });
  evidence.checks.push({ id: 'concurrent-profile-substitution-denied-before-activation', status: 'pass' });
  evidence.guardSha256 = hash(readFileSync(guard));
  const clientProbe = JSON.parse(execFileSync(process.execPath,
    [join(base, 'client-bundle.mjs'), join(home, 'client-build')], { encoding: 'utf8',
      timeout: 30000, maxBuffer: 1024 * 1024, stdio: 'pipe' }));
  assert.equal(clientProbe.status, 'pass');
  evidence.clientProbe = clientProbe;
  evidence.status = 'pass';
  evidence.scope = 'Actual Cordis host/client sentinels and external browser-bundle discovery/materialization pass under Node VM. Stock overlay observations confirm known upstream behavior; they do not reject S3. Complete guarded runtime and rendered GUI remain unproven.';
} catch (error) {
  evidence.error = String(error.message).slice(0, 4096);
} finally {
  writeFileSync(join(home, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  console.log(`Evidence: ${join(home, 'result.json')}`);
  // Incomplete evidence is intentionally never successful.
  process.exitCode = evidence.status === 'pass' ? 0 : 1;
}
