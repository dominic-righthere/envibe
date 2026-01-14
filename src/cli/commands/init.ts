import { Command } from "commander";
import {
  createEmptyManifest,
  saveManifest,
  getManifestFilename,
  type Manifest,
} from "../../core";
import { classifyVariables } from "../../core/patterns";
import { loadEnvFile, getEnvFilename } from "../../utils/dotenv";
import { createFile } from "../../utils/file";

export const initCommand = new Command("init")
  .description("Initialize .env.manifest.yaml from existing .env file")
  .option("-f, --force", "Overwrite existing manifest")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (options) => {
    const manifestPath = getManifestFilename();
    const manifestFile = createFile(manifestPath);

    // Check if manifest already exists
    if ((await manifestFile.exists()) && !options.force) {
      console.error(
        `Error: ${manifestPath} already exists. Use --force to overwrite.`
      );
      process.exit(1);
    }

    // Load .env file
    const envPath = options.env;
    const { variables } = await loadEnvFile(envPath);
    const varNames = Object.keys(variables);

    if (varNames.length === 0) {
      console.log(`No variables found in ${envPath}`);
      console.log("Creating empty manifest...");
      await saveManifest(createEmptyManifest());
      console.log(`Created ${manifestPath}`);
      return;
    }

    console.log(`Found ${varNames.length} variables in ${envPath}`);
    console.log("Auto-classifying based on common patterns...\n");

    // Classify variables
    const classified = classifyVariables(varNames);

    // Create manifest
    const manifest: Manifest = {
      version: 1,
      variables: classified,
    };

    // Save manifest
    await saveManifest(manifest);

    // Print summary
    console.log("Classification summary:");
    console.log("------------------------");

    const byAccess: Record<string, string[]> = {};
    for (const [key, config] of Object.entries(classified)) {
      const access = config.access;
      if (!byAccess[access]) {
        byAccess[access] = [];
      }
      byAccess[access].push(key);
    }

    for (const [access, vars] of Object.entries(byAccess)) {
      console.log(`\n[${access}] (${vars.length} variables):`);
      for (const v of vars.slice(0, 5)) {
        console.log(`  - ${v}`);
      }
      if (vars.length > 5) {
        console.log(`  ... and ${vars.length - 5} more`);
      }
    }

    console.log(`\nCreated ${manifestPath}`);
    console.log("\nNext steps:");
    console.log(`  1. Review and adjust access levels in ${manifestPath}`);
    console.log("  2. Run: envibe generate");
    console.log("  3. Run: envibe setup (to configure Claude Code)");
  });
