import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import pkg from "../../package.json";
import { readResource, RESOURCE_DEFINITIONS } from "./resources";
import { ensureSetup } from "./setup";
import { callTool, TOOL_DEFINITIONS } from "./tools";

const INSTRUCTIONS = `envibe provides secure access to environment variables with granular permissions.

Use env_list, env_get, env_set, env_blind_set, env_describe, env_check_required,
and env_check_gitignore instead of reading or writing secret-bearing .env files
directly. Access levels are full, read-only, placeholder, schema-only, and hidden.`;

export function createMCPServer(): Server {
  const server = new Server(
    { name: "envibe", version: pkg.version },
    { capabilities: { tools: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...TOOL_DEFINITIONS],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(request.params.name, request.params.arguments),
  );
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [...RESOURCE_DEFINITIONS],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
    readResource(request.params.uri),
  );

  return server;
}

export async function startMCPServer(): Promise<void> {
  await ensureSetup();
  await createMCPServer().connect(new StdioServerTransport());
}
