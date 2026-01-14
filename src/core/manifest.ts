import * as YAML from "yaml";
import { AccessLevel, type Manifest, type VariableConfig } from "./types";
import { createFile, write } from "../utils/file";

const MANIFEST_VERSION = 1;
const MANIFEST_FILENAME = ".env.manifest.yaml";

/**
 * Default configuration for variables not in manifest
 */
const DEFAULT_CONFIG: VariableConfig = {
  access: AccessLevel.PLACEHOLDER,
  description: "Unclassified variable",
};

/**
 * Validate access level string
 */
function isValidAccessLevel(value: string): value is AccessLevel {
  return Object.values(AccessLevel).includes(value as AccessLevel);
}

/**
 * Parse and validate a manifest from YAML content
 */
export function parseManifest(content: string): Manifest {
  const parsed = YAML.parse(content);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid manifest: expected object");
  }

  const version = parsed.version ?? 1;
  if (typeof version !== "number" || version < 1) {
    throw new Error("Invalid manifest: version must be a positive number");
  }

  const variables: Record<string, VariableConfig> = {};

  if (parsed.variables && typeof parsed.variables === "object") {
    for (const [key, value] of Object.entries(parsed.variables)) {
      if (!value || typeof value !== "object") {
        throw new Error(`Invalid manifest: variable "${key}" must be an object`);
      }

      const config = value as Record<string, unknown>;
      const access = config.access as string;

      if (!access || !isValidAccessLevel(access)) {
        throw new Error(
          `Invalid manifest: variable "${key}" has invalid access level "${access}". ` +
            `Valid levels: ${Object.values(AccessLevel).join(", ")}`
        );
      }

      variables[key] = {
        access: access as AccessLevel,
        description: config.description as string | undefined,
        default: config.default as string | undefined,
        required: config.required as boolean | undefined,
        pattern: config.pattern as string | undefined,
        schema: config.schema as Record<string, string> | undefined,
      };
    }
  }

  return { version, variables };
}

/**
 * Serialize manifest to YAML
 */
export function serializeManifest(manifest: Manifest): string {
  const doc = new YAML.Document({
    version: manifest.version,
    variables: manifest.variables,
  });

  // Add helpful comments
  const header = `# envibe manifest - AI access control for environment variables
# Access levels:
#   full        - AI can see and modify the value
#   read-only   - AI can see but not modify
#   placeholder - AI sees <VAR_NAME>, knows it exists
#   schema-only - AI sees structure/format only
#   hidden      - Completely hidden from AI
#
`;

  return header + doc.toString();
}

/**
 * Create a new empty manifest
 */
export function createEmptyManifest(): Manifest {
  return {
    version: MANIFEST_VERSION,
    variables: {},
  };
}

/**
 * Get variable config from manifest, with default fallback
 */
export function getVariableConfig(
  manifest: Manifest,
  key: string
): VariableConfig {
  return manifest.variables[key] ?? DEFAULT_CONFIG;
}

/**
 * Add or update a variable in the manifest
 */
export function setVariableConfig(
  manifest: Manifest,
  key: string,
  config: VariableConfig
): Manifest {
  return {
    ...manifest,
    variables: {
      ...manifest.variables,
      [key]: config,
    },
  };
}

/**
 * Check if a variable exists in the manifest
 */
export function hasVariable(manifest: Manifest, key: string): boolean {
  return key in manifest.variables;
}

/**
 * Get manifest filename
 */
export function getManifestFilename(): string {
  return MANIFEST_FILENAME;
}

/**
 * Load manifest from file system
 */
export async function loadManifest(directory: string = "."): Promise<Manifest> {
  const path = `${directory}/${MANIFEST_FILENAME}`;
  const file = createFile(path);

  if (!(await file.exists())) {
    throw new Error(`Manifest not found: ${path}`);
  }

  const content = await file.text();
  return parseManifest(content);
}

/**
 * Save manifest to file system
 */
export async function saveManifest(
  manifest: Manifest,
  directory: string = "."
): Promise<void> {
  const path = `${directory}/${MANIFEST_FILENAME}`;
  const content = serializeManifest(manifest);
  await write(path, content);
}
