include!("../../target/feasibility/generated.rs");

fn main() {
    let values: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../target/feasibility/vectors.json")).unwrap();
    for value in values {
        let typed: SubsetProbe = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(typed).unwrap(), value);
    }
}
