import { test, expect, describe } from "bun:test";
import {
  parseManifest,
  serializeManifest,
  createEmptyManifest,
  getVariableConfig,
  setVariableConfig,
  hasVariable,
  getManifestFilename,
} from "./manifest";
import { AccessLevel } from "./types";

describe("parseManifest", () => {
  test("parses valid manifest with all access levels", () => {
    const yaml = `
version: 1
variables:
  API_KEY:
    access: placeholder
    description: "API key"
  DEBUG:
    access: full
`;
    const manifest = parseManifest(yaml);
    expect(manifest.version).toBe(1);
    expect(manifest.variables.API_KEY.access).toBe(AccessLevel.PLACEHOLDER);
    expect(manifest.variables.API_KEY.description).toBe("API key");
    expect(manifest.variables.DEBUG.access).toBe(AccessLevel.FULL);
  });

  test("parses all access levels", () => {
    const yaml = `
version: 1
variables:
  FULL_VAR:
    access: full
  READONLY_VAR:
    access: read-only
  PLACEHOLDER_VAR:
    access: placeholder
  SCHEMA_VAR:
    access: schema-only
  HIDDEN_VAR:
    access: hidden
`;
    const manifest = parseManifest(yaml);
    expect(manifest.variables.FULL_VAR.access).toBe(AccessLevel.FULL);
    expect(manifest.variables.READONLY_VAR.access).toBe(AccessLevel.READ_ONLY);
    expect(manifest.variables.PLACEHOLDER_VAR.access).toBe(AccessLevel.PLACEHOLDER);
    expect(manifest.variables.SCHEMA_VAR.access).toBe(AccessLevel.SCHEMA_ONLY);
    expect(manifest.variables.HIDDEN_VAR.access).toBe(AccessLevel.HIDDEN);
  });

  test("parses optional fields", () => {
    const yaml = `
version: 1
variables:
  VAR:
    access: full
    description: "Test variable"
    default: "default_value"
    required: true
    pattern: "sk-***"
`;
    const manifest = parseManifest(yaml);
    const config = manifest.variables.VAR;
    expect(config.description).toBe("Test variable");
    expect(config.default).toBe("default_value");
    expect(config.required).toBe(true);
    expect(config.pattern).toBe("sk-***");
  });

  test("parses schema field", () => {
    const yaml = `
version: 1
variables:
  CONFIG:
    access: schema-only
    schema:
      type: json
      format: object
`;
    const manifest = parseManifest(yaml);
    expect(manifest.variables.CONFIG.schema).toEqual({
      type: "json",
      format: "object",
    });
  });

  test("defaults version to 1 when missing", () => {
    const yaml = `
variables:
  TEST:
    access: full
`;
    const manifest = parseManifest(yaml);
    expect(manifest.version).toBe(1);
  });

  test("handles empty variables", () => {
    const yaml = `
version: 1
variables: {}
`;
    const manifest = parseManifest(yaml);
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.variables)).toHaveLength(0);
  });

  test("handles missing variables section", () => {
    const yaml = `version: 1`;
    const manifest = parseManifest(yaml);
    expect(manifest.version).toBe(1);
    expect(Object.keys(manifest.variables)).toHaveLength(0);
  });

  test("throws on invalid access level", () => {
    const yaml = `
version: 1
variables:
  BAD:
    access: invalid
`;
    expect(() => parseManifest(yaml)).toThrow(/invalid access level/);
  });

  test("throws on non-object manifest", () => {
    expect(() => parseManifest("just a string")).toThrow(/expected object/);
  });

  test("throws on null manifest", () => {
    expect(() => parseManifest("null")).toThrow(/expected object/);
  });

  test("throws on invalid version", () => {
    const yaml = `
version: -1
variables: {}
`;
    expect(() => parseManifest(yaml)).toThrow(/version must be a positive/);
  });

  test("throws on non-object variable", () => {
    const yaml = `
version: 1
variables:
  BAD: "string"
`;
    expect(() => parseManifest(yaml)).toThrow(/must be an object/);
  });

  test("throws on missing access level", () => {
    const yaml = `
version: 1
variables:
  VAR:
    description: "No access"
`;
    expect(() => parseManifest(yaml)).toThrow(/invalid access level/);
  });
});

