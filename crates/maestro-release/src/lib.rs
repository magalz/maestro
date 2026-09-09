//! Admission uses an independently enrolled root, never a key supplied by the candidate.
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use curve25519_dalek::{edwards::CompressedEdwardsY, traits::IsIdentity};
use ed25519_dalek::{Signature, VerifyingKey};
use maestro_contracts::{Error, Result, canonical, raw_digest, validate};
use serde_json::Value;
pub mod dsh;
pub mod staged;
pub type TransitionRecord<'a> = (&'a [u8], &'a [u8], &'a [u8]);
pub fn transition_set(
    root_bytes: &[u8],
    records: &[TransitionRecord<'_>],
    accepted: bool,
) -> Result<Vec<u8>> {
    if records.len() != 1 {
        return Err(Error("TRANSITION_CONFLICT"));
    }
    transition(
        root_bytes,
        records[0].0,
        records[0].1,
        records[0].2,
        accepted,
    )
}

pub fn decode_base64(value: &str, length: usize) -> Result<Vec<u8>> {
    let bytes = URL_SAFE_NO_PAD.decode(value).map_err(|_| Error("BASE64"))?;
    if bytes.len() != length || URL_SAFE_NO_PAD.encode(&bytes) != value {
        return Err(Error("BASE64"));
    }
    Ok(bytes)
}
pub fn strict_verify(public_key: &[u8], signature: &[u8], message: &[u8]) -> Result<()> {
    let key_bytes: [u8; 32] = public_key.try_into().map_err(|_| Error("SIGNATURE"))?;
    let sig_bytes: [u8; 64] = signature.try_into().map_err(|_| Error("SIGNATURE"))?;
    for bytes in [
        key_bytes,
        sig_bytes[..32].try_into().map_err(|_| Error("SIGNATURE"))?,
    ] {
        let point = CompressedEdwardsY(bytes)
            .decompress()
            .ok_or(Error("SIGNATURE"))?;
        if point.compress().to_bytes() != bytes || point.is_identity() || !point.is_torsion_free() {
            return Err(Error("SIGNATURE"));
        }
    }
    VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| Error("SIGNATURE"))?
        .verify_strict(message, &Signature::from_bytes(&sig_bytes))
        .map_err(|_| Error("SIGNATURE"))
}
fn field<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value[key].as_str().ok_or(Error("FIELD"))
}
pub fn verify_envelope(
    purpose: &str,
    message: &[u8],
    envelope_bytes: &[u8],
    expected_key: &str,
) -> Result<()> {
    let schema = match purpose {
        "maestro.release.manifest/1" => "maestro.release.signature/1",
        "maestro.release.acceptance/1" => "maestro.release.acceptance-signature/1",
        "maestro.trust.transition/1" => "maestro.trust.transition-signature/1",
        _ => return Err(Error("PURPOSE")),
    };
    let envelope = validate(schema, envelope_bytes, true)?;
    if field(&envelope, "public_key")? != expected_key {
        return Err(Error("SIGNER"));
    }
    let mut framed = purpose.as_bytes().to_vec();
    framed.push(0);
    framed.extend(message);
    strict_verify(
        &decode_base64(expected_key, 32)?,
        &decode_base64(field(&envelope, "signature")?, 64)?,
        &framed,
    )
}
pub fn enroll(
    root_bytes: &[u8],
    authenticated_fingerprint: &str,
    explicitly_accepted: bool,
) -> Result<Value> {
    let root = validate("maestro.trust.root/1", root_bytes, true)?;
    if !explicitly_accepted
        || root["status"] != "active"
        || root["fingerprint"] != authenticated_fingerprint
        || raw_digest(&decode_base64(field(&root, "public_key")?, 32)?) != authenticated_fingerprint
    {
        return Err(Error("ENROLLMENT"));
    }
    Ok(root)
}
pub fn transition(
    root_bytes: &[u8],
    statement_bytes: &[u8],
    old_signature: &[u8],
    new_signature: &[u8],
    accepted: bool,
) -> Result<Vec<u8>> {
    let mut root = validate("maestro.trust.root/1", root_bytes, true)?;
    let statement = validate("maestro.trust.transition/1", statement_bytes, true)?;
    let revision = field(&root, "revision")?
        .parse::<u128>()
        .map_err(|_| Error("TRANSITION"))?;
    if !accepted
        || root["status"] != "active"
        || statement["old_key"] != root["public_key"]
        || statement["new_key"] == root["public_key"]
        || field(&statement, "revision")?.parse::<u128>().ok() != revision.checked_add(1)
    {
        return Err(Error("TRANSITION"));
    }
    if raw_digest(&decode_base64(field(&root, "public_key")?, 32)?) != field(&root, "fingerprint")?
    {
        return Err(Error("TRUST"));
    }
    verify_envelope(
        "maestro.trust.transition/1",
        statement_bytes,
        old_signature,
        field(&statement, "old_key")?,
    )?;
    verify_envelope(
        "maestro.trust.transition/1",
        statement_bytes,
        new_signature,
        field(&statement, "new_key")?,
    )?;
    root["fingerprint"] = raw_digest(&decode_base64(field(&statement, "new_key")?, 32)?).into();
    root["public_key"] = statement["new_key"].clone();
    root["revision"] = statement["revision"].clone();
    canonical(&root)
}
pub use maestro_contracts::io::read_regular;
