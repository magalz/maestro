import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compile } from 'json-schema-to-typescript';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync('contracts/schemas/contract-set-v2.schema.json');
const schema = JSON.parse(source);
const allowed = new Set(['$schema','$id','$defs','$ref','title','type','properties','required',
  'additionalProperties','items','minItems','maxItems','minLength','maxLength','pattern',
  'minimum','maximum','enum','const','oneOf']);
export function assertSubset(node) {
  for (const key of Object.keys(node)) assert(allowed.has(key), `unsupported vocabulary: ${key}`);
  if (node.$ref) assert(/^#\/\$defs\/[A-Za-z]+$/.test(node.$ref) && schema.$defs[node.$ref.split('/').at(-1)], 'unsupported reference');
  if (node.type === 'object') {
    assert.equal(node.additionalProperties, false);
    assert(Array.isArray(node.required));
    for (const name of node.required) assert(Object.hasOwn(node.properties, name));
  }
  if (node.type === 'string') {
    assert(Number.isSafeInteger(node.maxLength) && node.maxLength <= 1048576);
    if (node.pattern) assert(node.pattern.startsWith('^') && node.pattern.endsWith('$') && /^[\x20-\x7e]+$/.test(node.pattern));
  }
  if (node.type === 'array') assert(Number.isSafeInteger(node.maxItems) && node.maxItems <= 65536);
  if (node.type === 'integer') assert(Number.isSafeInteger(node.minimum) && Number.isSafeInteger(node.maximum));
  if (node.oneOf) {
    const branches = node.oneOf.map(b => b.$ref ? schema.$defs[b.$ref.split('/').at(-1)] : b);
    assert(branches.every(b => b.type === 'object'), 'oneOf requires discriminated objects');
    const discriminator = ['schema','kind'].find(key => branches.every(b => b.required.includes(key) && b.properties[key]?.const));
    assert(discriminator && new Set(branches.map(b => b.properties[discriminator].const)).size === branches.length, 'ambiguous oneOf');
    node.oneOf.forEach(assertSubset);
  }
  Object.values(node.properties ?? {}).forEach(assertSubset);
  Object.values(node.$defs ?? {}).forEach(assertSubset);
  if (node.items) assertSubset(node.items);
}
export async function generate() {
assertSubset(schema);
const digest = createHash('sha256').update(source).digest('hex');
const ts = await compile(schema, 'MaestroRecord', { bannerComment: `// Generated from SHA-256 ${digest}. Do not edit.`,
  additionalProperties: false, $refOptions: { resolve: { file: false, http: false } } });
const rust = execFileSync('cargo', ['run','--locked','--quiet','--manifest-path','tools/contracts/probe/Cargo.toml','--','contracts/schemas/contract-set-v2.schema.json'], {encoding:'utf8'});
const formatted = execFileSync('rustfmt', ['--edition','2024'], {input:rust,encoding:'utf8'});
const rustBinding = `// Generated from SHA-256 ${digest}. Do not edit.\n${formatted}`;
const bindingDigests = [ts,rustBinding].map(bytes => createHash('sha256').update(bytes).digest('hex'));
const outputs = {
  'packages/contracts/src/schema.ts': `// Generated from the exact schema bytes.\nexport const schemaText = ${JSON.stringify(source.toString('utf8'))};\nexport const schemaSha256 = '${digest}';\nexport const bindingDigests = ${JSON.stringify(bindingDigests)};\n`,
  'packages/contracts/src/generated.ts': ts,
  'crates/maestro-contracts/src/generated.rs': rustBinding,
  'contracts/generation.json': JSON.stringify({schema_sha256:digest,rust:'typify@0.7.0',typescript:'json-schema-to-typescript@16.0.0',validator:'maestro.validators/1'},null,2)+'\n'
};
for (const [path, bytes] of Object.entries(outputs)) {
  if (process.argv.includes('--check')) assert.equal(readFileSync(path,'utf8'),bytes,`generated binding mismatch: ${path}`);
  else { mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true}); writeFileSync(path,bytes); }
}
console.log(process.argv.includes('--check') ? 'Generated bindings match trusted schema inputs.' : 'Generated Rust and TypeScript bindings.');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generate();
