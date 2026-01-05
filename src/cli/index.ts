#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { generateCommand } from "./commands/generate";
import { viewCommand } from "./commands/view";
import { setCommand } from "./commands/set";
import { validateCommand } from "./commands/validate";
import { setupCommand } from "./commands/setup";
import { mcpCommand } from "./commands/mcp";

const program = new Command();

program
  .name("aienv")
  .description("Granular AI access control for environment variables")
  .version("0.1.0");

program.addCommand(setupCommand);
program.addCommand(initCommand);
program.addCommand(generateCommand);
program.addCommand(viewCommand);
program.addCommand(setCommand);
program.addCommand(validateCommand);
program.addCommand(mcpCommand);

program.parse();
