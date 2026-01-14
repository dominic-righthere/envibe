import { Command } from "commander";
import * as readline from "readline";
import {
  createEmptyManifest,
  saveManifest,
  loadManifest,
  getManifestFilename,
  filterForAI,
  generateAIEnvContent,
  type Manifest,
  type VariableConfig,
  AccessLevel,
} from "../../core";
import { classifyVariables } from "../../core/patterns";
import { loadEnvFile, getAIEnvFilename, envFileExists } from "../../utils/dotenv";
import { configureClaudeSettings } from "../../utils/claude-settings";
import { createFile, write } from "../../utils/file";

const CLAUDE_SETTINGS_FILE = ".claude/settings.json";
const GITIGNORE_FILE = ".gitignore";

// .env.example patterns to look for (in order of preference)
const EXAMPLE_FILES = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.local.example",
  ".env.development.example",
];

// Patterns to add to .gitignore
const GITIGNORE_PATTERNS = [
  "# envibe - environment files with secrets",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.staging",
  ".env.*.local",
  ".env.secrets",
  ".env.keys",
  "",
  "# envibe - generated AI-safe view (regenerated)",
  ".env.ai",
];


// Fallback manifest when no .env.example found
const FALLBACK_MANIFEST: Manifest = {
  version: 1,
  variables: {
    NODE_ENV: {
      access: AccessLevel.FULL,
      description: "Environment mode (development, staging, production)",
    },
    DEBUG: {
      access: AccessLevel.FULL,
      description: "Enable debug mode",
    },
    PORT: {
      access: AccessLevel.FULL,
      description: "Server port",
    },
    DATABASE_URL: {
      access: AccessLevel.READ_ONLY,
      description: "Database connection string",
    },
    API_KEY: {
      access: AccessLevel.PLACEHOLDER,
      description: "API key (add your actual key names)",
    },
    SECRET_KEY: {
      access: AccessLevel.HIDDEN,
      description: "Secret key (add your actual secret names)",
    },
  },
};

// Access level options for interactive mode
const ACCESS_LEVELS = [
  { key: "f", level: AccessLevel.FULL, label: "full", desc: "AI can see and modify" },
  { key: "r", level: AccessLevel.READ_ONLY, label: "read-only", desc: "AI can see but not modify" },
  { key: "p", level: AccessLevel.PLACEHOLDER, label: "placeholder", desc: "AI sees <VAR_NAME>" },
  { key: "s", level: AccessLevel.SCHEMA_ONLY, label: "schema-only", desc: "AI sees format only" },
  { key: "h", level: AccessLevel.HIDDEN, label: "hidden", desc: "Completely hidden from AI" },
];

/**
 * Prompt user for a single line of input
 */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive prompt to set access level for a variable
 */
async function promptAccessLevel(
  varName: string,
  suggestedLevel: AccessLevel
): Promise<AccessLevel> {
  const suggestedOption = ACCESS_LEVELS.find((o) => o.level === suggestedLevel);

  console.log(`\n  ${varName}`);
  console.log(`  Suggested: ${suggestedOption?.label} (${suggestedOption?.desc})`);
  console.log(`  Options: [f]ull, [r]ead-only, [p]laceholder, [s]chema-only, [h]idden, [Enter]=accept`);

  const answer = await prompt("  Choice: ");

  if (answer === "") {
    return suggestedLevel;
  }

  const selected = ACCESS_LEVELS.find((o) => o.key === answer.toLowerCase());
  if (selected) {
    return selected.level;
  }

  console.log("  Invalid choice, using suggested level");
  return suggestedLevel;
}

/**
 * Interactively classify variables with user input
 */
async function classifyVariablesInteractive(
  varNames: string[]
): Promise<Record<string, VariableConfig>> {
  // First get auto-classified suggestions
  const autoClassified = classifyVariables(varNames);
  const result: Record<string, VariableConfig> = {};

  console.log("\n  Configure access levels for each variable:");
  console.log("  (Press Enter to accept suggested level, or choose a different one)");

  for (const varName of varNames) {
    const suggestedConfig = autoClassified[varName];
    const accessLevel = await promptAccessLevel(varName, suggestedConfig.access);

    result[varName] = {
      access: accessLevel,
      description: suggestedConfig.description,
    };
  }

  return result;
}

