import { Command } from "commander";
import { loadManifest, filterForAI, generateAIEnvContent } from "../../core";
import { loadEnvFile, getAIEnvFilename } from "../../utils/dotenv";

export const generateCommand = new Command("generate")
  .description("Generate AI-safe .env.ai file")
  .option("-o, --output <path>", "Output file path", getAIEnvFilename())
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--stdout", "Output to stdout instead of file")
  .action(async (options) => {
    try {
      const manifest = await loadManifest();
      const { variables: env } = await loadEnvFile(options.env);
      const filtered = filterForAI(env, manifest);
      const content = generateAIEnvContent(filtered);

      if (options.stdout) {
        console.log(content);
        return;
      }

      await Bun.write(options.output, content);
      console.log(`Generated ${options.output} with ${filtered.length} variables`);

      const counts: Record<string, number> = {};
      for (const v of filtered) {
        counts[v.access] = (counts[v.access] ?? 0) + 1;
      }

      console.log("\nAccess level summary:");
      for (const [access, count] of Object.entries(counts)) {
        console.log(`  ${access}: ${count}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error("Error: No manifest found. Run 'aienv init' first.");
        process.exit(1);
      }
      throw error;
    }
  });
