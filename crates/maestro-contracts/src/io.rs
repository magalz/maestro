use crate::{Error, MAX_BYTES, Result};
use std::{fs, fs::OpenOptions, io::Read, path::Path};
pub fn read_regular(path: impl AsRef<Path>) -> Result<Vec<u8>> {
    read_regular_limit(path, MAX_BYTES)
}
pub fn read_regular_limit(path: impl AsRef<Path>, limit: usize) -> Result<Vec<u8>> {
    if limit > MAX_BYTES {
        return Err(Error("BYTES"));
    }
    let path = path.as_ref();
    let before = fs::symlink_metadata(path).map_err(|_| Error("FILE"))?;
    if !before.is_file() || before.file_type().is_symlink() || before.len() > limit as u64 {
        return Err(Error("FILE"));
    }
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.custom_flags(0x00200000);
    }
    // Avoid blocking if a regular input is concurrently replaced with a FIFO.
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(0x800 | 0x20000);
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(0x4 | 0x100);
    }
    let file = options.open(path).map_err(|_| Error("FILE"))?;
    let opened = file.metadata().map_err(|_| Error("FILE"))?;
    if !opened.is_file() || opened.len() > limit as u64 {
        return Err(Error("FILE"));
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| Error("FILE"))?;
    if bytes.len() > limit {
        return Err(Error("BYTES"));
    }
    Ok(bytes)
}
