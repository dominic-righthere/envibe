import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  loadManifest,
  filterForAI,
  getVariableForAI,
  validateModification,
  generateAIEnvContent,
  getManifestFilename,
  saveManifest,
  type Manifest,
  AccessLevel,
} from "../core";
import { classifyVariables } from "../core/patterns";
import {
  loadEnvFile,
  updateEnvVariable,
  getAIEnvFilename,
  envFileExists,
} from "../utils/dotenv";
import { configureClaudeSettings } from "../utils/claude-settings";
import { createFile, write } from "../utils/file";

// .env.example patterns to look for (in order of preference)
const EXAMPLE_FILES = [
  ".env.example",
  ".env.sample",
  ".env.template",
];

// Fallback manifest when no .env.example found
const FALLBACK_MANIFEST: Manifest = {
  version: 1,
  variables: {
    NODE_ENV: {
      access: AccessLevel.FULL,
      description: "Environment mode",
    },
    DEBUG: {
      access: AccessLevel.FULL,
      description: "Enable debug mode",
    },
    PORT: {
      access: AccessLevel.FULL,
      description: "Server port",
    },
    DATABASE_URL: {
      access: AccessLevel.READ_ONLY,
      description: "Database connection string",
    },
    API_KEY: {
      access: AccessLevel.PLACEHOLDER,
      description: "API key",
    },
  },
};

/**
 * Auto-setup: create manifest and .env.ai if they don't exist
 */
async function ensureSetup(): Promise<Manifest> {
  const manifestFile = createFile(getManifestFilename());

  if (await manifestFile.exists()) {
    return loadManifest();
  }

  // Look for .env.example files first
  let sourceFile: string | null = null;
  for (const exampleFile of EXAMPLE_FILES) {
    if (await envFileExists(exampleFile)) {
      sourceFile = exampleFile;
      break;
    }
  }

  let manifest: Manifest;

  if (sourceFile) {
    // Found an example file - use it
    const { variables } = await loadEnvFile(sourceFile);
    const varNames = Object.keys(variables);

    if (varNames.length > 0) {
      const classified = classifyVariables(varNames);
      manifest = { version: 1, variables: classified };
    } else {
      manifest = { ...FALLBACK_MANIFEST };
    }
  } else {
    // No example file - use fallback
    manifest = { ...FALLBACK_MANIFEST };
  }

  await saveManifest(manifest);

  // Generate .env.ai - try .env for values, fallback to example
  let env: Record<string, string> = {};
  if (await envFileExists(".env")) {
    const loaded = await loadEnvFile(".env");
    env = loaded.variables;
  } else if (sourceFile) {
    const loaded = await loadEnvFile(sourceFile);
    env = loaded.variables;
  }

  const filtered = filterForAI(env, manifest);
  const content = generateAIEnvContent(filtered);
  await write(getAIEnvFilename(), content);

  // Auto-configure Claude Code settings (silent mode - no console output)
  await configureClaudeSettings(true);

  return manifest;
}

/**
 * Start the MCP server
 */
