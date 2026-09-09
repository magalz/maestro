use std::{env, path::Path};
fn run() -> Result<String, Box<dyn std::error::Error>> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 2 && args.len() != 5 {
        return Err("usage: maestro-launcher ENROLLED_ROOT STAGED_DIRECTORY [REVIEWED_CLOSURE EXPECTED_CLOSURE_SHA256 EXPECTED_LOCK_SHA256]".into());
    }
    let closure = if args.len() == 5 {
        Some(maestro_release::dsh::TrustedDshClosure::verify(
            &maestro_release::read_regular(&args[2])?,
            &args[3],
            &args[4],
        )?)
    } else {
        None
    };
    let stage = Path::new(&args[1]);
    let release = maestro_release::staged::VerifiedRelease::verify_profile(
        &maestro_release::read_regular(stage.join("release.manifest.json"))?,
        &maestro_release::read_regular(stage.join("release.signature.json"))?,
        &maestro_release::read_regular(&args[0])?,
        stage,
        closure.as_ref(),
    )?;
    Ok(release.identity)
}
fn main() {
    match run() {
        Ok(identity) => println!(
            "Verified development release {identity}; runtime activation requires route acceptance"
        ),
        Err(_) => {
            eprintln!("Release admission rejected");
            std::process::exit(1);
        }
    }
}
