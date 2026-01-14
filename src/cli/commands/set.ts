import { Command } from "commander";
import { loadManifest, validateModification, filterForAI, generateAIEnvContent } from "../../core";
import { updateEnvVariable, loadEnvFile, getAIEnvFilename } from "../../utils/dotenv";
import { write } from "../../utils/file";

export const setCommand = new Command("set")
  .description("Set an environment variable (respects access permissions)")
  .argument("<key=value>", "Variable to set in KEY=VALUE format")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--force", "Bypass access control (not recommended)")
  .option("--update-ai", "Also update .env.ai file")
  .action(async (keyValue: string, options) => {
    // Parse KEY=VALUE
    const equalIndex = keyValue.indexOf("=");
    if (equalIndex === -1) {
      console.error("Error: Invalid format. Use KEY=VALUE");
      process.exit(1);
    }

    const key = keyValue.slice(0, equalIndex);
    const value = keyValue.slice(equalIndex + 1);

    if (!key) {
      console.error("Error: Key cannot be empty");
      process.exit(1);
    }

    try {
      const manifest = await loadManifest();

      // Validate access permission
      if (!options.force) {
        const validation = validateModification(key, manifest);
        if (!validation.allowed) {
          console.error(`Error: ${validation.reason}`);
          console.error("\nTo bypass access control, use --force (not recommended)");
          process.exit(1);
        }
      }

      // Update the .env file
      await updateEnvVariable(key, value, options.env);
      console.log(`Set ${key}=${value}`);

      // Optionally update .env.ai
      if (options.updateAi) {
        const { variables: env } = await loadEnvFile(options.env);
        const filtered = filterForAI(env, manifest);
        const content = generateAIEnvContent(filtered);
        await write(getAIEnvFilename(), content);
        console.log(`Updated ${getAIEnvFilename()}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error("Error: No manifest found. Run 'envibe init' first.");
        process.exit(1);
      }
      throw error;
    }
  });
