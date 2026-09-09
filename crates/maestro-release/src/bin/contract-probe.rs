//! Development-only protocol for shared admission vectors; never a product signer.
use maestro_contracts::{canonical, parse, raw_digest, validate};
use serde_json::{Value, json};
use std::io::{self, BufRead};
#[cfg(windows)]
fn peak_working_set() -> Option<usize> {
    #[repr(C)]
    struct Counters {
        cb: u32,
        faults: u32,
        peak: usize,
        working: usize,
        quota_peak_paged: usize,
        quota_paged: usize,
        quota_peak_nonpaged: usize,
        quota_nonpaged: usize,
        pagefile: usize,
        peak_pagefile: usize,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
        fn K32GetProcessMemoryInfo(
            process: *mut std::ffi::c_void,
            counters: *mut Counters,
            size: u32,
        ) -> i32;
    }
    let mut counters = Counters {
        cb: std::mem::size_of::<Counters>() as u32,
        faults: 0,
        peak: 0,
        working: 0,
        quota_peak_paged: 0,
        quota_paged: 0,
        quota_peak_nonpaged: 0,
        quota_nonpaged: 0,
        pagefile: 0,
        peak_pagefile: 0,
    };
    // The pseudo handle refers to this live process; the correctly sized C buffer is writable.
    if unsafe {
        K32GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut counters,
            std::mem::size_of::<Counters>() as u32,
        )
    } == 0
    {
        None
    } else {
        Some(counters.peak)
    }
}
#[cfg(not(windows))]
fn peak_working_set() -> Option<usize> {
    None
}
fn run(request: &Value) -> Result<Value, Box<dyn std::error::Error>> {
    let text = request["text"].as_str().unwrap_or("");
    Ok(match request["op"].as_str().unwrap_or("") {
        "transition_set" => {
            let records = request["records"]
                .as_array()
                .ok_or("records")?
                .iter()
                .map(|v| {
                    (
                        v["statement"].as_str().unwrap_or("").as_bytes(),
                        v["oldSignature"].as_str().unwrap_or("").as_bytes(),
                        v["newSignature"].as_str().unwrap_or("").as_bytes(),
                    )
                })
                .collect::<Vec<_>>();
            json!(String::from_utf8(maestro_release::transition_set(
                request["root"].as_str().unwrap_or("").as_bytes(),
                &records,
                request["accepted"] == true
            )?)?)
        }
        "parse_bytes" => parse(&maestro_release::decode_base64(
            request["bytes"].as_str().unwrap_or(""),
            request["length"].as_u64().ok_or("length")? as usize,
        )?)?,
        "enroll" => maestro_release::enroll(
            text.as_bytes(),
            request["fingerprint"].as_str().unwrap_or(""),
            request["accepted"] == true,
        )?,
        "structured_digest" => json!(maestro_contracts::structured_digest(
            request["schema"].as_str().unwrap_or(""),
            &parse(text.as_bytes())?
        )?),
        "parse_dsh" => maestro_contracts::parse_with_profile(
            text.as_bytes(),
            maestro_contracts::AdmissionProfile::DshRelease,
        )?,
        "dsh_inventory" => {
            let closure = maestro_release::dsh::TrustedDshClosure::verify(
                request["closure"].as_str().ok_or("closure")?.as_bytes(),
                request["digest"].as_str().ok_or("digest")?,
                request["lock"].as_str().ok_or("lock")?,
            )?;
            let manifest = maestro_contracts::validate_with_profile(
                "maestro.release.manifest.dsh/1",
                text.as_bytes(),
                true,
                maestro_contracts::AdmissionProfile::DshRelease,
            )?;
            closure.check(&manifest)?;
            json!(true)
        }
        "release_dsh" => {
            let started = std::time::Instant::now();
            let stage = std::path::Path::new(request["stage"].as_str().ok_or("stage")?);
            let closure = maestro_release::dsh::TrustedDshClosure::verify(
                &std::fs::read(request["closure_path"].as_str().ok_or("closure")?)?,
                request["digest"].as_str().ok_or("digest")?,
                request["lock"].as_str().ok_or("lock")?,
            )?;
            let release = maestro_release::staged::VerifiedRelease::verify_profile(
                &std::fs::read(stage.join("release.manifest.json"))?,
                &std::fs::read(stage.join("release.signature.json"))?,
                request["root"].as_str().ok_or("root")?.as_bytes(),
                stage,
                Some(&closure),
            )?;
            json!({"identity":release.identity,"elapsed_ms":started.elapsed().as_secs_f64()*1000.0,"peak_working_set_bytes":peak_working_set(),"build_mode":if cfg!(debug_assertions){"debug"}else{"release"},"memory_method":"K32GetProcessMemoryInfo in verifier process after admission, OS peak working set"})
        }
        "release" => {
            let stage = std::path::Path::new(request["stage"].as_str().unwrap_or(""));
            let release = maestro_release::staged::VerifiedRelease::verify(
                &std::fs::read(stage.join("release.manifest.json"))?,
                &std::fs::read(stage.join("release.signature.json"))?,
                request["root"].as_str().unwrap_or("").as_bytes(),
                stage,
            )?;
            if let Some(entry) = request["entry"].as_str() {
                let statements = request["records"]
                    .as_array()
                    .ok_or("records")?
                    .iter()
                    .map(|v| {
                        (
                            v["statement"].as_str().unwrap_or("").as_bytes(),
                            v["signature"].as_str().unwrap_or("").as_bytes(),
                        )
                    })
                    .collect::<Vec<_>>();
                let evidence = request["evidence"]
                    .as_object()
                    .ok_or("evidence")?
                    .iter()
                    .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").as_bytes().to_vec()))
                    .collect();
                release.admit_capability(entry, &statements, &evidence)?;
            }
            json!(release.identity)
        }
        "transition" => json!(String::from_utf8(maestro_release::transition(
            request["root"].as_str().unwrap_or("").as_bytes(),
            text.as_bytes(),
            request["old"].as_str().unwrap_or("").as_bytes(),
            request["new"].as_str().unwrap_or("").as_bytes(),
            request["accepted"] == true
        )?)?),
        "parse" => parse(text.as_bytes())?,
        "validate" => validate(
            request["schema"].as_str().unwrap_or(""),
            text.as_bytes(),
            request["immutable"] == true,
        )?,
        "canonical" => json!(String::from_utf8(canonical(&parse(text.as_bytes())?)?)?),
        "digest" => json!(raw_digest(text.as_bytes())),
        "signature" => {
            maestro_release::strict_verify(
                &maestro_release::decode_base64(request["key"].as_str().unwrap_or(""), 32)?,
                &maestro_release::decode_base64(request["signature"].as_str().unwrap_or(""), 64)?,
                text.as_bytes(),
            )?;
            json!(true)
        }
        "report" => maestro_contracts::report::check_fixture(
            text.as_bytes(),
            request["profile"].as_str().unwrap_or("").as_bytes(),
            &request["binding"],
            &request["dependencies"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .map(|v| {
                    (
                        v["id"].as_str().unwrap_or("").to_owned(),
                        v["text"].as_str().unwrap_or("").as_bytes().to_vec(),
                    )
                })
                .collect::<Vec<_>>(),
        )?,
        "validate_report" => maestro_contracts::report::validate_report(
            text.as_bytes(),
            request["profile"].as_str().unwrap_or("").as_bytes(),
            &request["binding"],
        )?,
        _ => return Err("unknown operation".into()),
    })
}
fn main() {
    for line in io::stdin().lock().lines() {
        let output = match line {
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(request) => match run(&request) {
                    Ok(value) => json!({"ok":true,"value":value}),
                    Err(_) => json!({"ok":false}),
                },
                Err(_) => json!({"ok":false}),
            },
            Err(_) => break,
        };
        println!("{output}");
    }
}
