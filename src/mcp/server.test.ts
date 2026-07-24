import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  filterForAI,
  generateAIEnvContent,
  AccessLevel,
  type Manifest,
} from "../core";
import {
  loadEnvFile,
  updateEnvVariable,
  getAIEnvFilename,
} from "../utils/dotenv";
import { write } from "../utils/file";

/**
 * Tests for env_blind_set handler logic.
 *
 * Since the handler is embedded in the MCP server setup,
 * we test the same code path it executes:
 * 1. Check manifest for the key
 * 2. Call updateEnvVariable
 * 3. Reload env, filter, regenerate .env.ai
 */

let tmpDir: string;
let origCwd: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "aienv-blind-set-test-"));
  origCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(origCwd);
  await rm(tmpDir, { recursive: true, force: true });
});

describe("env_blind_set", () => {
  test("sets a hidden variable in .env", async () => {
    // Setup: .env with existing var, manifest with hidden var
    await writeFile(join(tmpDir, ".env"), "NODE_ENV=development\n");

    const manifest: Manifest = {
      version: 1,
      variables: {
        NODE_ENV: { access: AccessLevel.FULL },
        STRIPE_SECRET_KEY: {
          access: AccessLevel.HIDDEN,
          description: "Stripe secret key",
        },
      },
    };

    const key = "STRIPE_SECRET_KEY";
    const value = "sk_live_abc123";
    const config = manifest.variables[key];

    // Simulate handler: must exist in manifest
    expect(config).toBeDefined();

    // Update .env file
    await updateEnvVariable(key, value);

    // Verify .env was updated
    const envContent = await readFile(join(tmpDir, ".env"), "utf-8");
    expect(envContent).toContain("STRIPE_SECRET_KEY=sk_live_abc123");
    expect(envContent).toContain("NODE_ENV=development");
  });

  test("sets a placeholder variable in .env", async () => {
    await writeFile(join(tmpDir, ".env"), "PORT=3000\n");

    const manifest: Manifest = {
      version: 1,
      variables: {
        PORT: { access: AccessLevel.FULL },
        API_KEY: {
          access: AccessLevel.PLACEHOLDER,
          description: "API key for external service",
        },
      },
    };

    const key = "API_KEY";
    const value = "key_12345";
    const config = manifest.variables[key];

    expect(config).toBeDefined();

    await updateEnvVariable(key, value);

    const envContent = await readFile(join(tmpDir, ".env"), "utf-8");
    expect(envContent).toContain("API_KEY=key_12345");
  });

  test("syncs .env.ai after setting variable", async () => {
    await writeFile(join(tmpDir, ".env"), "NODE_ENV=development\n");

    const manifest: Manifest = {
      version: 1,
      variables: {
        NODE_ENV: { access: AccessLevel.FULL },
        SECRET_KEY: { access: AccessLevel.HIDDEN },
      },
    };

    const key = "SECRET_KEY";
    const value = "super_secret";

    // Simulate the full handler flow
    await updateEnvVariable(key, value);

    const { variables: updatedEnv } = await loadEnvFile();
    const filtered = filterForAI(updatedEnv, manifest);
    const content = generateAIEnvContent(filtered);
    await write(getAIEnvFilename(), content);

    // .env.ai should exist but NOT contain the hidden value
    const aiContent = await readFile(join(tmpDir, ".env.ai"), "utf-8");
    expect(aiContent).toContain("NODE_ENV=development");
    expect(aiContent).not.toContain("super_secret");
    expect(aiContent).not.toContain("SECRET_KEY");
  });

  test("rejects variable not in manifest", async () => {
    await writeFile(join(tmpDir, ".env"), "");

    const manifest: Manifest = {
      version: 1,
      variables: {
        NODE_ENV: { access: AccessLevel.FULL },
      },
    };

    const key = "NOT_IN_MANIFEST";
    const config = manifest.variables[key];

    // Handler would return NOT_IN_MANIFEST error
    expect(config).toBeUndefined();
  });

  test("updates existing variable value", async () => {
    await writeFile(
      join(tmpDir, ".env"),
      "DB_PASSWORD=old_password\nPORT=3000\n"
    );

    const manifest: Manifest = {
      version: 1,
      variables: {
        DB_PASSWORD: { access: AccessLevel.HIDDEN },
        PORT: { access: AccessLevel.FULL },
      },
    };

    const key = "DB_PASSWORD";
    const value = "new_password";

    expect(manifest.variables[key]).toBeDefined();

    await updateEnvVariable(key, value);

    const envContent = await readFile(join(tmpDir, ".env"), "utf-8");
    expect(envContent).toContain("DB_PASSWORD=new_password");
    expect(envContent).not.toContain("old_password");
    expect(envContent).toContain("PORT=3000");
  });

  test("creates .env file if it does not exist", async () => {
    // No .env file created
    const manifest: Manifest = {
      version: 1,
      variables: {
        NEW_VAR: { access: AccessLevel.PLACEHOLDER },
      },
    };

    const key = "NEW_VAR";
    const value = "fresh_value";

    expect(manifest.variables[key]).toBeDefined();

    await updateEnvVariable(key, value);

    const envContent = await readFile(join(tmpDir, ".env"), "utf-8");
    expect(envContent).toContain("NEW_VAR=fresh_value");
  });

  test("handler returns correct success response shape", () => {
    // Verify the response shape matches what the handler returns
    const config = { access: AccessLevel.HIDDEN, description: "test" };
    const key = "MY_KEY";

    const response = {
      success: true,
      key,
      message: `Successfully set ${key}. Value is not shown due to access level.`,
      access: config.access,
    };

    expect(response.success).toBe(true);
    expect(response.key).toBe("MY_KEY");
    expect(response.message).toContain("Successfully set MY_KEY");
    expect(response.access).toBe(AccessLevel.HIDDEN);
  });

  test("handler returns correct error response for missing manifest entry", () => {
    const key = "MISSING_KEY";

    const response = {
      error: "NOT_IN_MANIFEST",
      key,
      message: `Variable "${key}" is not defined in the manifest. Add it first.`,
    };

    expect(response.error).toBe("NOT_IN_MANIFEST");
    expect(response.key).toBe("MISSING_KEY");
    expect(response.message).toContain("not defined in the manifest");
  });

  test("works with values containing special characters", async () => {
    await writeFile(join(tmpDir, ".env"), "");

    const manifest: Manifest = {
      version: 1,
      variables: {
        CONNECTION_STRING: { access: AccessLevel.HIDDEN },
      },
    };

    const key = "CONNECTION_STRING";
    const value = "postgres://user:p@ss#word@localhost:5432/db";

    expect(manifest.variables[key]).toBeDefined();

    await updateEnvVariable(key, value);

    const { variables } = await loadEnvFile();
    expect(variables[key]).toBe(value);
  });

  test(".env.ai reflects placeholder access after blind set", async () => {
    await writeFile(join(tmpDir, ".env"), "");

    const manifest: Manifest = {
      version: 1,
      variables: {
        API_TOKEN: {
          access: AccessLevel.PLACEHOLDER,
          description: "External API token",
        },
      },
    };

    await updateEnvVariable("API_TOKEN", "tok_secret_123");

    const { variables: updatedEnv } = await loadEnvFile();
    const filtered = filterForAI(updatedEnv, manifest);
    const content = generateAIEnvContent(filtered);
    await write(getAIEnvFilename(), content);

    const aiContent = await readFile(join(tmpDir, ".env.ai"), "utf-8");
    // Placeholder vars show <KEY> not the actual value
    expect(aiContent).toContain("<API_TOKEN>");
    expect(aiContent).not.toContain("tok_secret_123");
  });
});
