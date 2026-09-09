import { canonical, deny, rawDigest, validate, parse } from './index.js';
import type { ValidationReport } from './generated.js';
type ObjectValue = Record<string, any>;
const RULES = ['parse', 'structure', 'integrity'];
export function validateReport(bytes: Uint8Array, profileBytes: Uint8Array,
  expectedBinding: ObjectValue): ValidationReport {
  const profile = validate('maestro.artifact.profile/1', profileBytes) as ObjectValue;
  if (bytes.length > profile.max_report_bytes) deny('REPORT_BYTES');
  const report = validate('maestro.validation.report/1', bytes) as ObjectValue;
  if (!canonical(report.binding).equals(canonical(expectedBinding)) ||
      expectedBinding.profile !== rawDigest(profileBytes) ||
      expectedBinding.configuration !== profile.configuration || expectedBinding.family !== profile.family || expectedBinding.stage !== profile.stage) deny('BINDING');
  if (!canonical(profile.required).equals(canonical(RULES)) || report.checker !== profile.validator) deny('CHECKER');
  if (report.provenance.kind !== 'fresh' || report.fresh_count !== 1 || report.reused_count !== 0) deny('PROVENANCE');
  if (report.checks.length !== 3 ||
      !canonical(report.checks.map((v: ObjectValue) => v.id)).equals(canonical(RULES))) deny('COVERAGE');
  const outcomes = report.checks.map((v: ObjectValue) => v.outcome);
  const aggregate = outcomes.includes('error') ? 'error' : outcomes.includes('fail') ? 'fail' : 'pass';
  if (report.outcome !== aggregate) deny('AGGREGATE');
  if(report.duration_ms>profile.max_duration_ms&&aggregate!=='error')deny('TIMEOUT');
  if (report.diagnostics.length > profile.max_diagnostics || report.diagnostic_count < report.diagnostics.length ||
      report.truncated !== (report.diagnostic_count > report.diagnostics.length)) deny('DIAGNOSTICS');
  const sorted = [...report.diagnostics].sort((a, b) => canonical(a).compare(canonical(b)));
  if (!canonical(sorted).equals(canonical(report.diagnostics))) deny('DIAGNOSTICS');
  if (aggregate === 'pass' && report.diagnostic_count !== 0) deny('DIAGNOSTICS');
  return report as ValidationReport;
}
export function checkFixture(input: Uint8Array, profileBytes: Uint8Array, binding: ObjectValue,
  dependencies: { id: string; bytes: Uint8Array }[] = []): ValidationReport {
  const profile = validate('maestro.artifact.profile/1', profileBytes) as ObjectValue;
  const begin = performance.now();
  const checks = RULES.map(id => ({ id, outcome: 'error' }));
  const diagnostics: ObjectValue[] = [];
  const diagnostic = (rule: string, message: string) => diagnostics.push({ rule, location: '$', message,
    hint: 'Correct the editable draft and recheck' });
  let record: ObjectValue | undefined;
  try {
    if (input.length > profile.max_input_bytes) deny('BYTES');
    parse(input);checks[0].outcome='pass';
  } catch { checks[0].outcome = 'fail'; diagnostic('STRUCTURE', 'Input rejected'); }
  if(checks[0].outcome==='pass')try{record=validate('maestro.fixture.json/1',input,profile.stage==='accepted') as ObjectValue;checks[1].outcome='pass';}catch{checks[1].outcome='fail';diagnostic('STRUCTURE','Input rejected');}
  else checks[1].outcome='fail';
  const pairs = dependencies.map(v => ({ id: v.id, digest: rawDigest(v.bytes) }));
  const unique = new Set(pairs.map(v => v.id)).size === pairs.length;
  if (record && unique && rawDigest(input) === binding.input &&
    rawDigest(canonical(pairs)) === binding.dependencies && canonical(pairs).equals(canonical(record.dependencies))) checks[2].outcome = 'pass';
  else { checks[2].outcome = 'fail'; diagnostic('INTEGRITY', 'Trusted bytes mismatch'); }
  const elapsed = Math.ceil(performance.now() - begin);
  // Preserve the historical finite report wire range; never fabricate a smaller
  // duration when the actual observation cannot be represented by that schema.
  if(elapsed>1000)deny('REPORT_DURATION');
  if (elapsed > profile.max_duration_ms) { checks[0].outcome = 'error'; diagnostic('TIMEOUT', 'Required check unavailable'); }
  diagnostics.sort((a,b) => canonical(a).compare(canonical(b)));
  const report = { schema: 'maestro.validation.report/1', binding, checker: 'maestro.fixture-checker/1',
    provenance: { kind: 'fresh' }, checks,
    outcome: checks.some(v=>v.outcome==='error') ? 'error' : checks.some(v=>v.outcome==='fail') ? 'fail' : 'pass',
    diagnostics: diagnostics.slice(0, profile.max_diagnostics), diagnostic_count: diagnostics.length,
    truncated: diagnostics.length > profile.max_diagnostics, duration_ms: elapsed,
    fresh_count: 1, reused_count: 0, repair_count: 0 };
  return validateReport(canonical(report), profileBytes, binding);
}
