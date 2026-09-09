use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use sha2::{Digest, Sha256};
use std::{cell::Cell, collections::HashSet, fmt, rc::Rc, sync::LazyLock};

#[allow(clippy::all)]
pub mod generated;
pub mod io;
pub mod report;
pub const MAX_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_STRING: usize = 1024 * 1024;
pub const MAX_ENTRIES: usize = 65536;
pub const SCHEMA: &[u8] = include_bytes!("../../../contracts/schemas/contract-set-v2.schema.json");
pub const SCHEMA_SET_ID: &str = "maestro.contract-set/2";
#[derive(Clone, Copy)]
pub enum AdmissionProfile {
    Small,
    DshRelease,
}
impl AdmissionProfile {
    fn entries(self) -> usize {
        match self {
            Self::Small => MAX_ENTRIES,
            Self::DshRelease => 262144,
        }
    }
}
pub const VALIDATOR_ID: &str = "maestro.validators/1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Error(pub &'static str);
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;
pub fn raw_digest(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
pub fn canonical(value: &Value) -> Result<Vec<u8>> {
    serde_jcs::to_vec(value).map_err(|_| Error("CANONICAL"))
}
pub fn structured_digest(schema: &str, value: &Value) -> Result<String> {
    if schema.is_empty() || !schema.is_ascii() || schema.contains('\0') {
        return Err(Error("SCHEMA"));
    }
    let mut data = schema.as_bytes().to_vec();
    data.push(0);
    data.extend(canonical(value)?);
    Ok(raw_digest(&data))
}

// Check token spelling and decoded string size before serde allocates values.
fn tokens(bytes: &[u8]) -> Result<()> {
    if bytes.len() > MAX_BYTES {
        return Err(Error("BYTES"));
    }
    std::str::from_utf8(bytes).map_err(|_| Error("UTF8"))?;
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return Err(Error("BOM"));
    }
    let mut i = 0;
    let mut depth = 0usize;
    while i < bytes.len() {
        match bytes[i] {
            b'"' => {
                i += 1;
                let mut length = 0;
                while i < bytes.len() && bytes[i] != b'"' {
                    if bytes[i] == b'\\' {
                        i += 1;
                        if i >= bytes.len() {
                            return Err(Error("PARSE"));
                        }
                        if bytes[i] == b'u' {
                            let hex = |start: usize| -> Result<u16> {
                                let part = bytes.get(start..start + 4).ok_or(Error("PARSE"))?;
                                u16::from_str_radix(
                                    std::str::from_utf8(part).map_err(|_| Error("PARSE"))?,
                                    16,
                                )
                                .map_err(|_| Error("PARSE"))
                            };
                            let code = hex(i + 1)?;
                            i += 4;
                            if (0xd800..=0xdbff).contains(&code) {
                                if bytes.get(i + 1..i + 3) != Some(b"\\u") {
                                    return Err(Error("SURROGATE"));
                                }
                                let low = hex(i + 3)?;
                                if !(0xdc00..=0xdfff).contains(&low) {
                                    return Err(Error("SURROGATE"));
                                }
                                i += 6;
                                length += 4;
                            } else if (0xdc00..=0xdfff).contains(&code) {
                                return Err(Error("SURROGATE"));
                            } else {
                                length += if code < 0x80 {
                                    1
                                } else if code < 0x800 {
                                    2
                                } else {
                                    3
                                };
                            }
                        } else {
                            if !b"\"\\/bfnrt".contains(&bytes[i]) {
                                return Err(Error("PARSE"));
                            }
                            length += 1;
                        }
                    } else {
                        length += 1;
                    }
                    if length > MAX_STRING {
                        return Err(Error("STRING"));
                    }
                    i += 1;
                }
                if i == bytes.len() {
                    return Err(Error("PARSE"));
                }
            }
            b'{' | b'[' => {
                depth += 1;
                if depth > 64 {
                    return Err(Error("DEPTH"));
                }
            }
            b'}' | b']' => {
                depth = depth.checked_sub(1).ok_or(Error("PARSE"))?;
            }
            b'-' | b'0'..=b'9' => {
                let start = i;
                while i < bytes.len() && !b" \t\r\n,]}:".contains(&bytes[i]) {
                    i += 1;
                }
                let token = std::str::from_utf8(&bytes[start..i]).map_err(|_| Error("NUMBER"))?;
                let digits = token.strip_prefix('-').unwrap_or(token);
                if digits.is_empty()
                    || !digits.bytes().all(|c| c.is_ascii_digit())
                    || (digits.len() > 1 && digits.starts_with('0'))
                    || token == "-0"
                {
                    return Err(Error("NUMBER"));
                }
                let value = token.parse::<i64>().map_err(|_| Error("NUMBER"))?;
                if !(-9007199254740991..=9007199254740991).contains(&value) {
                    return Err(Error("NUMBER"));
                }
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    Ok(())
}
#[derive(Clone)]
struct Seed {
    limit: usize,
    count: Rc<Cell<usize>>,
    count_value: bool,
}
impl Seed {
    fn increment<E: de::Error>(&self) -> std::result::Result<(), E> {
        if self.count.get() >= self.limit {
            return Err(E::custom("ENTRIES"));
        }
        self.count.set(self.count.get() + 1);
        Ok(())
    }
}
impl<'de> DeserializeSeed<'de> for Seed {
    type Value = Value;
    fn deserialize<D: de::Deserializer<'de>>(self, d: D) -> std::result::Result<Value, D::Error> {
        if self.count_value {
            self.increment()?;
        }
        d.deserialize_any(self)
    }
}
impl<'de> Visitor<'de> for Seed {
    type Value = Value;
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("bounded JSON")
    }
    fn visit_bool<E: de::Error>(self, v: bool) -> std::result::Result<Value, E> {
        Ok(Value::Bool(v))
    }
    fn visit_unit<E: de::Error>(self) -> std::result::Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_i64<E: de::Error>(self, v: i64) -> std::result::Result<Value, E> {
        Ok(Value::Number(Number::from(v)))
    }
    fn visit_u64<E: de::Error>(self, v: u64) -> std::result::Result<Value, E> {
        Ok(Value::Number(Number::from(v)))
    }
    fn visit_str<E: de::Error>(self, v: &str) -> std::result::Result<Value, E> {
        Ok(Value::String(v.to_owned()))
    }
    fn visit_string<E: de::Error>(self, v: String) -> std::result::Result<Value, E> {
        Ok(Value::String(v))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> std::result::Result<Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = seq.next_element_seed(Seed {
            limit: self.limit,
            count: self.count.clone(),
            count_value: true,
        })? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> std::result::Result<Value, A::Error> {
        let mut values = Map::new();
        while let Some(key) = map.next_key::<String>()? {
            self.increment()?;
            if values.contains_key(&key) {
                return Err(de::Error::custom("DUPLICATE"));
            }
            let value = map.next_value_seed(Seed {
                limit: self.limit,
                count: self.count.clone(),
                count_value: false,
            })?;
            values.insert(key, value);
        }
        Ok(Value::Object(values))
    }
}
pub fn parse(bytes: &[u8]) -> Result<Value> {
    parse_with_profile(bytes, AdmissionProfile::Small)
}
pub fn parse_with_profile(bytes: &[u8], profile: AdmissionProfile) -> Result<Value> {
    tokens(bytes)?;
    let mut d = serde_json::Deserializer::from_slice(bytes);
    let value = Seed {
        limit: profile.entries(),
        count: Rc::new(Cell::new(0)),
        count_value: false,
    }
    .deserialize(&mut d)
    .map_err(|_| Error("PARSE"))?;
    d.end().map_err(|_| Error("PARSE"))?;
    Ok(value)
}
static VALIDATOR: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
    let schema: Value = serde_json::from_slice(SCHEMA).expect("embedded schema");
    jsonschema::options()
        .with_draft(jsonschema::Draft::Draft202012)
        .build(&schema)
        .expect("embedded schema compiles")
});
pub fn validate(schema_id: &str, bytes: &[u8], immutable: bool) -> Result<Value> {
    validate_with_profile(schema_id, bytes, immutable, AdmissionProfile::Small)
}
pub fn validate_with_profile(
    schema_id: &str,
    bytes: &[u8],
    immutable: bool,
    profile: AdmissionProfile,
) -> Result<Value> {
    if matches!(profile, AdmissionProfile::Small)
        && ["maestro.release.manifest.dsh/1", "maestro.dsh.closure/1"].contains(&schema_id)
    {
        return Err(Error("PROFILE"));
    }
    if matches!(profile, AdmissionProfile::DshRelease)
        && !["maestro.release.manifest.dsh/1", "maestro.dsh.closure/1"].contains(&schema_id)
    {
        return Err(Error("PROFILE"));
    }
    let value = parse_with_profile(bytes, profile)?;
    if value.get("schema").and_then(Value::as_str) != Some(schema_id) {
        return Err(Error("SCHEMA"));
    }
    if !VALIDATOR.is_valid(&value) {
        return Err(Error("STRUCTURE"));
    }
    let _: generated::MaestroRecord =
        serde_json::from_value(value.clone()).map_err(|_| Error("CONVERSION"))?;
    semantic(&value)?;
    if immutable && canonical(&value)? != bytes {
        return Err(Error("CANONICAL"));
    }
    Ok(value)
}
pub fn semantic(value: &Value) -> Result<()> {
    if let Some(deps) = value.get("dependencies").and_then(Value::as_array) {
        let mut ids = HashSet::new();
        for dep in deps {
            if !ids.insert(dep["id"].as_str()) {
                return Err(Error("REFERENCE"));
            }
        }
    }
    Ok(())
}
pub fn verify_schema_asset(bytes: &[u8]) -> Result<()> {
    if bytes != SCHEMA {
        return Err(Error("SCHEMA_INTEGRITY"));
    }
    Ok(())
}
