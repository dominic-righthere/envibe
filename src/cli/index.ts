#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { generateCommand } from "./commands/generate";
import { viewCommand } from "./commands/view";
import { setCommand } from "./commands/set";
import { validateCommand } from "./commands/validate";
import { setupCommand } from "./commands/setup";
import { mcpCommand } from "./commands/mcp";
import { backupCommand } from "./commands/backup";
import { restoreCommand } from "./commands/restore";
import pkg from "../../package.json";

const program = new Command();

program
  .name("envibe")
  .description("The missing permission layer between AI agents and your .env")
  .version(pkg.version);

program.addCommand(setupCommand);
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(viewCommand);
program.addCommand(setCommand);
program.addCommand(validateCommand);
program.addCommand(mcpCommand);
program.addCommand(backupCommand);
program.addCommand(restoreCommand);

if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse();
}
