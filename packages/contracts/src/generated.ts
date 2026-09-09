// Generated from SHA-256 5343faa15bcd03d1d30fe607be5bab54e03c854be0f59d32ed35502f03c6881d. Do not edit.

export type MaestroRecord =
  | ReleaseManifest
  | ReleaseSignature
  | AcceptanceSignature
  | TransitionSignature
  | TrustRoot
  | TrustTransition
  | ValidatorRegistry
  | RuntimeBootstrap
  | CompatibilityCatalog
  | AcceptancePolicy
  | ReleaseAcceptance
  | ArtifactProfile
  | JsonFixture
  | ValidationReport
  | ResourceProfile
  | DshManifest
  | DshClosure
  | DshResourceProfile;
export type Reader =
  | {
      kind: "self";
    }
  | {
      kind: "release";
      manifest: string;
    };

export interface ReleaseManifest {
  schema: "maestro.release.manifest/1";
  version: string;
  source_commit: string;
  source_tree: string;
  route: string;
  signer: string;
  trust_revision: string;
  digest_profile: "maestro.raw-sha256/1";
  signature_profile: "maestro.ed25519-strict/1";
  /**
   * @minItems 0
   * @maxItems 4096
   */
  files: File[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  components: Component[];
  registry: Reference;
  bootstrap: Reference;
  catalog: Reference;
  acceptance_policy: Reference;
  /**
   * @minItems 0
   * @maxItems 0
   */
  migrations: [];
}
export interface File {
  path: string;
  role:
    | "launcher"
    | "controller"
    | "gateway"
    | "plugin"
    | "dsh"
    | "node"
    | "schema"
    | "binding"
    | "validator"
    | "profile"
    | "bootstrap"
    | "catalog"
    | "lock"
    | "provenance"
    | "notice";
  sha256: string;
  size: string;
  classification: "executable" | "data";
}
export interface Component {
  name: string;
  version: string;
  rationale: string;
  /**
   * @minItems 0
   * @maxItems 4096
   */
  files: string[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  notices: string[];
  source: string;
}
export interface Reference {
  path: string;
  sha256: string;
}
export interface ReleaseSignature {
  schema: "maestro.release.signature/1";
  public_key: string;
  signature: string;
}
export interface AcceptanceSignature {
  schema: "maestro.release.acceptance-signature/1";
  public_key: string;
  signature: string;
}
export interface TransitionSignature {
  schema: "maestro.trust.transition-signature/1";
  public_key: string;
  signature: string;
}
export interface TrustRoot {
  schema: "maestro.trust.root/1";
  purpose: "maestro.distribution";
  public_key: string;
  fingerprint: string;
  revision: string;
  status: "active" | "revoked";
}
export interface TrustTransition {
  schema: "maestro.trust.transition/1";
  purpose: "maestro.distribution";
  old_key: string;
  new_key: string;
  revision: string;
}
export interface ValidatorRegistry {
  schema: "maestro.validator.registry/1";
  validator: "maestro.validators/1";
  /**
   * @minItems 0
   * @maxItems 128
   */
  schemas: {
    id: string;
    sha256: string;
    path: string;
  }[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  profiles: Reference[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  bindings: Reference[];
}
export interface RuntimeBootstrap {
  schema: "maestro.runtime.bootstrap/1";
  runtime: string;
  database_schema: string;
  catalog_schema: string;
  minimum_policy: string;
  /**
   * @minItems 0
   * @maxItems 0
   */
  migrations: [];
}
export interface CompatibilityCatalog {
  schema: "maestro.compatibility.catalog/1";
  /**
   * @minItems 0
   * @maxItems 128
   */
  entries: {
    domain: "installation" | "project";
    source_contract: string;
    source_schema: string;
    source_profile: string;
    reader: Reader;
    route: string;
    minimum_policy: string;
    capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
    /**
     * @minItems 0
     * @maxItems 16
     */
    implementation:
      | []
      | [Reference]
      | [Reference, Reference]
      | [Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference]
      | [Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference, Reference]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ]
      | [
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference,
          Reference
        ];
    /**
     * @minItems 0
     * @maxItems 32
     */
    preconditions: string[];
    /**
     * @minItems 0
     * @maxItems 32
     */
    postconditions: string[];
    recovery: string;
  }[];
}
export interface AcceptancePolicy {
  schema: "maestro.release.acceptance-policy/1";
  signer: string;
  statement_schema: "maestro.release.acceptance/1";
  signature_profile: "maestro.ed25519-strict/1";
  /**
   * @minItems 0
   * @maxItems 5
   */
  required:
    | []
    | [
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        }
      ]
    | [
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        }
      ]
    | [
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        }
      ]
    | [
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        }
      ]
    | [
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        },
        {
          capability: "historical_read" | "current_state_read" | "execute" | "full_migration" | "prospective_adoption";
          /**
           * @minItems 0
           * @maxItems 128
           */
          cases: string[];
        }
      ];
}
export interface ReleaseAcceptance {
  schema: "maestro.release.acceptance/1";
  release: string;
  entry: string;
  policy: string;
  route: string;
  case_set: string;
  outcome: "pass" | "fail" | "error";
  /**
   * @minItems 0
   * @maxItems 128
   */
  cases: Case[];
}
export interface Case {
  id: string;
  outcome: "pass" | "fail" | "error";
  evidence: Reference;
}
export interface ArtifactProfile {
  schema: "maestro.artifact.profile/1";
  family: "maestro.fixture.json/1";
  stage: "draft" | "accepted";
  validator: "maestro.fixture-checker/1";
  /**
   * @minItems 0
   * @maxItems 3
   */
  required:
    | []
    | ["parse" | "structure" | "integrity"]
    | ["parse" | "structure" | "integrity", "parse" | "structure" | "integrity"]
    | ["parse" | "structure" | "integrity", "parse" | "structure" | "integrity", "parse" | "structure" | "integrity"];
  max_input_bytes: number;
  max_report_bytes: number;
  max_duration_ms: number;
  max_diagnostics: number;
  max_checks: number;
  configuration: string;
}
export interface JsonFixture {
  schema: "maestro.fixture.json/1";
  value: string;
  /**
   * @minItems 0
   * @maxItems 32
   */
  dependencies: {
    id: string;
    digest: string;
  }[];
}
export interface ValidationReport {
  schema: "maestro.validation.report/1";
  binding: Binding;
  checker: "maestro.fixture-checker/1";
  provenance:
    | {
        kind: "fresh";
      }
    | {
        kind: "reused";
        source_receipt: string;
      };
  /**
   * @minItems 0
   * @maxItems 3
   */
  checks:
    | []
    | [
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        }
      ]
    | [
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        },
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        }
      ]
    | [
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        },
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        },
        {
          id: "parse" | "structure" | "integrity";
          outcome: "pass" | "fail" | "error";
        }
      ];
  outcome: "pass" | "fail" | "error";
  /**
   * @minItems 0
   * @maxItems 32
   */
  diagnostics: Diagnostic[];
  diagnostic_count: number;
  truncated: boolean;
  duration_ms: number;
  fresh_count: number;
  reused_count: number;
  repair_count: number;
}
export interface Binding {
  project: string;
  scope: string;
  subject: string;
  revision: string;
  input: string;
  dependencies: string;
  family: string;
  stage: "draft" | "accepted";
  profile: string;
  schema: string;
  validator: string;
  configuration: string;
  executor: string;
  environment: string;
}
export interface Diagnostic {
  rule: "PARSE" | "STRUCTURE" | "BINDING" | "INTEGRITY" | "COVERAGE" | "CHECKER" | "TIMEOUT";
  location: "$" | "$.schema" | "$.value" | "$.dependencies" | "$.checks" | "$.binding";
  message:
    | "Input rejected"
    | "Required check failed"
    | "Required check unavailable"
    | "Snapshot changed"
    | "Trusted bytes mismatch"
    | "Required coverage incomplete";
  hint:
    | "Correct the editable draft and recheck"
    | "Restore from independently trusted evidence"
    | "Run the required checker again";
}
export interface ResourceProfile {
  schema: "maestro.resource.profile/1";
  max_bytes: number;
  max_depth: number;
  max_entries: number;
  max_string_bytes: number;
  max_files: number;
}
export interface DshManifest {
  schema: "maestro.release.manifest.dsh/1";
  version: string;
  source_commit: string;
  source_tree: string;
  route: string;
  signer: string;
  trust_revision: string;
  digest_profile: "maestro.raw-sha256/1";
  signature_profile: "maestro.ed25519-strict/1";
  /**
   * @minItems 0
   * @maxItems 32768
   */
  files: DshFile[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  components: DshComponent[];
  registry: Reference;
  bootstrap: Reference;
  catalog: Reference;
  acceptance_policy: Reference;
  /**
   * @minItems 0
   * @maxItems 0
   */
  migrations: [];
  resource_profile: "maestro.release.inventory.dsh/1";
  dsh_closure: string;
  dsh_lock: Reference;
}
export interface DshFile {
  path: string;
  role:
    | "launcher"
    | "controller"
    | "gateway"
    | "plugin"
    | "dsh"
    | "node"
    | "schema"
    | "binding"
    | "validator"
    | "profile"
    | "bootstrap"
    | "catalog"
    | "lock"
    | "provenance"
    | "notice";
  sha256: string;
  size: string;
  classification: "executable" | "data";
}
export interface DshComponent {
  name: string;
  version: string;
  rationale: string;
  /**
   * @minItems 0
   * @maxItems 32768
   */
  files: string[];
  /**
   * @minItems 0
   * @maxItems 128
   */
  notices: string[];
  source: string;
}
export interface DshClosure {
  schema: "maestro.dsh.closure/1";
  profile: "maestro.release.inventory.dsh/1";
  lock_sha256: string;
  owner: "deepseek-harness";
  /**
   * @minItems 1
   * @maxItems 32768
   */
  files: [DshFile, ...DshFile[]];
}
export interface DshResourceProfile {
  schema: "maestro.release.inventory.dsh/1";
  max_bytes: number;
  max_depth: number;
  max_entries: 262144;
  max_string_bytes: number;
  max_files: 32768;
  max_other_files: 4096;
}
