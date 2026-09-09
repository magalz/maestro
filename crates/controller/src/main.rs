use std::env;
fn run() -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    if args.len() != 3 {
        return Err("usage: maestro-controller DRAFT PROFILE EXPECTED_BINDING".into());
    }
    let binding = maestro_contracts::parse(&maestro_contracts::io::read_regular(&args[2])?)?;
    let profile_bytes = maestro_contracts::io::read_regular(&args[1])?;
    let profile = maestro_contracts::validate("maestro.artifact.profile/1", &profile_bytes, false)?;
    let report = maestro_contracts::report::check_fixture(
        &maestro_contracts::io::read_regular_limit(
            &args[0],
            profile["max_input_bytes"].as_u64().ok_or("PROFILE")? as usize,
        )?,
        &profile_bytes,
        &binding,
        &[],
    )?;
    Ok(maestro_contracts::canonical(&report)?)
}
fn main() {
    match run() {
        Ok(bytes) => {
            use std::io::Write;
            if std::io::stdout().write_all(&bytes).is_err() {
                std::process::exit(1);
            }
        }
        Err(_) => {
            eprintln!("Artifact admission rejected");
            std::process::exit(1);
        }
    }
}
