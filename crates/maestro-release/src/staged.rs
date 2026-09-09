use crate::dsh::TrustedDshClosure;
use crate::{decode_base64, field, verify_envelope};
use maestro_contracts::{AdmissionProfile, validate_with_profile};
use maestro_contracts::{
    Error, Result, canonical, raw_digest, structured_digest, validate, verify_schema_asset,
};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashSet},
    fs::{self, File, OpenOptions},
    io::Read,
    path::Path,
};
fn io<T>(result: std::io::Result<T>) -> Result<T> {
    result.map_err(|_| Error("FILE"))
}
pub fn safe_path(path: &str) -> Result<()> {
    safe_path_profile(path, false)
}
pub fn safe_path_profile(path: &str, dsh: bool) -> Result<()> {
    if path.is_empty()
        || path.len() > 240
        || !path.as_bytes()[0].is_ascii_alphanumeric()
        || !path.bytes().all(|v| {
            v.is_ascii_alphanumeric() || b"._/-".contains(&v) || (dsh && b"@+".contains(&v))
        })
    {
        return Err(Error("PATH"));
    }
    for part in path.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with('.')
            || ["con", "prn", "aux", "nul"].contains(&stem.as_str())
            || (stem.len() == 4
                && (stem.starts_with("com") || stem.starts_with("lpt"))
                && (b'1'..=b'9').contains(&stem.as_bytes()[3]))
        {
            return Err(Error("PATH"));
        }
    }
    Ok(())
}
#[cfg(windows)]
fn identity(file: &File) -> Result<(u64, u64)> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{
        BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_REPARSE_POINT, GetFileInformationByHandle,
    };
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    // The file owns a live handle; the API fills a correctly sized writable structure.
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut info) } == 0
        || info.nNumberOfLinks != 1
        || info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(Error("FILE"));
    }
    Ok((
        u64::from(info.dwVolumeSerialNumber),
        (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow),
    ))
}
#[cfg(unix)]
fn identity(file: &File) -> Result<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let m = io(file.metadata())?;
    if m.nlink() != 1 {
        return Err(Error("FILE"));
    }
    Ok((m.dev(), m.ino()))
}
fn snapshot(root: &Path, path: &str, size: u64, digest: &str, dsh: bool) -> Result<Vec<u8>> {
    safe_path_profile(path, dsh)?;
    if size > 268435456 {
        return Err(Error("SIZE"));
    }
    let full = root.join(path);
    let before = io(fs::symlink_metadata(&full))?;
    if !before.is_file() || before.file_type().is_symlink() || before.len() != size {
        return Err(Error("FILE"));
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(1).custom_flags(0x00200000);
    }
    let mut file = io(options.open(&full))?;
    let id = identity(&file)?;
    let opened = io(file.metadata())?;
    let mut bytes = Vec::with_capacity(size as usize);
    io((&mut file).take(size + 1).read_to_end(&mut bytes))?;
    let after = io(file.metadata())?;
    let selected = io(options.open(&full))?;
    if id != identity(&selected)?
        || id != identity(&file)?
        || opened.modified().ok() != after.modified().ok()
        || bytes.len() as u64 != size
        || raw_digest(&bytes) != digest
    {
        return Err(Error("INTEGRITY"));
    }
    Ok(bytes)
}
fn list(
    root: &Path,
    prefix: &str,
    count: &mut usize,
    files: &mut HashSet<String>,
    dsh: bool,
) -> Result<()> {
    if prefix.len() > 240 {
        return Err(Error("PATH"));
    }
    for item in io(fs::read_dir(root))? {
        let item = io(item)?;
        *count += 1;
        if *count > if dsh { 262144 } else { 8192 } {
            return Err(Error("INVENTORY"));
        }
        let name = item.file_name().into_string().map_err(|_| Error("PATH"))?;
        let path = format!("{prefix}{name}");
        safe_path_profile(&path, dsh)?;
        let kind = io(fs::symlink_metadata(item.path()))?;
        if kind.file_type().is_symlink() {
            return Err(Error("PATH"));
        }
        if kind.is_dir() {
            list(&item.path(), &format!("{path}/"), count, files, dsh)?;
        } else if kind.is_file() {
            files.insert(path);
        } else {
            return Err(Error("FILE"));
        }
    }
    Ok(())
}
/// Captured bytes only: callers cannot accidentally reopen an admitted pathname.
pub struct VerifiedRelease {
    pub identity: String,
    manifest: Value,
    root: Value,
    files: BTreeMap<String, Vec<u8>>,
}
impl VerifiedRelease {
    pub fn verify(
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
        enrolled_root_bytes: &[u8],
        staged: &Path,
    ) -> Result<Self> {
        Self::verify_profile(
            manifest_bytes,
            signature_bytes,
            enrolled_root_bytes,
            staged,
            None,
        )
    }
    pub fn verify_profile(
        manifest_bytes: &[u8],
        signature_bytes: &[u8],
        enrolled_root_bytes: &[u8],
        staged: &Path,
        closure: Option<&TrustedDshClosure>,
    ) -> Result<Self> {
        let dsh = closure.is_some();
        let root = validate("maestro.trust.root/1", enrolled_root_bytes, true)?;
        if root["status"] != "active"
            || raw_digest(&decode_base64(field(&root, "public_key")?, 32)?)
                != field(&root, "fingerprint")?
        {
            return Err(Error("TRUST"));
        }
        let manifest = if dsh {
            validate_with_profile(
                "maestro.release.manifest.dsh/1",
                manifest_bytes,
                true,
                AdmissionProfile::DshRelease,
            )?
        } else {
            validate("maestro.release.manifest/1", manifest_bytes, true)?
        };
        if let Some(closure) = closure {
            closure.check(&manifest)?;
        }
        if manifest["signer"] != root["fingerprint"]
            || manifest["trust_revision"] != root["revision"]
        {
            return Err(Error("TRUST"));
        }
        verify_envelope(
            "maestro.release.manifest/1",
            manifest_bytes,
            signature_bytes,
            field(&root, "public_key")?,
        )?;
        let meta = io(fs::symlink_metadata(staged))?;
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(Error("PATH"));
        }
        let mut files = BTreeMap::new();
        let mut folded = HashSet::new();
        let mut total = 0u64;
        let inventory = manifest["files"].as_array().ok_or(Error("INVENTORY"))?;
        for entry in inventory {
            let path = field(entry, "path")?;
            safe_path_profile(path, dsh)?;
            if !folded.insert(path.to_ascii_lowercase())
                || ["release.manifest.json", "release.signature.json"].contains(&path)
            {
                return Err(Error("INVENTORY"));
            }
            let mut parent = staged.to_path_buf();
            let parts = path.split('/').collect::<Vec<_>>();
            for part in &parts[..parts.len() - 1] {
                parent.push(part);
                let m = io(fs::symlink_metadata(&parent))?;
                if m.file_type().is_symlink() || !m.is_dir() {
                    return Err(Error("PATH"));
                }
            }
            let size = field(entry, "size")?
                .parse::<u64>()
                .map_err(|_| Error("SIZE"))?;
            total = total.checked_add(size).ok_or(Error("SIZE"))?;
            if total > 1073741824 {
                return Err(Error("SIZE"));
            }
            files.insert(
                path.to_owned(),
                snapshot(staged, path, size, field(entry, "sha256")?, dsh)?,
            );
        }
        let mut actual = HashSet::new();
        list(staged, "", &mut 0, &mut actual, dsh)?;
        for (name, bytes) in [
            ("release.manifest.json", manifest_bytes),
            ("release.signature.json", signature_bytes),
        ] {
            if snapshot(staged, name, bytes.len() as u64, &raw_digest(bytes), dsh)? != bytes {
                return Err(Error("INTEGRITY"));
            }
            actual.remove(name);
        }
        if actual.len() != files.len() || actual.iter().any(|name| !files.contains_key(name)) {
            return Err(Error("EXTRA_FILE"));
        }
        for key in ["registry", "bootstrap", "catalog", "acceptance_policy"]
            .into_iter()
            .chain(if dsh { Some("dsh_lock") } else { None })
        {
            let reference = &manifest[key];
            let bytes = files
                .get(field(reference, "path")?)
                .ok_or(Error("REFERENCE"))?;
            if raw_digest(bytes) != field(reference, "sha256")? {
                return Err(Error("REFERENCE"));
            }
        }
        for role in [
            "launcher",
            "controller",
            "gateway",
            "plugin",
            "dsh",
            "node",
            "schema",
            "binding",
            "validator",
            "profile",
            "bootstrap",
            "catalog",
            "lock",
            "provenance",
            "notice",
        ] {
            if !inventory.iter().any(|v| v["role"] == role) {
                return Err(Error("COMPONENT"));
            }
        }
        let components = manifest["components"]
            .as_array()
            .ok_or(Error("COMPONENT"))?;
        if components.is_empty() {
            return Err(Error("COMPONENT"));
        }
        let mut ownership = HashSet::new();
        for component in components {
            for key in ["files", "notices"] {
                let refs = component[key].as_array().ok_or(Error("NOTICES"))?;
                if refs.is_empty()
                    || refs
                        .iter()
                        .any(|v| !files.contains_key(v.as_str().unwrap_or("")))
                {
                    return Err(Error("NOTICES"));
                }
                for reference in refs {
                    let path = reference.as_str().ok_or(Error("NOTICES"))?;
                    if key == "files" && !ownership.insert(path) {
                        return Err(Error("OWNERSHIP"));
                    }
                    if key == "notices"
                        && !inventory
                            .iter()
                            .any(|v| v["path"] == path && v["role"] == "notice")
                    {
                        return Err(Error("NOTICES"));
                    }
                }
            }
        }
        if ownership.len() != files.len() {
            return Err(Error("OWNERSHIP"));
        }
        let release = Self {
            identity: raw_digest(manifest_bytes),
            manifest,
            root,
            files,
        };
        let registry = validate(
            "maestro.validator.registry/1",
            release.reference("registry")?,
            true,
        )?;
        for key in ["schemas", "bindings", "profiles"] {
            let refs = registry[key].as_array().ok_or(Error("REGISTRY"))?;
            if refs.is_empty() {
                return Err(Error("REGISTRY"));
            }
            for reference in refs {
                let bytes = release.select(field(reference, "path")?)?;
                if raw_digest(bytes) != field(reference, "sha256")? {
                    return Err(Error("REGISTRY"));
                }
                if key == "schemas" {
                    if reference["id"] != "maestro.contract-set/2" {
                        return Err(Error("SCHEMA"));
                    }
                    verify_schema_asset(bytes)?;
                }
                if key == "profiles" {
                    validate("maestro.artifact.profile/1", bytes, true)?;
                }
            }
        }
        let expected_bindings = [
            raw_digest(include_bytes!("../../maestro-contracts/src/generated.rs")),
            raw_digest(include_bytes!(
                "../../../packages/contracts/src/generated.ts"
            )),
        ]
        .into_iter()
        .collect::<HashSet<_>>();
        let actual_bindings = registry["bindings"]
            .as_array()
            .ok_or(Error("REGISTRY"))?
            .iter()
            .map(|v| field(v, "sha256").map(str::to_owned))
            .collect::<Result<HashSet<_>>>()?;
        if registry["schemas"]
            .as_array()
            .ok_or(Error("REGISTRY"))?
            .len()
            != 1
            || registry["bindings"]
                .as_array()
                .ok_or(Error("REGISTRY"))?
                .len()
                != 2
            || expected_bindings != actual_bindings
        {
            return Err(Error("BINDING_INTEGRITY"));
        }
        validate(
            "maestro.runtime.bootstrap/1",
            release.reference("bootstrap")?,
            true,
        )?;
        validate(
            "maestro.compatibility.catalog/1",
            release.reference("catalog")?,
            true,
        )?;
        let policy = validate(
            "maestro.release.acceptance-policy/1",
            release.reference("acceptance_policy")?,
            true,
        )?;
        if policy["signer"] != release.root["fingerprint"] {
            return Err(Error("POLICY_SIGNER"));
        }
        Ok(release)
    }
    pub fn select(&self, path: &str) -> Result<&[u8]> {
        self.files.get(path).map(Vec::as_slice).ok_or(Error("FILE"))
    }
    fn reference(&self, key: &str) -> Result<&[u8]> {
        self.select(field(&self.manifest[key], "path")?)
    }
    pub fn admit_capability(
        &self,
        entry_digest: &str,
        records: &[(&[u8], &[u8])],
        evidence: &BTreeMap<String, Vec<u8>>,
    ) -> Result<()> {
        let catalog = validate(
            "maestro.compatibility.catalog/1",
            self.reference("catalog")?,
            true,
        )?;
        let entries = catalog["entries"]
            .as_array()
            .ok_or(Error("CATALOG"))?
            .iter()
            .filter(|v| {
                structured_digest("maestro.compatibility.entry/1", v)
                    .ok()
                    .as_deref()
                    == Some(entry_digest)
            })
            .collect::<Vec<_>>();
        if entries.len() != 1 || records.len() != 1 {
            return Err(Error("CONFLICT"));
        }
        let entry = entries[0];
        for reference in entry["implementation"]
            .as_array()
            .ok_or(Error("IMPLEMENTATION"))?
        {
            if raw_digest(self.select(field(reference, "path")?)?) != field(reference, "sha256")? {
                return Err(Error("IMPLEMENTATION"));
            }
        }
        if entry["reader"]["kind"] != "self" && entry["reader"]["manifest"] != self.identity {
            return Err(Error("READER"));
        }
        let policy_bytes = self.reference("acceptance_policy")?;
        let policy = validate("maestro.release.acceptance-policy/1", policy_bytes, true)?;
        let required = policy["required"]
            .as_array()
            .ok_or(Error("COVERAGE"))?
            .iter()
            .filter(|v| v["capability"] == entry["capability"])
            .collect::<Vec<_>>();
        if required.len() != 1 {
            return Err(Error("COVERAGE"));
        }
        let cases = required[0]["cases"].as_array().ok_or(Error("COVERAGE"))?;
        if cases.is_empty()
            || cases
                .iter()
                .map(|v| v.as_str())
                .collect::<HashSet<_>>()
                .len()
                != cases.len()
        {
            return Err(Error("COVERAGE"));
        }
        let statement = validate("maestro.release.acceptance/1", records[0].0, true)?;
        verify_envelope(
            "maestro.release.acceptance/1",
            records[0].0,
            records[0].1,
            field(&self.root, "public_key")?,
        )?;
        if statement["release"] != self.identity
            || statement["entry"] != entry_digest
            || statement["policy"] != raw_digest(policy_bytes)
            || statement["route"] != self.manifest["route"]
            || entry["route"] != self.manifest["route"]
            || statement["case_set"] != raw_digest(&canonical(&required[0]["cases"])?)
            || statement["outcome"] != "pass"
        {
            return Err(Error("ACCEPTANCE"));
        }
        let actual = statement["cases"].as_array().ok_or(Error("COVERAGE"))?;
        if actual.len() != cases.len() {
            return Err(Error("COVERAGE"));
        }
        for (value, id) in actual.iter().zip(cases) {
            let bytes = evidence
                .get(field(&value["evidence"], "path")?)
                .ok_or(Error("EVIDENCE"))?;
            if value["id"] != *id
                || value["outcome"] != "pass"
                || raw_digest(bytes) != field(&value["evidence"], "sha256")?
            {
                return Err(Error("EVIDENCE"));
            }
        }
        if entry["capability"] == "full_migration" || entry["capability"] == "prospective_adoption"
        {
            return Err(Error("UNSUPPORTED_CAPABILITY"));
        }
        Ok(())
    }
}
