/**
 * Access levels for environment variables
 * Controls what AI agents can see and do with each variable
 */
export enum AccessLevel {
  /** AI can see and modify the value */
  FULL = "full",
  /** AI can see the value but cannot modify it */
  READ_ONLY = "read-only",
  /** AI sees a placeholder like <VAR_NAME>, knows it exists but not the value */
  PLACEHOLDER = "placeholder",
  /** AI sees the structure/format only, not actual values */
  SCHEMA_ONLY = "schema-only",
  /** Completely hidden from AI - as if it doesn't exist */
  HIDDEN = "hidden",
}

/**
 * Configuration for a single environment variable in the manifest
 */
export interface VariableConfig {
  /** Access level for AI agents */
  access: AccessLevel;
  /** Human-readable description of what this variable is for */
  description?: string;
  /** Default value if not set */
  default?: string;
  /** Whether this variable is required */
  required?: boolean;
  /** Pattern to display instead of actual value (for read-only with masked values) */
  pattern?: string;
  /** Schema structure for schema-only access level */
  schema?: Record<string, string>;
}

/**
 * The manifest file structure (.env.manifest.yaml)
 */
export interface Manifest {
  /** Manifest version */
  version: number;
  /** Variable configurations keyed by variable name */
  variables: Record<string, VariableConfig>;
}

/**
 * Environment variable with its value and access config
 */
export interface EnvVariable {
  /** Variable name */
  key: string;
  /** Actual value (may be undefined if not set) */
  value?: string;
  /** Access configuration from manifest */
  config: VariableConfig;
}

/**
 * Filtered view of an environment variable for AI consumption
 */
export interface AIEnvVariable {
  /** Variable name */
  key: string;
  /** Value as seen by AI (may be placeholder, masked, etc.) */
  displayValue: string;
  /** Access level */
  access: AccessLevel;
  /** Description if available */
  description?: string;
  /** Whether AI can modify this variable */
  canModify: boolean;
}

/**
 * Result of parsing a .env file
 */
export interface ParsedEnv {
  /** Variables keyed by name */
  variables: Record<string, string>;
  /** Original file content for preservation */
  raw: string;
}

/**
 * Common patterns for auto-classifying variables
 */
export interface ClassificationPattern {
  /** Pattern name for reference */
  name: string;
  /** Regex to match variable names */
  pattern: RegExp;
  /** Suggested access level */
  suggestedAccess: AccessLevel;
  /** Description for the variable */
  description?: string;
}
