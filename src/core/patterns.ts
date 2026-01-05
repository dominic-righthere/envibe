import { AccessLevel, type ClassificationPattern, type VariableConfig } from "./types";

/**
 * Common patterns for auto-classifying environment variables
 * Order matters - first match wins
 */
export const CLASSIFICATION_PATTERNS: ClassificationPattern[] = [
  // Hidden (highly sensitive)
  {
    name: "stripe-secret",
    pattern: /^STRIPE_SECRET/i,
    suggestedAccess: AccessLevel.HIDDEN,
    description: "Stripe secret key",
    format: "key",
    example: "sk_live_...",
  },
  {
    name: "private-key",
    pattern: /PRIVATE[_-]?KEY/i,
    suggestedAccess: AccessLevel.HIDDEN,
    description: "Private key material",
    format: "pem",
    example: "-----BEGIN PRIVATE KEY-----...",
  },
  {
    name: "signing-secret",
    pattern: /SIGNING[_-]?SECRET/i,
    suggestedAccess: AccessLevel.HIDDEN,
    description: "Signing secret",
    format: "key",
  },

  // Placeholder (API keys and secrets AI should know exist)
  {
    name: "api-key",
    pattern: /API[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "API key",
    format: "key",
    example: "sk-...",
  },
  {
    name: "secret-key",
    pattern: /SECRET[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Secret key",
    format: "key",
  },
  {
    name: "access-key",
    pattern: /ACCESS[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Access key",
    format: "key",
    example: "AKIA...",
  },
  {
    name: "auth-token",
    pattern: /AUTH[_-]?TOKEN/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Authentication token",
    format: "token",
  },
  {
    name: "bearer-token",
    pattern: /BEARER[_-]?TOKEN/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Bearer token",
    format: "token",
  },
  {
    name: "jwt-secret",
    pattern: /JWT[_-]?SECRET/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "JWT signing secret",
    format: "key",
  },
  {
    name: "password",
    pattern: /PASSWORD/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Password credential",
    format: "password",
  },
  {
    name: "credential",
    pattern: /CREDENTIAL/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Credential",
    format: "key",
  },
  {
    name: "secret",
    pattern: /SECRET/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Secret value",
    format: "key",
  },
  {
    name: "token",
    pattern: /TOKEN$/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Token",
    format: "token",
  },

  // Placeholder (connection strings often contain passwords)
  {
    name: "database-url",
    pattern: /DATABASE[_-]?URL/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Database connection URL (may contain password)",
    format: "url",
    example: "postgres://user:pass@localhost:5432/dbname",
  },
  {
    name: "redis-url",
    pattern: /REDIS[_-]?URL/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Redis connection URL (may contain password)",
    format: "url",
    example: "redis://user:pass@localhost:6379/0",
  },
  {
    name: "mongodb-uri",
    pattern: /MONGO(DB)?[_-]?URI/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "MongoDB connection URI (may contain password)",
    format: "url",
    example: "mongodb://user:pass@localhost:27017/dbname",
  },
  {
    name: "connection-string",
    pattern: /CONNECTION[_-]?STRING/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Connection string (may contain password)",
    format: "url",
  },

  // Read-only (URLs and endpoints without credentials)
  {
    name: "url-suffix",
    pattern: /_URL$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "URL endpoint",
    format: "url",
    example: "https://api.example.com",
  },
  {
    name: "uri-suffix",
    pattern: /_URI$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "URI endpoint",
    format: "url",
  },
  {
    name: "host",
    pattern: /_HOST$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "Host address",
    format: "hostname",
    example: "localhost",
  },

  // Full access (non-sensitive configuration)
  {
    name: "node-env",
    pattern: /^NODE_ENV$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Node.js environment mode",
    format: "enum",
    example: "development | production | test",
  },
  {
    name: "env-suffix",
    pattern: /_ENV$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Environment setting",
    format: "string",
  },
  {
    name: "debug",
    pattern: /DEBUG/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Debug flag",
    format: "boolean",
    example: "true | false",
  },
  {
    name: "log-level",
    pattern: /LOG[_-]?LEVEL/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Logging level",
    format: "enum",
    example: "debug | info | warn | error",
  },
  {
    name: "port",
    pattern: /^PORT$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Server port",
    format: "number",
    example: "3000",
  },
  {
    name: "port-suffix",
    pattern: /_PORT$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Port number",
    format: "number",
    example: "5432",
  },
  {
    name: "timeout",
    pattern: /TIMEOUT/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Timeout setting",
    format: "number",
    example: "30000",
  },
  {
    name: "max-size",
    pattern: /MAX[_-]?(SIZE|LENGTH|COUNT)/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Size/count limit",
    format: "number",
    example: "100",
  },
  {
    name: "enable-disable",
    pattern: /(ENABLE|DISABLE)[_-]/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Feature flag",
    format: "boolean",
    example: "true | false",
  },
  {
    name: "feature-flag",
    pattern: /FEATURE[_-]/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Feature flag",
    format: "boolean",
    example: "true | false",
  },
  {
    name: "region",
    pattern: /_REGION$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Cloud region",
    format: "string",
    example: "us-east-1",
  },
  {
    name: "version",
    pattern: /_VERSION$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Version number",
    format: "string",
    example: "1.0.0",
  },
];

/**
 * Classify a variable name using pattern matching
 * Returns suggested config or undefined if no pattern matches
 */
export function classifyVariable(name: string): VariableConfig | undefined {
  for (const pattern of CLASSIFICATION_PATTERNS) {
    if (pattern.pattern.test(name)) {
      return {
        access: pattern.suggestedAccess,
        description: pattern.description,
        format: pattern.format,
        example: pattern.example,
      };
    }
  }
  return undefined;
}

/**
 * Get the default config for unclassified variables
 */
export function getDefaultConfig(): VariableConfig {
  return {
    access: AccessLevel.PLACEHOLDER,
    description: "Unclassified variable - defaulting to placeholder for safety",
  };
}

/**
 * Classify multiple variables at once
 */
export function classifyVariables(
  names: string[]
): Record<string, VariableConfig> {
  const result: Record<string, VariableConfig> = {};

  for (const name of names) {
    result[name] = classifyVariable(name) ?? getDefaultConfig();
  }

  return result;
}
