import { Command } from "commander";
import { loadManifest, filterForAI, AccessLevel } from "../../core";
import { loadEnvFile } from "../../utils/dotenv";

export const viewCommand = new Command("view")
  .description("Display environment variables with access levels")
  .option("--for-ai", "Show only what AI would see")
  .option("--json", "Output as JSON")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (options) => {
    try {
      const manifest = await loadManifest();
      const { variables: env } = await loadEnvFile(options.env);
      const filtered = filterForAI(env, manifest);

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (options.forAi) {
        console.log("AI-visible environment variables:");
        console.log("==================================\n");

        for (const v of filtered) {
          const modifiable = v.canModify ? "[writable]" : "[read-only]";
          console.log(`${v.key}=${v.displayValue}`);
          console.log(`  Access: ${v.access} ${modifiable}`);
          if (v.description) {
            console.log(`  Description: ${v.description}`);
          }
          console.log();
        }
      } else {
        // Show all variables with their actual access levels
        console.log("All environment variables:");
        console.log("==========================\n");

        // Get all unique keys
        const allKeys = new Set([
          ...Object.keys(env),
          ...Object.keys(manifest.variables),
        ]);

        for (const key of Array.from(allKeys).sort()) {
          const config = manifest.variables[key];
          const value = env[key];
          const access = config?.access ?? "unclassified";
          const isSet = value !== undefined;

          let displayValue: string;
          if (access === AccessLevel.HIDDEN) {
            displayValue = "***HIDDEN***";
          } else if (!isSet) {
            displayValue = "(not set)";
          } else {
            displayValue = value;
          }

          console.log(`${key}=${displayValue}`);
          console.log(`  Access: ${access}`);
          if (config?.description) {
            console.log(`  Description: ${config.description}`);
          }
          if (config?.required && !isSet) {
            console.log(`  WARNING: Required but not set`);
          }
          console.log();
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error("Error: No manifest found. Run 'aienv init' first.");
        process.exit(1);
      }
      throw error;
    }
  });
