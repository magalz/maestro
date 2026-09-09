use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let schema_path = env::args().nth(1).ok_or("schema path required")?;
    let schema: schemars::schema::RootSchema = serde_json::from_slice(&fs::read(schema_path)?)?;
    let mut types = typify::TypeSpace::default();
    types.add_root_schema(schema)?;
    println!("{}", types.to_stream());
    Ok(())
}
