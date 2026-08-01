import {
  AccessLevel,
  checkGitignoreContent,
  filterForAI,
  generateAIEnvContent,
  getVariableForAI,
  validateModification,
  type Manifest,
  LocalSnapshotStore,
  diffSnapshot,
  restoreSnapshot,
} from "../core";
import {
  getAIEnvFilename,
  loadEnvFile,
  updateEnvVariable,
} from "../utils/dotenv";
import { createFile, write } from "../utils/file";
import { ensureSetup } from "./setup";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type ToolArgs = Record<string, unknown> | undefined;

export type ToolResult = CallToolResult;

function textResult(value: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(isError ? { isError: true } : {}),
  };
}

function jsonResult(value: unknown, isError = false): ToolResult {
  return textResult(JSON.stringify(value, null, 2), isError);
}

function stringArg(args: ToolArgs, key: string): string {
  const value = args?.[key];
  if (typeof value !== "string") {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value;
}

async function regenerateAIEnv(manifest: Manifest): Promise<void> {
  const { variables } = await loadEnvFile();
  await write(
    getAIEnvFilename(),
    generateAIEnvContent(filterForAI(variables, manifest)),
  );
}

export const TOOL_DEFINITIONS = [
  {
    name: "env_list",
    description:
      "List all environment variables with their access levels. Returns variables that you are allowed to see.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "env_get",
    description:
      "Get a specific environment variable. Hidden values are denied and placeholder values remain masked.",
    inputSchema: {
      type: "object" as const,
      properties: { key: { type: "string", description: "Environment variable name" } },
      required: ["key"],
    },
  },
  {
    name: "env_set",
    description: "Set an environment variable with full access.",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Environment variable name" },
        value: { type: "string", description: "Value to set" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "env_describe",
    description:
      "Describe an environment variable, including access, required state, format, and example.",
    inputSchema: {
      type: "object" as const,
      properties: { key: { type: "string", description: "Environment variable name" } },
      required: ["key"],
    },
  },
  {
    name: "env_check_required",
    description: "List required environment variables that are missing.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "env_blind_set",
    description:
      "Set a full, placeholder, or hidden variable without reading its current value.",
    inputSchema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Environment variable name" },
        value: { type: "string", description: "New user-provided value" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "env_check_gitignore",
    description:
      "Validate that .gitignore protects .env files while keeping .env.example and .env.manifest.yaml committable.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "env_backup_list",
    description: "List encrypted .env snapshot metadata. Snapshot contents are never returned.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "env_backup_diff",
    description: "Compare a snapshot with the current .env at key level using manifest-safe masked values.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Explicit snapshot id from env_backup_list" } },
      required: ["id"],
    },
  },
  {
    name: "env_restore",
    description: "Restore an explicit snapshot id after creating a mandatory safety snapshot.",
    inputSchema: {
      type: "object" as const,
      properties: { id: { type: "string", description: "Explicit snapshot id; latest and indexes are not accepted" } },
      required: ["id"],
    },
  },
] as const;

export async function handleEnvList(manifest: Manifest): Promise<ToolResult> {
  const { variables } = await loadEnvFile();
  return jsonResult(
    filterForAI(variables, manifest).map((variable) => ({
      key: variable.key,
      value: variable.displayValue,
      access: variable.access,
      canModify: variable.canModify,
      description: variable.description,
    })),
  );
}

export async function handleEnvGet(
  manifest: Manifest,
  args: ToolArgs,
): Promise<ToolResult> {
  const key = stringArg(args, "key");
  const { variables } = await loadEnvFile();
  const config = manifest.variables[key];
  const variable = getVariableForAI(key, variables, manifest);

  if (config?.access === AccessLevel.HIDDEN) {
    return jsonResult(
      {
        error: "ACCESS_DENIED",
        key,
        access: "hidden",
        message: "This variable is hidden from AI. Ask the user to configure it manually.",
        hint: config.description,
      },
      true,
    );
  }
  if (!variable) {
    return jsonResult(
      { error: "NOT_FOUND", key, message: `Variable "${key}" does not exist in the manifest.` },
      true,
    );
  }
  if (variable.access === AccessLevel.PLACEHOLDER) {
    return jsonResult({
      value: variable.displayValue,
      access: "placeholder",
      message: "You can reference this variable but cannot see the actual value.",
      hint: config?.description,
      format: config?.format,
      example: config?.example,
    });
  }
  return textResult(variable.displayValue);
}

export async function handleEnvSet(
  manifest: Manifest,
  args: ToolArgs,
): Promise<ToolResult> {
  const key = stringArg(args, "key");
  const value = stringArg(args, "value");
  const validation = validateModification(key, manifest);
  if (!validation.allowed) {
    return textResult(`Error: ${validation.reason}`, true);
  }
  await updateEnvVariable(key, value, ".env", { reason: `mcp-env-set-${key}` });
  await regenerateAIEnv(manifest);
  return textResult(`Successfully set ${key}=${value}`);
}

export async function handleEnvDescribe(
  manifest: Manifest,
  args: ToolArgs,
): Promise<ToolResult> {
  const key = stringArg(args, "key");
  const { variables } = await loadEnvFile();
  const variable = getVariableForAI(key, variables, manifest);
  const config = manifest.variables[key];

  if (config?.access === AccessLevel.HIDDEN) {
    return jsonResult({
      key,
      access: "hidden",
      canModify: false,
      description: config.description,
      message: "This variable is hidden from AI. Ask the user to configure it.",
      required: config.required ?? false,
      format: config.format,
      example: config.example,
    });
  }
  if (!variable && !config) {
    return jsonResult(
      { error: "NOT_FOUND", key, message: `Variable "${key}" does not exist in the manifest.` },
      true,
    );
  }
  return jsonResult({
    key: variable?.key ?? key,
    access: variable?.access ?? config?.access,
    canModify: variable?.canModify ?? false,
    description: variable?.description ?? config?.description,
    required: config?.required ?? false,
    hasDefault: config?.default !== undefined,
    isSet: variables[key] !== undefined,
    format: config?.format,
    example: config?.example,
  });
}

