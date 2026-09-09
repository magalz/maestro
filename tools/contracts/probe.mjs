// Build-time feasibility only. A failure never freezes a candidate selection.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const base = fileURLToPath(new URL('./probe/', import.meta.url));
const require = createRequire(join(base, 'package.json'));
const { compile } = require('json-schema-to-typescript');
const Ajv = require('ajv/dist/2020').default;
const ts = require('typescript');
const output = join(base, 'target', 'feasibility');
mkdirSync(output, { recursive: true });
const evidence = { stage: 'generator-feasibility', platform: process.platform, arch: process.arch,
  node: process.version, schemaSha256: '', status: 'error', checks: [] };
try {
  assert.equal(process.version, 'v24.20.0');
  for (const [name, version] of Object.entries(require('./package.json').dependencies)) {
    assert.equal(require(`${name}/package.json`).version, version);
  }
  evidence.rust = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
  evidence.cargo = execFileSync('cargo', ['--version'], { encoding: 'utf8' }).trim();
  assert.match(evidence.rust, /^rustc 1\.98\.1 /);
  assert.match(evidence.cargo, /^cargo 1\.98\.1 /);
  const source = readFileSync(join(base, 'subset.schema.json'));
  evidence.schemaSha256 = createHash('sha256').update(source).digest('hex');
  const schema = JSON.parse(source);
  const validate = new Ajv({ strict: true, coerceTypes: false, useDefaults: false,
    removeAdditional: false }).compile(schema);
  const valid = [
    { kind: 'probe', label: '', count: -9007199254740991, enabled: false, empty: null, items: [], choice: { tag: 'text', value: 'a' } },
    { kind: 'probe', label: '😀', count: 9007199254740991, enabled: true, empty: null, items: ['a', 'B_1', 'c-2'], choice: { tag: 'number', value: 10 } },
    { kind: 'probe', label: 'x'.repeat(32), count: 0, enabled: false, empty: null, items: ['a'], choice: { tag: 'text', value: 'b' } }
  ];
  for (const value of valid) assert.equal(validate(value), true, JSON.stringify(validate.errors));
  const invalid = [ { ...valid[0], extra: true }, { ...valid[0], kind: 'wrong' },
    { ...valid[0], items: ['1bad'] }, { ...valid[0], items: ['a', 'b', 'c', 'd'] },
    { ...valid[0], label: 'x'.repeat(33) }, { ...valid[0], count: 9007199254740992 },
    { ...valid[0], empty: false }, { ...valid[0], enabled: 'false' },
    { ...valid[0], choice: { tag: 'text', value: 'c' } }, { ...valid[0], choice: { tag: 'number', value: 11 } } ];
  for (const value of invalid) assert.equal(validate(value), false);
  evidence.checks.push('Ajv complete subset positive and negative fixtures');
  const generatorOptions = { bannerComment: '', additionalProperties: false,
    $refOptions: { resolve: { file: false, http: false } } };
  const generated = await compile(schema, 'SubsetProbe', generatorOptions);
  assert.equal(await compile(schema, 'SubsetProbe', generatorOptions), generated);
  const tsFile = join(output, 'roundtrip.ts');
  writeFileSync(tsFile, generated + '\nconst vectors: SubsetProbe[] = ' + JSON.stringify(valid) + ';\n' +
    'for (const v of vectors) { if (JSON.stringify(JSON.parse(JSON.stringify(v))) !== JSON.stringify(v)) throw Error("roundtrip"); }\n');
  const program = ts.createProgram([tsFile], { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022 });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  const jsFile = join(output, 'roundtrip.mjs');
  writeFileSync(jsFile, ts.transpileModule(readFileSync(tsFile, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
  }).outputText);
  execFileSync(process.execPath, [jsFile], { stdio: 'pipe' });
  evidence.checks.push('TypeScript generated binding admits and round trips all valid vectors');
  const rust = execFileSync('cargo', ['run', '--locked', '--quiet', '--manifest-path', join(base, 'Cargo.toml'), '--', join(base, 'subset.schema.json')], { encoding: 'utf8' });
  assert.equal(execFileSync('cargo', ['run', '--locked', '--quiet', '--manifest-path', join(base, 'Cargo.toml'), '--', join(base, 'subset.schema.json')], { encoding: 'utf8' }), rust);
  writeFileSync(join(output, 'generated.rs'), rust);
  writeFileSync(join(output, 'vectors.json'), JSON.stringify(valid));
  evidence.checks.push('Typify generated complete subset');
  // This generated crate must compile and deserialize/re-serialize each admitted value.
  const roundtrip = join(base, 'roundtrip');
  execFileSync('cargo', ['run', '--locked', '--quiet', '--manifest-path', join(roundtrip, 'Cargo.toml')], { stdio: 'pipe' });
  evidence.checks.push('Rust generated binding compiles and round trips all valid vectors');
  evidence.status = 'pass';
} catch (error) {
  evidence.error = String(error.message).slice(0, 4096);
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'result.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
}
