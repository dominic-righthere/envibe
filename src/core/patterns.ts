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
  },
  {
    name: "private-key",
    pattern: /PRIVATE[_-]?KEY/i,
    suggestedAccess: AccessLevel.HIDDEN,
    description: "Private key material",
  },
  {
    name: "signing-secret",
    pattern: /SIGNING[_-]?SECRET/i,
    suggestedAccess: AccessLevel.HIDDEN,
    description: "Signing secret",
  },

  // Placeholder (API keys and secrets AI should know exist)
  {
    name: "api-key",
    pattern: /API[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "API key",
  },
  {
    name: "secret-key",
    pattern: /SECRET[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Secret key",
  },
  {
    name: "access-key",
    pattern: /ACCESS[_-]?KEY/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Access key",
  },
  {
    name: "auth-token",
    pattern: /AUTH[_-]?TOKEN/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Authentication token",
  },
  {
    name: "bearer-token",
    pattern: /BEARER[_-]?TOKEN/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Bearer token",
  },
  {
    name: "jwt-secret",
    pattern: /JWT[_-]?SECRET/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "JWT signing secret",
  },
  {
    name: "password",
    pattern: /PASSWORD/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Password credential",
  },
  {
    name: "credential",
    pattern: /CREDENTIAL/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Credential",
  },
  {
    name: "secret",
    pattern: /SECRET/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Secret value",
  },
  {
    name: "token",
    pattern: /TOKEN$/i,
    suggestedAccess: AccessLevel.PLACEHOLDER,
    description: "Token",
  },

  // Read-only (URLs and connection strings AI might need to understand)
  {
    name: "database-url",
    pattern: /DATABASE[_-]?URL/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "Database connection URL",
  },
  {
    name: "redis-url",
    pattern: /REDIS[_-]?URL/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "Redis connection URL",
  },
  {
    name: "mongodb-uri",
    pattern: /MONGO(DB)?[_-]?URI/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "MongoDB connection URI",
  },
  {
    name: "connection-string",
    pattern: /CONNECTION[_-]?STRING/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "Connection string",
  },
  {
    name: "url-suffix",
    pattern: /_URL$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "URL endpoint",
  },
  {
    name: "uri-suffix",
    pattern: /_URI$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "URI endpoint",
  },
  {
    name: "host",
    pattern: /_HOST$/i,
    suggestedAccess: AccessLevel.READ_ONLY,
    description: "Host address",
  },

  // Full access (non-sensitive configuration)
  {
    name: "node-env",
    pattern: /^NODE_ENV$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Node.js environment mode",
  },
  {
    name: "env-suffix",
    pattern: /_ENV$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Environment setting",
  },
  {
    name: "debug",
    pattern: /DEBUG/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Debug flag",
  },
  {
    name: "log-level",
    pattern: /LOG[_-]?LEVEL/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Logging level",
  },
  {
    name: "port",
    pattern: /^PORT$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Server port",
  },
  {
    name: "port-suffix",
    pattern: /_PORT$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Port number",
  },
  {
    name: "timeout",
    pattern: /TIMEOUT/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Timeout setting",
  },
  {
    name: "max-size",
    pattern: /MAX[_-]?(SIZE|LENGTH|COUNT)/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Size/count limit",
  },
  {
    name: "enable-disable",
    pattern: /(ENABLE|DISABLE)[_-]/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Feature flag",
  },
  {
    name: "feature-flag",
    pattern: /FEATURE[_-]/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Feature flag",
  },
  {
    name: "region",
    pattern: /_REGION$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Cloud region",
  },
  {
    name: "version",
    pattern: /_VERSION$/i,
    suggestedAccess: AccessLevel.FULL,
    description: "Version number",
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