export const setupCommand = new Command("setup")
  .description("Full setup: init manifest, generate .env.ai, configure Claude Code")
  .option("-i, --interactive", "Interactively configure access levels for each variable")
  .option("--skip-claude", "Skip Claude Code settings configuration")
  .option("--skip-gitignore", "Skip .gitignore configuration")
  .action(async (options) => {
    console.log("Setting up envibe...\n");

    // Step 1: Init manifest if needed
    const manifestPath = getManifestFilename();
    const manifestFile = createFile(manifestPath);
    let manifest: Manifest;
    let sourceFile: string | null = null;

    if (await manifestFile.exists()) {
      console.log(`[1/4] Found existing ${manifestPath}`);
      manifest = await loadManifest();
    } else {
      console.log(`[1/4] Creating ${manifestPath}...`);

      // Look for .env.example files first
      for (const exampleFile of EXAMPLE_FILES) {
        if (await envFileExists(exampleFile)) {
          sourceFile = exampleFile;
          break;
        }
      }

      if (sourceFile) {
        // Found an example file - use it
        const { variables } = await loadEnvFile(sourceFile);
        const varNames = Object.keys(variables);

        if (varNames.length > 0) {
          // Use interactive or auto classification
          const classified = options.interactive
            ? await classifyVariablesInteractive(varNames)
            : classifyVariables(varNames);
          manifest = { version: 1, variables: classified };
          await saveManifest(manifest);
          console.log(`\n     Classified ${varNames.length} variables from ${sourceFile}`);
        } else {
          manifest = { ...FALLBACK_MANIFEST };
          await saveManifest(manifest);
          console.log(`     Created fallback manifest (${sourceFile} was empty)`);
        }
      } else {
        // No example file found - use fallback
        manifest = { ...FALLBACK_MANIFEST };
        await saveManifest(manifest);
        console.log("     Created fallback manifest (no .env.example found)");
        console.log("     Edit .env.manifest.yaml to match your actual variables");
      }
    }

    // Step 2: Generate .env.ai
    console.log(`[2/4] Generating ${getAIEnvFilename()}...`);
    // Try to read from actual .env for values, fall back to example or empty
    let env: Record<string, string> = {};
    if (await envFileExists(".env")) {
      const loaded = await loadEnvFile(".env");
      env = loaded.variables;
    } else if (sourceFile) {
      const loaded = await loadEnvFile(sourceFile);
      env = loaded.variables;
    }
    const filtered = filterForAI(env, manifest);
    const content = generateAIEnvContent(filtered);
    await write(getAIEnvFilename(), content);
    console.log(`     Generated with ${filtered.length} AI-visible variables`);

    // Step 3: Configure .gitignore
    if (options.skipGitignore) {
      console.log("[3/4] Skipped .gitignore configuration");
    } else {
      console.log(`[3/4] Configuring ${GITIGNORE_FILE}...`);
      await configureGitignore();
    }

    // Step 4: Configure Claude Code
    if (options.skipClaude) {
      console.log("[4/4] Skipped Claude Code configuration");
    } else {
      console.log(`[4/4] Configuring ${CLAUDE_SETTINGS_FILE}...`);
      await configureClaudeSettings();
    }

    console.log("\nSetup complete! Next steps:");
    console.log("  1. Review .env.manifest.yaml and adjust access levels");
    console.log("  2. Create .env with your actual secrets (it's gitignored)");
    console.log("  3. Run 'envibe generate' to update .env.ai");
    console.log("  4. AI will read .env.ai and use MCP tools (secrets protected)");
  });

async function configureGitignore(): Promise<void> {
  const gitignoreFile = createFile(GITIGNORE_FILE);
  let content = "";

  if (await gitignoreFile.exists()) {
    content = await gitignoreFile.text();
  }

  // Check which patterns need to be added
  const linesToAdd: string[] = [];
  for (const pattern of GITIGNORE_PATTERNS) {
    // Skip empty lines and comments for duplicate checking
    if (pattern === "" || pattern.startsWith("#")) {
      linesToAdd.push(pattern);
      continue;
    }
    // Check if pattern already exists
    if (!content.includes(pattern)) {
      linesToAdd.push(pattern);
    }
  }

  // Filter out consecutive empty lines and leading comments if nothing new
  const newPatterns = linesToAdd.filter(
    (line) => !line.startsWith("#") && line !== ""
  );

  if (newPatterns.length === 0) {
    console.log("     Already configured");
    return;
  }

  // Add to gitignore
  const addition = "\n" + linesToAdd.join("\n") + "\n";
  const newContent = content.trimEnd() + addition;
  await write(GITIGNORE_FILE, newContent);
  console.log(`     Added ${newPatterns.length} patterns`);
}

