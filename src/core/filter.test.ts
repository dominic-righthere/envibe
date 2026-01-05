import { test, expect, describe } from "bun:test";
import {
  getDisplayValue,
  canModify,
  canSee,
  filterForAI,
  generateAIEnvContent,
  validateModification,
  getVariableForAI,
} from "./filter";
import { AccessLevel, type Manifest, type VariableConfig } from "./types";

describe("getDisplayValue", () => {
  test("returns actual value for FULL access", () => {
    const config: VariableConfig = { access: AccessLevel.FULL };
    expect(getDisplayValue("KEY", "secret", config)).toBe("secret");
  });

  test("returns actual value for READ_ONLY access", () => {
    const config: VariableConfig = { access: AccessLevel.READ_ONLY };
    expect(getDisplayValue("KEY", "value", config)).toBe("value");
  });

  test("returns pattern for READ_ONLY with pattern", () => {
    const config: VariableConfig = { access: AccessLevel.READ_ONLY, pattern: "sk-***" };
    expect(getDisplayValue("KEY", "sk-actual", config)).toBe("sk-***");
  });

  test("returns placeholder for PLACEHOLDER access", () => {
    const config: VariableConfig = { access: AccessLevel.PLACEHOLDER };
    expect(getDisplayValue("API_KEY", "secret", config)).toBe("<API_KEY>");
  });

  test("returns schema representation for SCHEMA_ONLY", () => {
    const config: VariableConfig = {
      access: AccessLevel.SCHEMA_ONLY,
      schema: { type: "url", protocol: "https" },
    };
    const result = getDisplayValue("URL", "https://secret.com", config);
    expect(result).toContain("type:");
    expect(result).toContain("protocol:");
  });

  test("returns <schema> for SCHEMA_ONLY without schema", () => {
    const config: VariableConfig = { access: AccessLevel.SCHEMA_ONLY };
    expect(getDisplayValue("KEY", "value", config)).toBe("<schema>");
  });

  test("returns empty string for HIDDEN access", () => {
    const config: VariableConfig = { access: AccessLevel.HIDDEN };
    expect(getDisplayValue("SECRET", "value", config)).toBe("");
  });

  test("uses default value when value is undefined", () => {
    const config: VariableConfig = { access: AccessLevel.FULL, default: "default_value" };
    expect(getDisplayValue("KEY", undefined, config)).toBe("default_value");
  });

  test("returns empty string when value is undefined and no default", () => {
    const config: VariableConfig = { access: AccessLevel.FULL };
    expect(getDisplayValue("KEY", undefined, config)).toBe("");
  });
});

describe("canModify", () => {
  test("returns true for FULL access", () => {
    expect(canModify(AccessLevel.FULL)).toBe(true);
  });

  test("returns false for READ_ONLY access", () => {
    expect(canModify(AccessLevel.READ_ONLY)).toBe(false);
  });

  test("returns false for PLACEHOLDER access", () => {
    expect(canModify(AccessLevel.PLACEHOLDER)).toBe(false);
  });

  test("returns false for SCHEMA_ONLY access", () => {
    expect(canModify(AccessLevel.SCHEMA_ONLY)).toBe(false);
  });

  test("returns false for HIDDEN access", () => {
    expect(canModify(AccessLevel.HIDDEN)).toBe(false);
  });
});

describe("canSee", () => {
  test("returns true for FULL access", () => {
    expect(canSee(AccessLevel.FULL)).toBe(true);
  });

  test("returns true for READ_ONLY access", () => {
    expect(canSee(AccessLevel.READ_ONLY)).toBe(true);
  });

  test("returns true for PLACEHOLDER access", () => {
    expect(canSee(AccessLevel.PLACEHOLDER)).toBe(true);
  });

  test("returns true for SCHEMA_ONLY access", () => {
    expect(canSee(AccessLevel.SCHEMA_ONLY)).toBe(true);
  });

  test("returns false for HIDDEN access", () => {
    expect(canSee(AccessLevel.HIDDEN)).toBe(false);
  });
});

