import { Command } from "commander";
import { loadManifest, AccessLevel } from "../../core";
import { loadEnvFile } from "../../utils/dotenv";

interface ValidationIssue {
  type: "error" | "warning";
  message: string;
}

export const validateCommand = new Command("validate")
  .description("Validate manifest against .env file")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .option("--strict", "Treat warnings as errors")
  .action(async (options) => {
    const issues: ValidationIssue[] = [];

    try {
      const manifest = await loadManifest();
      const { variables: env } = await loadEnvFile(options.env);

      // Check for required variables that are not set
      for (const [key, config] of Object.entries(manifest.variables)) {
        if (config.required && env[key] === undefined) {
          issues.push({
            type: "error",
            message: `Required variable "${key}" is not set in ${options.env}`,
          });
        }
      }

      // Check for .env variables not in manifest
      for (const key of Object.keys(env)) {
        if (!manifest.variables[key]) {
          issues.push({
            type: "warning",
            message: `Variable "${key}" in ${options.env} is not defined in manifest (will default to placeholder access)`,
          });
        }
      }

      // Check for manifest variables not in .env (non-required)
      for (const [key, config] of Object.entries(manifest.variables)) {
        if (!config.required && env[key] === undefined && !config.default) {
          issues.push({
            type: "warning",
            message: `Variable "${key}" is defined in manifest but not set in ${options.env}`,
          });
        }
      }

      // Check for potential security issues
      for (const [key, config] of Object.entries(manifest.variables)) {
        if (config.access === AccessLevel.FULL) {
          // Check if it looks like a secret
          const looksLikeSecret =
            /SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL/i.test(key);
          if (looksLikeSecret) {
            issues.push({
              type: "warning",
              message: `Variable "${key}" has full access but looks like a secret. Consider using placeholder or hidden access.`,
            });
          }
        }
      }

      // Print results
      const errors = issues.filter((i) => i.type === "error");
      const warnings = issues.filter((i) => i.type === "warning");

      if (errors.length > 0) {
        console.log("\nErrors:");
        for (const issue of errors) {
          console.log(`  [ERROR] ${issue.message}`);
        }
      }

      if (warnings.length > 0) {
        console.log("\nWarnings:");
        for (const issue of warnings) {
          console.log(`  [WARN] ${issue.message}`);
        }
      }

      if (issues.length === 0) {
        console.log("Validation passed. No issues found.");
        return;
      }

      console.log(`\nSummary: ${errors.length} errors, ${warnings.length} warnings`);

      // Exit with error code if there are errors (or warnings in strict mode)
      if (errors.length > 0 || (options.strict && warnings.length > 0)) {
        process.exit(1);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        console.error("Error: No manifest found. Run 'envibe init' first.");
        process.exit(1);
      }
      throw error;
    }
  });