describe("serializeManifest", () => {
  test("serializes manifest to YAML", () => {
    const manifest = {
      version: 1,
      variables: {
        DEBUG: { access: AccessLevel.FULL, description: "Debug mode" },
      },
    };
    const yaml = serializeManifest(manifest);
    expect(yaml).toContain("version: 1");
    expect(yaml).toContain("DEBUG:");
    expect(yaml).toContain("access: full");
    expect(yaml).toContain("description: Debug mode");
  });

  test("includes header comments", () => {
    const manifest = { version: 1, variables: {} };
    const yaml = serializeManifest(manifest);
    expect(yaml).toContain("# envibe manifest");
    expect(yaml).toContain("# Access levels:");
    expect(yaml).toContain("#   full");
    expect(yaml).toContain("#   read-only");
    expect(yaml).toContain("#   placeholder");
    expect(yaml).toContain("#   schema-only");
    expect(yaml).toContain("#   hidden");
  });

  test("round-trips through parse", () => {
    const original = {
      version: 1,
      variables: {
        KEY: { access: AccessLevel.PLACEHOLDER, description: "Test" },
      },
    };
    const yaml = serializeManifest(original);
    const parsed = parseManifest(yaml);
    expect(parsed.version).toBe(original.version);
    expect(parsed.variables.KEY.access).toBe(original.variables.KEY.access);
    expect(parsed.variables.KEY.description).toBe(original.variables.KEY.description);
  });
});

describe("createEmptyManifest", () => {
  test("creates manifest with version 1", () => {
    const manifest = createEmptyManifest();
    expect(manifest.version).toBe(1);
  });

  test("creates manifest with empty variables", () => {
    const manifest = createEmptyManifest();
    expect(manifest.variables).toEqual({});
  });
});

describe("getVariableConfig", () => {
  test("returns config for existing variable", () => {
    const manifest = {
      version: 1,
      variables: {
        KEY: { access: AccessLevel.FULL, description: "Test" },
      },
    };
    const config = getVariableConfig(manifest, "KEY");
    expect(config.access).toBe(AccessLevel.FULL);
    expect(config.description).toBe("Test");
  });

  test("returns default config for missing variable", () => {
    const manifest = { version: 1, variables: {} };
    const config = getVariableConfig(manifest, "MISSING");
    expect(config.access).toBe(AccessLevel.PLACEHOLDER);
    expect(config.description).toBe("Unclassified variable");
  });
});

describe("setVariableConfig", () => {
  test("adds new variable", () => {
    const manifest = { version: 1, variables: {} };
    const updated = setVariableConfig(manifest, "NEW", {
      access: AccessLevel.FULL,
    });
    expect(updated.variables.NEW.access).toBe(AccessLevel.FULL);
  });

  test("updates existing variable", () => {
    const manifest = {
      version: 1,
      variables: { KEY: { access: AccessLevel.FULL } },
    };
    const updated = setVariableConfig(manifest, "KEY", {
      access: AccessLevel.READ_ONLY,
    });
    expect(updated.variables.KEY.access).toBe(AccessLevel.READ_ONLY);
  });

  test("does not mutate original", () => {
    const manifest = {
      version: 1,
      variables: { KEY: { access: AccessLevel.FULL } },
    };
    setVariableConfig(manifest, "KEY", { access: AccessLevel.READ_ONLY });
    expect(manifest.variables.KEY.access).toBe(AccessLevel.FULL);
  });

  test("preserves other variables", () => {
    const manifest = {
      version: 1,
      variables: {
        A: { access: AccessLevel.FULL },
        B: { access: AccessLevel.READ_ONLY },
      },
    };
    const updated = setVariableConfig(manifest, "A", {
      access: AccessLevel.HIDDEN,
    });
    expect(updated.variables.B.access).toBe(AccessLevel.READ_ONLY);
  });
});

describe("hasVariable", () => {
  test("returns true for existing variable", () => {
    const manifest = {
      version: 1,
      variables: { KEY: { access: AccessLevel.FULL } },
    };
    expect(hasVariable(manifest, "KEY")).toBe(true);
  });

  test("returns false for missing variable", () => {
    const manifest = { version: 1, variables: {} };
    expect(hasVariable(manifest, "MISSING")).toBe(false);
  });
});

describe("getManifestFilename", () => {
  test("returns .env.manifest.yaml", () => {
    expect(getManifestFilename()).toBe(".env.manifest.yaml");
  });
});
