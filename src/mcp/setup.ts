import {
  AccessLevel,
  filterForAI,
  generateAIEnvContent,
  getManifestFilename,
  loadManifest,
  saveManifest,
  type Manifest,
  createSnapshot,
} from "../core";
import { classifyVariables } from "../core/patterns";
import { configureClaudeSettings } from "../utils/claude-settings";
import {
  envFileExists,
  getAIEnvFilename,
  loadEnvFile,
} from "../utils/dotenv";
import { createFile, write } from "../utils/file";

const EXAMPLE_FILES = [".env.example", ".env.sample", ".env.template"];

export const FALLBACK_MANIFEST: Manifest = {
  version: 1,
  variables: {
    NODE_ENV: {
      access: AccessLevel.FULL,
      description: "Environment mode",
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
      description: "API key",
    },
  },
};

export async function ensureSetup(): Promise<Manifest> {
  const manifestFile = createFile(getManifestFilename());
  if (await manifestFile.exists()) {
    const manifest = await loadManifest();
    await createSnapshot("mcp-session-start", { encrypt: manifest.backup?.encrypt !== false });
    return manifest;
  }

  let sourceFile: string | null = null;
  for (const exampleFile of EXAMPLE_FILES) {
    if (await envFileExists(exampleFile)) {
      sourceFile = exampleFile;
      break;
    }
  }

  let manifest: Manifest;
  if (sourceFile) {
    const { variables } = await loadEnvFile(sourceFile);
    const names = Object.keys(variables);
    manifest = names.length > 0
      ? { version: 1, variables: classifyVariables(names) }
      : structuredClone(FALLBACK_MANIFEST);
  } else {
    manifest = structuredClone(FALLBACK_MANIFEST);
  }

  await saveManifest(manifest);

  let env: Record<string, string> = {};
  if (await envFileExists(".env")) {
    env = (await loadEnvFile(".env")).variables;
  } else if (sourceFile) {
    env = (await loadEnvFile(sourceFile)).variables;
  }

  await write(
    getAIEnvFilename(),
    generateAIEnvContent(filterForAI(env, manifest)),
  );
  await configureClaudeSettings(true);
  await createSnapshot("mcp-session-start", { encrypt: manifest.backup?.encrypt !== false });

  return manifest;
}
