import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readResource, RESOURCE_DEFINITIONS } from "./resources";
import { ensureSetup } from "./setup";
import { callTool, TOOL_DEFINITIONS } from "./tools";
import { configureGitignore } from "../cli/commands/setup";
import { configureClaudeSettings } from "../utils/claude-settings";

let fixtureDir: string;
let originalCwd: string;
let originalKeyPath: string | undefined;

function body(result: Awaited<ReturnType<typeof callTool>>) {
  const content = result.content[0];
  if (!content || content.type !== "text") throw new Error("Expected text result");
  return content.text;
}

function jsonBody(result: Awaited<ReturnType<typeof callTool>>) {
  return JSON.parse(body(result));
}

async function writeFixture(): Promise<void> {
  await writeFile(
    ".env.manifest.yaml",
    `version: 1
variables:
  PUBLIC_VALUE:
    access: full
    required: true
  READ_ONLY_VALUE:
    access: read-only
  PLACEHOLDER_VALUE:
    access: placeholder
    required: true
    format: token
  HIDDEN_VALUE:
    access: hidden
    description: never expose
`,
  );
  await writeFile(
    ".env",
    "PUBLIC_VALUE=visible\nREAD_ONLY_VALUE=fixed\nPLACEHOLDER_VALUE=secret-placeholder\nHIDDEN_VALUE=secret-hidden\n",
  );
  await writeFile(
    ".gitignore",
    ".env\n.env.*\n!.env.example\n!.env.manifest.yaml\n.envibe/\n",
  );
}

beforeEach(async () => {
  originalCwd = process.cwd();
  fixtureDir = await mkdtemp(join(tmpdir(), "envibe-tools-"));
  process.chdir(fixtureDir);
  originalKeyPath = process.env.ENVIBE_KEY_PATH;
  process.env.ENVIBE_KEY_PATH = join(fixtureDir, "machine", "key");
});

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalKeyPath === undefined) delete process.env.ENVIBE_KEY_PATH;
  else process.env.ENVIBE_KEY_PATH = originalKeyPath;
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("real MCP tool handlers", () => {
  test("exports all ten tools", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "env_list",
      "env_get",
      "env_set",
      "env_describe",
      "env_check_required",
      "env_blind_set",
      "env_check_gitignore",
      "env_backup_list",
      "env_backup_diff",
      "env_restore",
    ]);
  });

  test("env_list filters hidden values", async () => {
    await writeFixture();
    const result = await callTool("env_list");
    expect(result.isError).toBeUndefined();
    const serialized = body(result);
    expect(serialized).toContain("PUBLIC_VALUE");
    expect(serialized).toContain("<PLACEHOLDER_VALUE>");
    expect(serialized).not.toContain("secret-placeholder");
    expect(serialized).not.toContain("HIDDEN_VALUE");
    expect(serialized).not.toContain("secret-hidden");
  });

  test("env_get returns visible values and denies hidden values", async () => {
    await writeFixture();
    expect(body(await callTool("env_get", { key: "PUBLIC_VALUE" }))).toBe("visible");
    const denied = await callTool("env_get", { key: "HIDDEN_VALUE" });
    expect(denied.isError).toBe(true);
    expect(jsonBody(denied).error).toBe("ACCESS_DENIED");
    expect(body(denied)).not.toContain("secret-hidden");
  });

  test("env_set updates full variables and denies read-only variables", async () => {
    await writeFixture();
    const updated = await callTool("env_set", { key: "PUBLIC_VALUE", value: "changed" });
    expect(updated.isError).toBeUndefined();
    expect(await readFile(".env", "utf8")).toContain("PUBLIC_VALUE=changed");
    expect(await readFile(".env.ai", "utf8")).not.toContain("secret-hidden");

    const denied = await callTool("env_set", { key: "READ_ONLY_VALUE", value: "nope" });
    expect(denied.isError).toBe(true);
    expect(await readFile(".env", "utf8")).toContain("READ_ONLY_VALUE=fixed");
  });

  test("env_describe returns hidden metadata without its value", async () => {
    await writeFixture();
    const result = await callTool("env_describe", { key: "HIDDEN_VALUE" });
    const description = jsonBody(result);
    expect(description.access).toBe("hidden");
    expect(description.description).toBe("never expose");
    expect(body(result)).not.toContain("secret-hidden");
  });

  test("env_check_required reports missing variables without leaking set secrets", async () => {
    await writeFixture();
    await writeFile(".env", "PUBLIC_VALUE=visible\n");
    const result = jsonBody(await callTool("env_check_required"));
    expect(result.missing.map((entry: { key: string }) => entry.key)).toContain(
      "PLACEHOLDER_VALUE",
    );
    expect(JSON.stringify(result)).not.toContain("secret-placeholder");
  });

  test("env_blind_set writes hidden/placeholder values and denies read-only", async () => {
    await writeFixture();
    const updated = await callTool("env_blind_set", {
      key: "PLACEHOLDER_VALUE",
      value: "replacement-secret",
    });
    expect(jsonBody(updated).success).toBe(true);
    expect(body(updated)).not.toContain("replacement-secret");
    expect(await readFile(".env", "utf8")).toContain(
      "PLACEHOLDER_VALUE=replacement-secret",
    );
    expect(await readFile(".env.ai", "utf8")).not.toContain("replacement-secret");

    const denied = await callTool("env_blind_set", {
      key: "READ_ONLY_VALUE",
      value: "nope",
    });
    expect(denied.isError).toBe(true);
    expect(jsonBody(denied).error).toBe("ACCESS_DENIED");
  });

  test("env_check_gitignore passes canonical and safe superset coverage", async () => {
    await writeFixture();
    const canonical = jsonBody(await callTool("env_check_gitignore"));
    expect(canonical.valid).toBe(true);
    expect(canonical.warnings).toEqual([]);

    await writeFile(
      ".gitignore",
      ".env\n.env.*\n!.env.example\n!.env.manifest.yaml\n.envibe/\n.env.ai\n",
    );
    const superset = jsonBody(await callTool("env_check_gitignore"));
    expect(superset.valid).toBe(true);
    expect(superset.warnings).toHaveLength(1);
  });

  test("env_check_gitignore fails when the manifest exception is absent", async () => {
    await writeFixture();
    await writeFile(".gitignore", ".env\n.env.*\n!.env.example\n");
    const result = await callTool("env_check_gitignore");
    expect(result.isError).toBe(true);
    expect(jsonBody(result).issues).toContain(
      "Missing '!.env.manifest.yaml' pattern",
    );
  });

  test("backup tools list metadata, mask diffs, and restore only explicit ids", async () => {
    await writeFixture();
    await callTool("env_backup_list");
    await writeFile(".env", "PUBLIC_VALUE=changed\nREAD_ONLY_VALUE=fixed\nPLACEHOLDER_VALUE=replacement-secret\nHIDDEN_VALUE=new-hidden\n");
    const listed = jsonBody(await callTool("env_backup_list"));
    expect(listed).toHaveLength(2);
    expect(JSON.stringify(listed)).not.toContain("secret-hidden");

    const originalId = listed[1].id;
    const diff = await callTool("env_backup_diff", { id: originalId });
    expect(body(diff)).toContain("PUBLIC_VALUE");
    expect(body(diff)).not.toContain("replacement-secret");
    expect(body(diff)).not.toContain("new-hidden");

    const latest = await callTool("env_restore", { id: "latest" });
    expect(latest.isError).toBe(true);
    expect(jsonBody(latest).error).toBe("EXPLICIT_ID_REQUIRED");

    const restored = jsonBody(await callTool("env_restore", { id: originalId }));
    expect(restored.changedKeys).toContain("PUBLIC_VALUE");
    expect(JSON.stringify(restored)).not.toContain("secret-hidden");
    expect(await readFile(".env", "utf8")).toContain("PUBLIC_VALUE=visible");
    expect(await readFile(".env.ai", "utf8")).not.toContain("secret-hidden");
    expect(restored.safetySnapshotId).toBeTruthy();
  });
});

