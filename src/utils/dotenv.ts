import type { ParsedEnv } from "../core/types";

const ENV_FILENAME = ".env";
const ENV_AI_FILENAME = ".env.ai";

/**
 * Parse .env file content into key-value pairs
 * Handles comments, empty lines, and quoted values
 */
export function parseEnvContent(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Find the first = sign
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalIndex).trim();
    let value = trimmed.slice(equalIndex + 1).trim();

    // Handle inline comments (but not in quoted strings)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIndex = value.indexOf("#");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Handle escape sequences in double-quoted strings
    if (value.includes("\\")) {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\"/g, '"');
    }

    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Serialize environment variables to .env format
 */
export function serializeEnv(env: Record<string, string>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    // Quote values that contain special characters
    const needsQuotes =
      value.includes(" ") ||
      value.includes("#") ||
      value.includes("\n") ||
      value.includes('"') ||
      value.includes("'");

    if (needsQuotes) {
      // Escape special characters and wrap in double quotes
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Load and parse a .env file
 */
export async function loadEnvFile(
  path: string = ENV_FILENAME
): Promise<ParsedEnv> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return { variables: {}, raw: "" };
  }

  const raw = await file.text();
  const variables = parseEnvContent(raw);

  return { variables, raw };
}

/**
 * Save environment variables to a .env file
 */
export async function saveEnvFile(
  env: Record<string, string>,
  path: string = ENV_FILENAME
): Promise<void> {
  const content = serializeEnv(env);
  await Bun.write(path, content);
}

/**
 * Update a single variable in an existing .env file
 * Preserves comments and formatting where possible
 */
export async function updateEnvVariable(
  key: string,
  value: string,
  path: string = ENV_FILENAME
): Promise<void> {
  const file = Bun.file(path);
  let content = "";

  if (await file.exists()) {
    content = await file.text();
  }

  const lines = content.split("\n");
  let found = false;
  const keyPattern = new RegExp(`^${escapeRegex(key)}\\s*=`);

  for (let i = 0; i < lines.length; i++) {
    if (keyPattern.test(lines[i].trim())) {
      // Update existing line
      const needsQuotes =
        value.includes(" ") ||
        value.includes("#") ||
        value.includes("\n");
      lines[i] = needsQuotes ? `${key}="${value}"` : `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    // Add new variable at the end
    const needsQuotes =
      value.includes(" ") ||
      value.includes("#") ||
      value.includes("\n");
    const newLine = needsQuotes ? `${key}="${value}"` : `${key}=${value}`;

    // Ensure there's a newline before adding
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push(newLine);
    } else if (lines.length > 0) {
      lines[lines.length - 1] = newLine;
      lines.push("");
    } else {
      lines.push(newLine);
      lines.push("");
    }
  }

  await Bun.write(path, lines.join("\n"));
}

/**
 * Get the default .env filename
 */
export function getEnvFilename(): string {
  return ENV_FILENAME;
}

/**
 * Get the AI-safe .env filename
 */
export function getAIEnvFilename(): string {
  return ENV_AI_FILENAME;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if a .env file exists
 */
export async function envFileExists(path: string = ENV_FILENAME): Promise<boolean> {
  const file = Bun.file(path);
  return file.exists();
}

/**
 * Get all variable names from a .env file
 */
export async function getEnvVariableNames(
  path: string = ENV_FILENAME
): Promise<string[]> {
  const { variables } = await loadEnvFile(path);
  return Object.keys(variables);
}
