import { readFileSync } from 'node:fs';

const [rustReport, typescriptReport, ...sourceArgs] = process.argv.slice(2);
const separator = sourceArgs.indexOf('--');
if (!rustReport || !typescriptReport || separator < 1 || separator === sourceArgs.length - 1) {
  throw new Error('usage: validate-coverage.mjs RUST_LCOV TYPESCRIPT_LCOV RUST_SOURCE... -- TYPESCRIPT_SOURCE...');
}

const rustSources = sourceArgs.slice(0, separator);
const typescriptSources = sourceArgs.slice(separator + 1);
const normalize = value => value.replaceAll('\\', '/');
const sourceMatches = (actual, expected) => actual === expected || actual.endsWith(`/${expected}`);

function readRecords(path) {
  const records = [];
  let record;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('SF:')) record = { source: normalize(line.slice(3)), linesHit: null };
    else if (line.startsWith('LH:') && record) record.linesHit = Number(line.slice(3));
    else if (line === 'end_of_record' && record) {
      if (!Number.isInteger(record.linesHit) || record.linesHit < 0) throw new Error(`Invalid LH in ${path}`);
      records.push(record);
      record = undefined;
    }
  }
  if (record) throw new Error(`Unterminated LCOV record in ${path}`);
  if (records.length === 0) throw new Error(`LCOV report is empty: ${path}`);
  return records;
}

function validate(path, expectedSources, positiveSources) {
  const records = readRecords(path);
  for (const record of records) {
    if (/(^|\/)(?:generated|schema)\.(?:rs|ts)$/.test(record.source)) {
      throw new Error(`Generated or schema source appeared in ${path}: ${record.source}`);
    }
  }
  for (const expected of expectedSources) {
    if (!records.some(record => sourceMatches(record.source, expected))) {
      throw new Error(`Expected source missing from ${path}: ${expected}`);
    }
  }
  for (const expected of positiveSources) {
    if (!records.some(record => sourceMatches(record.source, expected) && record.linesHit > 0)) {
      throw new Error(`Expected covered source has no hits in ${path}: ${expected}`);
    }
  }
}

validate(rustReport, rustSources, ['crates/maestro-contracts/src/lib.rs', 'crates/maestro-release/src/lib.rs']);
validate(typescriptReport, typescriptSources, ['packages/contracts/src/index.ts', 'packages/contracts/src/release.ts']);
