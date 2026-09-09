use crate::{Error, Result, canonical, raw_digest, validate};
use serde_json::{Value, json};
use std::{collections::HashSet, time::Instant};
const RULES: [&str; 3] = ["parse", "structure", "integrity"];
pub fn validate_report(bytes: &[u8], profile_bytes: &[u8], expected: &Value) -> Result<Value> {
    let profile = validate("maestro.artifact.profile/1", profile_bytes, false)?;
    if bytes.len() as u64
        > profile["max_report_bytes"]
            .as_u64()
            .ok_or(Error("PROFILE"))?
    {
        return Err(Error("REPORT_BYTES"));
    }
    let report = validate("maestro.validation.report/1", bytes, false)?;
    if report["binding"] != *expected
        || expected["profile"] != raw_digest(profile_bytes)
        || expected["configuration"] != profile["configuration"]
        || expected["family"] != profile["family"]
        || expected["stage"] != profile["stage"]
    {
        return Err(Error("BINDING"));
    }
    if profile["required"] != json!(RULES) || report["checker"] != profile["validator"] {
        return Err(Error("CHECKER"));
    }
    if report["provenance"] != json!({"kind":"fresh"})
        || report["fresh_count"] != 1
        || report["reused_count"] != 0
    {
        return Err(Error("PROVENANCE"));
    }
    let checks = report["checks"].as_array().ok_or(Error("COVERAGE"))?;
    if checks.len() != 3 || checks.iter().zip(RULES).any(|(v, id)| v["id"] != id) {
        return Err(Error("COVERAGE"));
    }
    let outcome = if checks.iter().any(|v| v["outcome"] == "error") {
        "error"
    } else if checks.iter().any(|v| v["outcome"] == "fail") {
        "fail"
    } else {
        "pass"
    };
    if report["outcome"] != outcome {
        return Err(Error("AGGREGATE"));
    }
    if report["duration_ms"].as_u64() > profile["max_duration_ms"].as_u64() && outcome != "error" {
        return Err(Error("TIMEOUT"));
    }
    let diagnostics = report["diagnostics"]
        .as_array()
        .ok_or(Error("DIAGNOSTICS"))?;
    let count = report["diagnostic_count"]
        .as_u64()
        .ok_or(Error("DIAGNOSTICS"))?;
    if diagnostics.len() as u64
        > profile["max_diagnostics"]
            .as_u64()
            .ok_or(Error("PROFILE"))?
        || count < diagnostics.len() as u64
        || report["truncated"] != json!(count > diagnostics.len() as u64)
        || (outcome == "pass" && count != 0)
    {
        return Err(Error("DIAGNOSTICS"));
    }
    let enc = diagnostics
        .iter()
        .map(canonical)
        .collect::<Result<Vec<_>>>()?;
    if enc.windows(2).any(|pair| pair[0] > pair[1]) {
        return Err(Error("DIAGNOSTICS"));
    }
    Ok(report)
}
pub fn check_fixture(
    input: &[u8],
    profile_bytes: &[u8],
    binding: &Value,
    dependencies: &[(String, Vec<u8>)],
) -> Result<Value> {
    let profile = validate("maestro.artifact.profile/1", profile_bytes, false)?;
    let start = Instant::now();
    let mut outcomes = ["error"; 3];
    let mut diagnostics = Vec::new();
    let diagnostic = |rule: &str, message: &str| json!({"rule":rule,"location":"$","message":message,"hint":"Correct the editable draft and recheck"});
    let record = if input.len() as u64
        <= profile["max_input_bytes"]
            .as_u64()
            .ok_or(Error("PROFILE"))?
    {
        if crate::parse(input).is_ok() {
            outcomes[0] = "pass";
            validate(
                "maestro.fixture.json/1",
                input,
                profile["stage"] == "accepted",
            )
            .ok()
        } else {
            None
        }
    } else {
        None
    };
    if record.is_some() {
        outcomes[0] = "pass";
        outcomes[1] = "pass";
    } else {
        if outcomes[0] != "pass" {
            outcomes[0] = "fail";
        }
        outcomes[1] = "fail";
        diagnostics.push(diagnostic("STRUCTURE", "Input rejected"));
    }
    let pairs = Value::Array(
        dependencies
            .iter()
            .map(|(id, bytes)| json!({"id":id,"digest":raw_digest(bytes)}))
            .collect(),
    );
    let unique = dependencies
        .iter()
        .map(|(id, _)| id)
        .collect::<HashSet<_>>()
        .len()
        == dependencies.len();
    if unique
        && record.as_ref().is_some_and(|v| v["dependencies"] == pairs)
        && binding["input"] == raw_digest(input)
        && binding["dependencies"] == raw_digest(&canonical(&pairs)?)
    {
        outcomes[2] = "pass";
    } else {
        outcomes[2] = "fail";
        diagnostics.push(diagnostic("INTEGRITY", "Trusted bytes mismatch"));
    }
    let elapsed = start.elapsed().as_millis() as u64;
    if elapsed > 1000 {
        return Err(Error("REPORT_DURATION"));
    }
    let max = profile["max_duration_ms"]
        .as_u64()
        .ok_or(Error("PROFILE"))?;
    if elapsed > max {
        outcomes[0] = "error";
        diagnostics.push(diagnostic("TIMEOUT", "Required check unavailable"));
    }
    diagnostics.sort_by_cached_key(|v| canonical(v).expect("fixed diagnostics"));
    let count = diagnostics.len();
    let limit = profile["max_diagnostics"]
        .as_u64()
        .ok_or(Error("PROFILE"))? as usize;
    diagnostics.truncate(limit);
    let report = json!({"schema":"maestro.validation.report/1","binding":binding,"checker":"maestro.fixture-checker/1","provenance":{"kind":"fresh"},"checks":RULES.iter().zip(outcomes).map(|(id,outcome)|json!({"id":id,"outcome":outcome})).collect::<Vec<_>>(),"outcome":if outcomes.contains(&"error"){"error"}else if outcomes.contains(&"fail"){"fail"}else{"pass"},"diagnostics":diagnostics,"diagnostic_count":count,"truncated":count>limit,"duration_ms":elapsed,"fresh_count":1,"reused_count":0,"repair_count":0});
    validate_report(&canonical(&report)?, profile_bytes, binding)
}
