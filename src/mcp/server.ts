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
  const manifestFile = Bun.file(getManifestFilename());

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
  await Bun.write(getAIEnvFilename(), content);

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
      name: "aienv",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
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
            "Get detailed information about a variable including its access level and description.",
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
          const variable = getVariableForAI(key, env, manifest);

          if (!variable) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Variable "${key}" is hidden or does not exist`,
                },
              ],
              isError: true,
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
          await Bun.write(getAIEnvFilename(), content);

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

          if (!variable) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Variable "${key}" is hidden or does not exist`,
                },
              ],
              isError: true,
            };
          }

          const info = {
            key: variable.key,
            access: variable.access,
            canModify: variable.canModify,
            description: variable.description,
            required: config?.required ?? false,
            hasDefault: config?.default !== undefined,
            isSet: env[key] !== undefined,
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
          const manifestFile = Bun.file(getManifestFilename());
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