describe("MCP resources and setup", () => {
  test("bootstraps a project from .env.example and configures .mcp.json", async () => {
    await writeFile(".env.example", "PORT=3000\nSERVICE_TOKEN=\n");
    const manifest = await ensureSetup();
    expect(manifest.variables.PORT).toBeDefined();
    expect(manifest.variables.SERVICE_TOKEN).toBeDefined();
    expect(await readFile(".env.manifest.yaml", "utf8")).toContain("SERVICE_TOKEN");
    expect(await readFile(".env.ai", "utf8")).toContain("PORT=3000");
    expect(JSON.parse(await readFile(".mcp.json", "utf8")).mcpServers.envibe).toEqual({
      command: "npx",
      args: ["envibe", "mcp"],
    });
  });

  test("setup gitignore writer adds the canonical protection set", async () => {
    await writeFile(".gitignore", "node_modules\n");
    await configureGitignore();
    const gitignore = await readFile(".gitignore", "utf8");
    for (const pattern of [
      ".env",
      ".env.*",
      "!.env.example",
      "!.env.manifest.yaml",
      ".envibe/",
    ]) {
      expect(gitignore.split("\n")).toContain(pattern);
    }
  });

  test("moves envibe registration to .mcp.json without clobbering config", async () => {
    await mkdir(".claude", { recursive: true });
    await writeFile(
      ".claude/settings.json",
      JSON.stringify({
        theme: "dark",
        mcpServers: { envibe: { command: "old" }, other: { command: "other" } },
      }),
    );
    await writeFile(
      ".mcp.json",
      JSON.stringify({ mcpServers: { other: { command: "other" } }, note: "keep" }),
    );

    await configureClaudeSettings(true);

    const settings = JSON.parse(await readFile(".claude/settings.json", "utf8"));
    expect(settings.permissions.deny).toContain("Read(./.envibe/**)");
    expect(settings.theme).toBe("dark");
    expect(settings.mcpServers.other).toEqual({ command: "other" });
    expect(settings.mcpServers.envibe).toBeUndefined();
    const mcp = JSON.parse(await readFile(".mcp.json", "utf8"));
    expect(mcp.note).toBe("keep");
    expect(mcp.mcpServers.other).toEqual({ command: "other" });
    expect(mcp.mcpServers.envibe.args).toEqual(["envibe", "mcp"]);
  });

  test("lists and reads both resources through real resource handlers", async () => {
    await writeFixture();
    expect(RESOURCE_DEFINITIONS.map((resource) => resource.uri)).toEqual([
      "env://manifest",
      "env://variables",
    ]);
    const manifest = await readResource("env://manifest");
    expect(manifest.contents[0]?.text).toContain("PUBLIC_VALUE");
    const variables = await readResource("env://variables");
    expect(variables.contents[0]?.text).toContain("PUBLIC_VALUE=visible");
    expect(variables.contents[0]?.text).not.toContain("secret-hidden");
    await expect(readResource("env://unknown")).rejects.toThrow("Unknown resource");
  });
});
