use crate::{field, staged::safe_path_profile};
use maestro_contracts::{AdmissionProfile, Error, Result, raw_digest, validate_with_profile};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

/// Expected identities are independent reviewed bootstrap inputs, not manifest claims.
pub struct TrustedDshClosure {
    identity: String,
    lock: String,
    entries: BTreeMap<String, Value>,
}
impl TrustedDshClosure {
    pub fn verify(bytes: &[u8], expected_digest: &str, expected_lock: &str) -> Result<Self> {
        let hash = |v: &str| {
            v.len() == 64
                && v.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        if !hash(expected_digest) || !hash(expected_lock) || raw_digest(bytes) != expected_digest {
            return Err(Error("DSH_TRUST"));
        }
        let closure = validate_with_profile(
            "maestro.dsh.closure/1",
            bytes,
            true,
            AdmissionProfile::DshRelease,
        )?;
        if field(&closure, "lock_sha256")? != expected_lock {
            return Err(Error("DSH_LOCK"));
        }
        let mut entries = BTreeMap::new();
        let mut folded = HashSet::new();
        for entry in closure["files"].as_array().ok_or(Error("DSH_CLOSURE"))? {
            let path = field(entry, "path")?;
            safe_path_profile(path, true)?;
            if !folded.insert(path.to_ascii_lowercase()) || entry["role"] != "dsh" {
                return Err(Error("DSH_CLOSURE"));
            }
            entries.insert(path.to_owned(), entry.clone());
        }
        Ok(Self {
            identity: expected_digest.to_owned(),
            lock: expected_lock.to_owned(),
            entries,
        })
    }
    pub fn check(&self, manifest: &Value) -> Result<()> {
        if manifest["dsh_closure"] != self.identity || manifest["dsh_lock"]["sha256"] != self.lock {
            return Err(Error("DSH_BINDING"));
        }
        let mut inventory = BTreeMap::new();
        let mut owned = BTreeMap::new();
        for entry in manifest["files"].as_array().ok_or(Error("INVENTORY"))? {
            if inventory.insert(field(entry, "path")?, entry).is_some() {
                return Err(Error("INVENTORY"));
            }
        }
        for component in manifest["components"]
            .as_array()
            .ok_or(Error("OWNERSHIP"))?
        {
            for path in component["files"].as_array().ok_or(Error("OWNERSHIP"))? {
                let path = path.as_str().ok_or(Error("OWNERSHIP"))?;
                if owned.insert(path, field(component, "name")?).is_some()
                    || !inventory.contains_key(path)
                {
                    return Err(Error("OWNERSHIP"));
                }
            }
        }
        if owned.len() != inventory.len()
            || inventory.len() > 32768
            || inventory.len().saturating_sub(self.entries.len()) > 4096
        {
            return Err(Error("INVENTORY"));
        }
        for (path, entry) in &self.entries {
            if inventory.get(path.as_str()).copied() != Some(entry)
                || owned.get(path.as_str()).copied() != Some("deepseek-harness")
            {
                return Err(Error("DSH_CLOSURE"));
            }
        }
        for (path, owner) in owned {
            if owner == "deepseek-harness" && !self.entries.contains_key(path) {
                return Err(Error("DSH_CLOSURE"));
            }
        }
        Ok(())
    }
}