export async function handleEnvCheckRequired(
  manifest: Manifest,
): Promise<ToolResult> {
  const { variables } = await loadEnvFile();
  const missing: Array<Record<string, unknown>> = [];
  const set: Array<{ key: string; value: string }> = [];

  for (const [key, config] of Object.entries(manifest.variables)) {
    if (!config.required) continue;
    if (variables[key] === undefined || variables[key] === "") {
      missing.push({
        key,
        description: config.description,
        format: config.format,
        example: config.example,
      });
      continue;
    }
    const variable = getVariableForAI(key, variables, manifest);
    const visible =
      variable &&
      (variable.access === AccessLevel.FULL || variable.access === AccessLevel.READ_ONLY);
    set.push({ key, value: visible ? variable.displayValue : "<set>" });
  }

  return jsonResult({
    missing,
    set,
    message:
      missing.length > 0
        ? `${missing.length} required variable(s) are not set. Ask the user to configure them.`
        : "All required variables are set.",
  });
}

export async function handleEnvBlindSet(
  manifest: Manifest,
  args: ToolArgs,
): Promise<ToolResult> {
  const key = stringArg(args, "key");
  const value = stringArg(args, "value");
  const config = manifest.variables[key];
  if (!config) {
    return jsonResult(
      { error: "NOT_IN_MANIFEST", key, message: `Variable "${key}" is not defined in the manifest. Add it first.` },
      true,
    );
  }
  const writable = [AccessLevel.FULL, AccessLevel.PLACEHOLDER, AccessLevel.HIDDEN];
  if (!writable.includes(config.access)) {
    return jsonResult(
      {
        error: "ACCESS_DENIED",
        key,
        access: config.access,
        message: `Variable "${key}" has access level "${config.access}" and cannot be modified.`,
      },
      true,
    );
  }
  await updateEnvVariable(key, value, ".env", { reason: `mcp-env-blind-set-${key}` });
  await regenerateAIEnv(manifest);
  return jsonResult({
    success: true,
    key,
    message: `Successfully set ${key}. Value is not shown due to access level.`,
    access: config.access,
  });
}

export async function handleEnvCheckGitignore(): Promise<ToolResult> {
  const file = createFile(".gitignore");
  if (!(await file.exists())) {
    return jsonResult(
      {
        valid: false,
        issues: [".gitignore file not found"],
        passed: [],
        warnings: [],
        message: "Create a .gitignore file with the required envibe patterns.",
      },
      true,
    );
  }
  const result = checkGitignoreContent(await file.text());
  return jsonResult(
    {
      ...result,
      message: result.valid
        ? result.warnings.length > 0
          ? "✓ .gitignore is safely configured with additional env patterns"
          : "✓ .gitignore is configured with the canonical envibe patterns"
        : `Found ${result.issues.length} issue(s). Add the missing patterns to .gitignore.`,
    },
    !result.valid,
  );
}

function snapshotStore(manifest: Manifest): LocalSnapshotStore {
  return new LocalSnapshotStore({ encrypt: manifest.backup?.encrypt !== false });
}

export async function handleEnvBackupList(manifest: Manifest): Promise<ToolResult> {
  return jsonResult(await snapshotStore(manifest).list());
}

export async function handleEnvBackupDiff(manifest: Manifest, args: ToolArgs): Promise<ToolResult> {
  const id = stringArg(args, "id");
  return jsonResult({ id, changes: await diffSnapshot(snapshotStore(manifest), id, manifest) });
}

export async function handleEnvRestore(manifest: Manifest, args: ToolArgs): Promise<ToolResult> {
  const id = stringArg(args, "id");
  if (id === "latest" || /^\d+$/.test(id)) {
    return jsonResult({ error: "EXPLICIT_ID_REQUIRED", message: "Call env_backup_list and env_backup_diff, then provide the full snapshot id." }, true);
  }
  const store = snapshotStore(manifest);
  const result = await restoreSnapshot(store, id);
  await regenerateAIEnv(manifest);
  return jsonResult({
    restored: id,
    safetySnapshotId: result.safetySnapshot?.id ?? null,
    changedKeys: result.changedKeys,
  });
}

export async function callTool(name: string, args?: ToolArgs): Promise<ToolResult> {
  try {
    const manifest = await ensureSetup();
    switch (name) {
      case "env_list":
        return handleEnvList(manifest);
      case "env_get":
        return handleEnvGet(manifest, args);
      case "env_set":
        return handleEnvSet(manifest, args);
      case "env_describe":
        return handleEnvDescribe(manifest, args);
      case "env_check_required":
        return handleEnvCheckRequired(manifest);
      case "env_blind_set":
        return handleEnvBlindSet(manifest, args);
      case "env_check_gitignore":
        return handleEnvCheckGitignore();
      case "env_backup_list":
        return handleEnvBackupList(manifest);
      case "env_backup_diff":
        return handleEnvBackupDiff(manifest, args);
      case "env_restore":
        return handleEnvRestore(manifest, args);
      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (error) {
    return textResult(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      true,
    );
  }
}
