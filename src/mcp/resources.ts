import {
  filterForAI,
  generateAIEnvContent,
  getManifestFilename,
} from "../core";
import { loadEnvFile } from "../utils/dotenv";
import { createFile } from "../utils/file";
import { ensureSetup } from "./setup";

export const RESOURCE_DEFINITIONS = [
  {
    uri: "env://manifest",
    name: "Environment Manifest",
    description: "The access-control rules for environment variables",
    mimeType: "text/yaml",
  },
  {
    uri: "env://variables",
    name: "AI-Safe Environment Variables",
    description: "Environment variables filtered for AI access",
    mimeType: "text/plain",
  },
] as const;

export async function readResource(uri: string) {
  if (uri === "env://manifest") {
    await ensureSetup();
    const content = await createFile(getManifestFilename()).text();
    return {
      contents: [{ uri, mimeType: "text/yaml", text: content }],
    };
  }

  if (uri === "env://variables") {
    const manifest = await ensureSetup();
    const { variables } = await loadEnvFile();
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: generateAIEnvContent(filterForAI(variables, manifest)),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
}