describe("filterForAI", () => {
  test("excludes HIDDEN variables", () => {
    const manifest: Manifest = {
      version: 1,
      variables: {
        VISIBLE: { access: AccessLevel.FULL },
        HIDDEN_VAR: { access: AccessLevel.HIDDEN },
      },
    };
    const env = { VISIBLE: "yes", HIDDEN_VAR: "secret" };
    const result = filterForAI(env, manifest);
    expect(result.find((v) => v.key === "HIDDEN_VAR")).toBeUndefined();
    expect(result.find((v) => v.key === "VISIBLE")).toBeDefined();
  });

  test("includes variables with correct display values", () => {
    const manifest: Manifest = {
      version: 1,
      variables: {
        FULL_VAR: { access: AccessLevel.FULL },
        PLACEHOLDER_VAR: { access: AccessLevel.PLACEHOLDER },
      },
    };
    const env = { FULL_VAR: "actual", PLACEHOLDER_VAR: "secret" };
    const result = filterForAI(env, manifest);

    const fullVar = result.find((v) => v.key === "FULL_VAR");
    expect(fullVar?.displayValue).toBe("actual");

    const placeholderVar = result.find((v) => v.key === "PLACEHOLDER_VAR");
    expect(placeholderVar?.displayValue).toBe("<PLACEHOLDER_VAR>");
  });

  test("adds unclassified env vars with placeholder access", () => {
    const manifest: Manifest = { version: 1, variables: {} };
    const env = { UNKNOWN: "value" };
    const result = filterForAI(env, manifest);
    expect(result[0].access).toBe(AccessLevel.PLACEHOLDER);
    expect(result[0].displayValue).toBe("<UNKNOWN>");
  });

  test("sorts results alphabetically", () => {
    const manifest: Manifest = { version: 1, variables: {} };
    const env = { ZEBRA: "z", ALPHA: "a", MIDDLE: "m" };
    const result = filterForAI(env, manifest);
    expect(result.map((v) => v.key)).toEqual(["ALPHA", "MIDDLE", "ZEBRA"]);
  });

  test("includes canModify flag", () => {
    const manifest: Manifest = {
      version: 1,
      variables: {
        EDITABLE: { access: AccessLevel.FULL },
        READONLY: { access: AccessLevel.READ_ONLY },
      },
    };
    const env = { EDITABLE: "a", READONLY: "b" };
    const result = filterForAI(env, manifest);

    expect(result.find((v) => v.key === "EDITABLE")?.canModify).toBe(true);
    expect(result.find((v) => v.key === "READONLY")?.canModify).toBe(false);
  });

  test("handles empty env", () => {
    const manifest: Manifest = {
      version: 1,
      variables: {
        VAR: { access: AccessLevel.FULL, default: "default" },
      },
    };
    const result = filterForAI({}, manifest);
    expect(result).toHaveLength(1);
    expect(result[0].displayValue).toBe("default");
  });
});

describe("generateAIEnvContent", () => {
  test("generates header comments", () => {
    const content = generateAIEnvContent([]);
    expect(content).toContain("# Generated by aienv");
    expect(content).toContain(".env.manifest.yaml");
  });

  test("generates variable lines with access tags", () => {
    const variables = [
      {
        key: "DEBUG",
        displayValue: "true",
        access: AccessLevel.FULL,
        canModify: true,
      },
    ];
    const content = generateAIEnvContent(variables);
    expect(content).toContain("DEBUG=true");
    expect(content).toContain("[full]");
  });

  test("shows schema-only as comments", () => {
    const variables = [
      {
        key: "CONFIG",
        displayValue: '{ type: "json" }',
        access: AccessLevel.SCHEMA_ONLY,
        canModify: false,
      },
    ];
    const content = generateAIEnvContent(variables);
    expect(content).toContain("# CONFIG: schema");
  });

  test("includes descriptions", () => {
    const variables = [
      {
        key: "PORT",
        displayValue: "3000",
        access: AccessLevel.FULL,
        canModify: true,
        description: "Server port",
      },
    ];
    const content = generateAIEnvContent(variables);
    expect(content).toContain("Server port");
  });
});

describe("validateModification", () => {
  test("allows modification for FULL access", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { EDITABLE: { access: AccessLevel.FULL } },
    };
    expect(validateModification("EDITABLE", manifest).allowed).toBe(true);
  });

  test("denies modification for READ_ONLY access", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { READONLY: { access: AccessLevel.READ_ONLY } },
    };
    const result = validateModification("READONLY", manifest);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("read-only");
  });

  test("denies modification for PLACEHOLDER access", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { SECRET: { access: AccessLevel.PLACEHOLDER } },
    };
    const result = validateModification("SECRET", manifest);
    expect(result.allowed).toBe(false);
  });

  test("denies access for HIDDEN variables", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { HIDDEN: { access: AccessLevel.HIDDEN } },
    };
    const result = validateModification("HIDDEN", manifest);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("hidden");
  });

  test("uses default (placeholder) for unknown variables", () => {
    const manifest: Manifest = { version: 1, variables: {} };
    const result = validateModification("UNKNOWN", manifest);
    expect(result.allowed).toBe(false);
  });
});

describe("getVariableForAI", () => {
  test("returns variable info for visible variables", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { VAR: { access: AccessLevel.FULL, description: "Test" } },
    };
    const result = getVariableForAI("VAR", { VAR: "value" }, manifest);
    expect(result).not.toBeNull();
    expect(result?.key).toBe("VAR");
    expect(result?.displayValue).toBe("value");
    expect(result?.description).toBe("Test");
  });

  test("returns null for hidden variables", () => {
    const manifest: Manifest = {
      version: 1,
      variables: { SECRET: { access: AccessLevel.HIDDEN } },
    };
    const result = getVariableForAI("SECRET", { SECRET: "value" }, manifest);
    expect(result).toBeNull();
  });

  test("uses placeholder for unknown variables", () => {
    const manifest: Manifest = { version: 1, variables: {} };
    const result = getVariableForAI("UNKNOWN", { UNKNOWN: "value" }, manifest);
    expect(result?.access).toBe(AccessLevel.PLACEHOLDER);
    expect(result?.displayValue).toBe("<UNKNOWN>");
  });
});
