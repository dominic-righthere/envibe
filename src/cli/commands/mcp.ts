import { Command } from "commander";
import { startMCPServer } from "../../mcp/server";

export const mcpCommand = new Command("mcp")
  .description("Start the MCP server for AI integration")
  .action(async () => {
    await startMCPServer();
  });
