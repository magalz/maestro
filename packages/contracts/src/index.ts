import { createHash } from 'node:crypto';
import { Ajv2020 } from 'ajv/dist/2020.js';
import canonicalize from 'canonicalize';
import { visit } from 'jsonc-parser';
import { schemaText, schemaSha256 } from './schema.js';
import type { MaestroRecord } from './generated.js';
export type { MaestroRecord } from './generated.js';
export const MAX_BYTES = 16 * 1024 * 1024;
export const MAX_STRING = 1024 * 1024;
export const VALIDATOR_ID = 'maestro.validators/1';
export class ContractError extends Error { constructor(public code: string) { super(code); } }
export function deny(code: string): never { throw new ContractError(code); }
export const rawDigest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export const canonical = (value: unknown): Buffer => Buffer.from(canonicalize(value) ?? deny('CANONICAL'));
export function structuredDigest(schema: string, value: unknown): string {
  if (!schema || !/^[\x01-\x7f]+$/.test(schema)) deny('SCHEMA');
  return rawDigest(Buffer.concat([Buffer.from(schema), Buffer.from([0]), canonical(value)]));
}
function tokenBounds(bytes: Uint8Array): string {
  if (bytes.length > MAX_BYTES) deny('BYTES');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) deny('BOM');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return deny('UTF8'); }
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      let length = 0;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        let cp = text.codePointAt(i)!;
        if (text[i] === '\\') {
          i++;
          if (text[i] === 'u') {
            const hex = text.slice(i + 1, i + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) deny('PARSE');
            cp = parseInt(hex, 16); i += 4;
            if (cp >= 0xd800 && cp <= 0xdbff) {
              if (text.slice(i + 1, i + 3) !== '\\u') deny('SURROGATE');
              const lowHex = text.slice(i + 3, i + 7);
              if (!/^[0-9a-fA-F]{4}$/.test(lowHex)) deny('SURROGATE');
              const low = parseInt(lowHex, 16);
              if (low < 0xdc00 || low > 0xdfff) deny('SURROGATE');
              cp = 0x10000 + (cp - 0xd800) * 1024 + low - 0xdc00; i += 6;
            } else if (cp >= 0xdc00 && cp <= 0xdfff) deny('SURROGATE');
          } else { if (!'"\\/bfnrt'.includes(text[i] ?? '\0')) deny('PARSE'); cp = 0x20; }
        } else if (cp > 0xffff) i++;
        length += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
        if (length > MAX_STRING) deny('STRING');
      }
      if (i === text.length) deny('PARSE');
    } else if (text[i] === '{' || text[i] === '[') { if (++depth > 64) deny('DEPTH'); }
    else if (text[i] === '}' || text[i] === ']') { if (--depth < 0) deny('PARSE'); }
  }
  return text;
}
export function parse(bytes: Uint8Array): unknown {
  return parseWithProfile(bytes,'small');
}
export function parseWithProfile(bytes:Uint8Array,profile:'small'|'dsh-release'):unknown {
  if(profile!=='small'&&profile!=='dsh-release')deny('PROFILE');
  const text = tokenBounds(bytes);
  const stack: (Set<string> | null)[] = [];
  let entries = 0;
  const count = () => { if (++entries > (profile==='dsh-release'?262144:65536)) deny('ENTRIES'); };
  const value = () => { if (stack.length && stack.at(-1) === null) count(); };
  visit(text, {
    onObjectBegin() { value(); stack.push(new Set()); },
    onObjectProperty(name) { count(); const keys = stack.at(-1)!; if (keys!.has(name)) deny('DUPLICATE'); keys!.add(name); },
    onObjectEnd() { stack.pop(); },
    onArrayBegin() { value(); stack.push(null); },
    onArrayEnd() { stack.pop(); },
    onLiteralValue(literal, offset, length) {
      value();
      if (typeof literal === 'number') {
        const token = text.slice(offset, offset + length);
        if (!/^-?(0|[1-9][0-9]*)$/.test(token) || token === '-0' || !Number.isSafeInteger(literal)) deny('NUMBER');
      }
    },
    onError() { deny('PARSE'); }
  }, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  try { return JSON.parse(text); } catch { return deny('PARSE'); }
}
const validator = new Ajv2020({ strict: true, coerceTypes: false, useDefaults: false,
  removeAdditional: false, allErrors: false }).compile(JSON.parse(schemaText));
export function validate(schema: string, bytes: Uint8Array, immutable = false): MaestroRecord {
  return validateWithProfile(schema,bytes,immutable,'small');
}
export function validateWithProfile(schema:string,bytes:Uint8Array,immutable:boolean,profile:'small'|'dsh-release'):MaestroRecord {
  if(profile==='small'&&['maestro.release.manifest.dsh/1','maestro.dsh.closure/1'].includes(schema))deny('PROFILE');
  if(profile==='dsh-release'&&!['maestro.release.manifest.dsh/1','maestro.dsh.closure/1'].includes(schema))deny('PROFILE');
  const value = parseWithProfile(bytes,profile) as Record<string, unknown>;
  if (!value || value.schema !== schema) deny('SCHEMA');
  if (!validator(value)) deny('STRUCTURE');
  if (Array.isArray(value.dependencies)) {
    const ids = value.dependencies.map((v: { id: string }) => v.id);
    if (new Set(ids).size !== ids.length) deny('REFERENCE');
  }
  if (immutable && !canonical(value).equals(Buffer.from(bytes))) deny('CANONICAL');
  return value as unknown as MaestroRecord;
}
export function verifySchemaAsset(bytes: Uint8Array): void {
  if (rawDigest(bytes) !== schemaSha256) deny('SCHEMA_INTEGRITY');
}
