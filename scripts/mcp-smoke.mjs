import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const fixtureDir = await mkdtemp(join(tmpdir(), "envibe-mcp-smoke-"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve("dist/mcp/bin.js")],
  cwd: fixtureDir,
  stderr: "pipe",
});
const client = new Client(
  { name: "envibe-node-smoke", version: "0.3.0" },
  { capabilities: {} },
);

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === "env_check_gitignore")) {
    throw new Error("Built MCP server did not expose env_check_gitignore");
  }
} finally {
  await client.close();
  await rm(fixtureDir, { recursive: true, force: true });
}