export async function startMCPServer(): Promise<void> {
  const server = new Server(
    {
      name: "envibe",
      version: "0.2.7",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions: `envibe provides secure access to environment variables with granular permissions.

Use these tools when working with .env files or environment configuration:
- env_list: See all available variables and their access levels
- env_get: Read a specific variable's value (respects access permissions)
- env_set: Modify variables with 'full' access level
- env_blind_set: Set a variable without reading it (use when user provides value for hidden/placeholder vars)
- env_describe: Get metadata about a variable (format, required, etc.)
- env_check_required: Find missing required variables

Access levels: full (read/write), read-only, placeholder (name only), hidden (blocked).`,
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "env_list",
          description:
            "List all environment variables with their access levels. Returns variables that you are allowed to see.",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
        },
        {
          name: "env_get",
          description:
            "Get the value of a specific environment variable. Respects access permissions - hidden variables will return an error.",
          inputSchema: {
            type: "object" as const,
            properties: {
              key: {
                type: "string",
                description: "The environment variable name",
              },
            },
            required: ["key"],
          },
        },
        {
          name: "env_set",
          description:
            "Set an environment variable. Only works for variables with 'full' access level.",
          inputSchema: {
            type: "object" as const,
            properties: {
              key: {
                type: "string",
                description: "The environment variable name",
              },
              value: {
                type: "string",
                description: "The value to set",
              },
            },
            required: ["key", "value"],
          },
        },
        {
          name: "env_describe",
          description:
            "Get detailed information about a variable including its access level, description, format, and example.",
          inputSchema: {
            type: "object" as const,
            properties: {
              key: {
                type: "string",
                description: "The environment variable name",
              },
            },
            required: ["key"],
          },
        },
        {
          name: "env_check_required",
          description:
            "Check which required environment variables are missing. Use this to help users set up their environment.",
          inputSchema: {
            type: "object" as const,
            properties: {},
          },
        },
        {
          name: "env_blind_set",
          description:
            "Set an environment variable without reading its current value. Use this when the user provides a new value for a hidden or placeholder variable.",
          inputSchema: {
            type: "object" as const,
            properties: {
              key: {
                type: "string",
                description: "The environment variable name",
              },
              value: {
                type: "string",
                description: "The new value (provided by the user)",
              },
            },
            required: ["key", "value"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Auto-setup if needed
      const manifest = await ensureSetup();
      const { variables: env } = await loadEnvFile();

      switch (name) {
        case "env_list": {
          const filtered = filterForAI(env, manifest);
          const result = filtered.map((v) => ({
            key: v.key,
            value: v.displayValue,
            access: v.access,
            canModify: v.canModify,
            description: v.description,
          }));
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "env_get": {
          const key = (args as { key: string }).key;
          const config = manifest.variables[key];
          const variable = getVariableForAI(key, env, manifest);

          // Handle hidden variables with helpful message
          if (config && config.access === AccessLevel.HIDDEN) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "ACCESS_DENIED",
                    key,
                    access: "hidden",
                    message: "This variable is hidden from AI. Ask the user to configure it manually.",
                    hint: config.description,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          if (!variable) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "NOT_FOUND",
                    key,
                    message: `Variable "${key}" does not exist in the manifest.`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // For placeholder variables, return helpful context
          if (variable.access === AccessLevel.PLACEHOLDER) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    value: variable.displayValue,
                    access: "placeholder",
                    message: "You can reference this variable but cannot see the actual value.",
                    hint: config?.description,
                    format: config?.format,
                    example: config?.example,
                  }, null, 2),
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: variable.displayValue,
              },
            ],
          };
        }

        case "env_set": {
          const { key, value } = args as { key: string; value: string };

          const validation = validateModification(key, manifest);
          if (!validation.allowed) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: ${validation.reason}`,
                },
              ],
              isError: true,
            };
          }

          await updateEnvVariable(key, value);

          // Also update .env.ai
          const { variables: updatedEnv } = await loadEnvFile();
          const filtered = filterForAI(updatedEnv, manifest);
          const content = generateAIEnvContent(filtered);
          await write(getAIEnvFilename(), content);

          return {
            content: [
              {
                type: "text" as const,
                text: `Successfully set ${key}=${value}`,
              },
            ],
          };
        }

        case "env_describe": {
          const key = (args as { key: string }).key;
          const variable = getVariableForAI(key, env, manifest);
          const config = manifest.variables[key];

          // Even for hidden variables, provide helpful info
          if (config && config.access === AccessLevel.HIDDEN) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    key,
                    access: "hidden",
                    canModify: false,
                    description: config.description,
                    message: "This variable is hidden from AI. Ask the user to configure it.",
                    required: config.required ?? false,
                    format: config.format,
                    example: config.example,
                  }, null, 2),
                },
              ],
            };
          }

          if (!variable && !config) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "NOT_FOUND",
                    key,
                    message: `Variable "${key}" does not exist in the manifest.`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const info = {
            key: variable?.key ?? key,
            access: variable?.access ?? config?.access,
            canModify: variable?.canModify ?? false,
            description: variable?.description ?? config?.description,
            required: config?.required ?? false,
            hasDefault: config?.default !== undefined,
            isSet: env[key] !== undefined,
            format: config?.format,
            example: config?.example,
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(info, null, 2),
              },
            ],
          };
        }

        case "env_check_required": {
          const missing: Array<{ key: string; description?: string; format?: string; example?: string }> = [];
          const set: Array<{ key: string; value: string }> = [];

          for (const [key, config] of Object.entries(manifest.variables)) {
            if (config.required) {
              if (env[key] === undefined || env[key] === "") {
                missing.push({
                  key,
                  description: config.description,
                  format: config.format,
                  example: config.example,
                });
              } else {
                // Only show value for non-sensitive vars
                const variable = getVariableForAI(key, env, manifest);
                if (variable && (variable.access === AccessLevel.FULL || variable.access === AccessLevel.READ_ONLY)) {
                  set.push({ key, value: variable.displayValue });
                } else {
                  set.push({ key, value: "<set>" });
                }
              }
            }
          }

          const result = {
            missing,
            set,
            message: missing.length > 0
              ? `${missing.length} required variable(s) are not set. Ask the user to configure them.`
              : "All required variables are set.",
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case "env_blind_set": {
          const { key, value } = args as { key: string; value: string };
          const config = manifest.variables[key];

          // Must exist in manifest
          if (!config) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "NOT_IN_MANIFEST",
                    key,
                    message: `Variable "${key}" is not defined in the manifest. Add it first.`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Only allow blind_set for writable access levels
          const writableViaBlindSet = [AccessLevel.FULL, AccessLevel.PLACEHOLDER, AccessLevel.HIDDEN];
          if (!writableViaBlindSet.includes(config.access)) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "ACCESS_DENIED",
                    key,
                    access: config.access,
                    message: `Variable "${key}" has access level "${config.access}" and cannot be modified.`,
                  }, null, 2),
                },
              ],
              isError: true,
            };
          }

          // Update .env file
          await updateEnvVariable(key, value);

          // Sync .env.ai (value will be filtered per access level)
          const { variables: updatedEnv } = await loadEnvFile();
          const filtered = filterForAI(updatedEnv, manifest);
          const content = generateAIEnvContent(filtered);
          await write(getAIEnvFilename(), content);

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  success: true,
                  key,
                  message: `Successfully set ${key}. Value is not shown due to access level.`,
                  access: config.access,
                }, null, 2),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text" as const,
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "env://manifest",
          name: "Environment Manifest",
          description: "The access control rules for environment variables",
          mimeType: "text/yaml",
        },
        {
          uri: "env://variables",
          name: "AI-Safe Environment Variables",
          description: "Environment variables filtered for AI access",
          mimeType: "text/plain",
        },
      ],
    };
  });

  // Read resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      switch (uri) {
        case "env://manifest": {
          // Auto-setup if needed
          await ensureSetup();
          const manifestFile = createFile(getManifestFilename());
          const content = await manifestFile.text();
          return {
            contents: [
              {
                uri,
                mimeType: "text/yaml",
                text: content,
              },
            ],
          };
        }

        case "env://variables": {
          const manifest = await ensureSetup();
          const { variables: env } = await loadEnvFile();
          const filtered = filterForAI(env, manifest);
          const content = generateAIEnvContent(filtered);
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: content,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }
    } catch (error) {
      throw error;
    }
  });

  // Auto-setup on server start (creates manifest, .env.ai, and configures Claude settings)
  await ensureSetup();

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
