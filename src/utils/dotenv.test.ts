import { test, expect, describe } from "bun:test";
import {
  parseEnvContent,
  serializeEnv,
  getEnvFilename,
  getAIEnvFilename,
} from "./dotenv";

describe("parseEnvContent", () => {
  test("parses simple key=value pairs", () => {
    const content = "KEY=value\nANOTHER=test";
    const result = parseEnvContent(content);
    expect(result.KEY).toBe("value");
    expect(result.ANOTHER).toBe("test");
  });

  test("ignores comment lines", () => {
    const content = "# This is a comment\nKEY=value\n# Another comment";
    const result = parseEnvContent(content);
    expect(result.KEY).toBe("value");
    expect(Object.keys(result)).toHaveLength(1);
  });

  test("handles inline comments", () => {
    const content = "KEY=value # inline comment";
    const result = parseEnvContent(content);
    expect(result.KEY).toBe("value");
  });

  test("preserves inline comments in quoted values", () => {
    const content = 'KEY="value # not a comment"';
    const result = parseEnvContent(content);
    expect(result.KEY).toBe("value # not a comment");
  });

  test("handles double-quoted values with spaces", () => {
    const content = 'MESSAGE="hello world"';
    const result = parseEnvContent(content);
    expect(result.MESSAGE).toBe("hello world");
  });

  test("handles single-quoted values", () => {
    const content = "MESSAGE='hello world'";
    const result = parseEnvContent(content);
    expect(result.MESSAGE).toBe("hello world");
  });

  test("handles escape sequences in double quotes", () => {
    const content = 'MULTI="line1\\nline2"';
    const result = parseEnvContent(content);
    expect(result.MULTI).toBe("line1\nline2");
  });

  test("handles escaped backslash", () => {
    // Note: The current implementation has a known edge case with \t in paths
    // This test verifies current behavior
    const content = 'PATH="C:\\\\path"';
    const result = parseEnvContent(content);
    expect(result.PATH).toBe("C:\\path");
  });

  test("handles escaped quote", () => {
    const content = 'MSG="say \\"hello\\""';
    const result = parseEnvContent(content);
    expect(result.MSG).toBe('say "hello"');
  });

  test("handles carriage return escape", () => {
    const content = 'TEXT="line1\\rline2"';
    const result = parseEnvContent(content);
    expect(result.TEXT).toBe("line1\rline2");
  });

  test("handles tab escape", () => {
    const content = 'TEXT="col1\\tcol2"';
    const result = parseEnvContent(content);
    expect(result.TEXT).toBe("col1\tcol2");
  });

  test("handles empty lines", () => {
    const content = "KEY1=value1\n\n\nKEY2=value2";
    const result = parseEnvContent(content);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.KEY1).toBe("value1");
    expect(result.KEY2).toBe("value2");
  });

  test("handles whitespace around equals", () => {
    const content = "KEY = value";
    const result = parseEnvContent(content);
    expect(result.KEY).toBe("value");
  });

  test("handles lines without equals", () => {
    const content = "INVALID_LINE\nKEY=value";
    const result = parseEnvContent(content);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result.KEY).toBe("value");
  });

  test("handles empty value", () => {
    const content = "EMPTY=";
    const result = parseEnvContent(content);
    expect(result.EMPTY).toBe("");
  });

  test("handles empty quoted value", () => {
    const content = 'EMPTY=""';
    const result = parseEnvContent(content);
    expect(result.EMPTY).toBe("");
  });

  test("handles value with equals sign", () => {
    const content = "URL=https://example.com?foo=bar";
    const result = parseEnvContent(content);
    expect(result.URL).toBe("https://example.com?foo=bar");
  });

  test("handles empty content", () => {
    const result = parseEnvContent("");
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("handles content with only comments", () => {
    const content = "# Comment 1\n# Comment 2";
    const result = parseEnvContent(content);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("serializeEnv", () => {
  test("serializes simple values", () => {
    const env = { KEY: "value" };
    expect(serializeEnv(env)).toBe("KEY=value\n");
  });

  test("serializes multiple values", () => {
    const env = { A: "1", B: "2" };
    const result = serializeEnv(env);
    expect(result).toContain("A=1");
    expect(result).toContain("B=2");
  });

  test("quotes values with spaces", () => {
    const env = { MESSAGE: "hello world" };
    const result = serializeEnv(env);
    expect(result).toContain('"hello world"');
  });

  test("quotes values with hash", () => {
    const env = { COMMENT: "value # not a comment" };
    const result = serializeEnv(env);
    expect(result).toContain('"value # not a comment"');
  });

  test("escapes newlines", () => {
    const env = { MULTI: "line1\nline2" };
    const result = serializeEnv(env);
    expect(result).toContain("\\n");
  });

  test("escapes carriage returns when quoted", () => {
    // serializeEnv only quotes when value contains space, hash, newline, or quotes
    // carriage return alone doesn't trigger quoting, so it's not escaped
    const env = { TEXT: "line1\rline2 with space" }; // space triggers quoting
    const result = serializeEnv(env);
    expect(result).toContain("\\r");
  });

  test("escapes tabs when quoted", () => {
    // tabs alone don't trigger quoting, need another trigger
    const env = { TEXT: "col1\tcol2 with space" }; // space triggers quoting
    const result = serializeEnv(env);
    expect(result).toContain("\\t");
  });

  test("escapes backslashes when quoted", () => {
    // backslashes alone don't trigger quoting, need another trigger
    const env = { PATH: "C:\\Users with space" }; // space triggers quoting
    const result = serializeEnv(env);
    expect(result).toContain("\\\\");
  });

  test("escapes quotes in quoted values", () => {
    const env = { MSG: 'say "hello"' };
    const result = serializeEnv(env);
    expect(result).toContain('\\"');
  });

  test("handles empty env", () => {
    const result = serializeEnv({});
    expect(result).toBe("\n");
  });

  test("ends with newline", () => {
    const env = { KEY: "value" };
    const result = serializeEnv(env);
    expect(result.endsWith("\n")).toBe(true);
  });
});

describe("round-trip", () => {
  test("parse and serialize are inverse operations", () => {
    const original = "KEY=value\nANOTHER=test\n";
    const parsed = parseEnvContent(original);
    const serialized = serializeEnv(parsed);
    const reparsed = parseEnvContent(serialized);
    expect(reparsed).toEqual(parsed);
  });

  test("handles values that trigger quoting", () => {
    const env = {
      SIMPLE: "value",
      SPACED: "hello world",
      MULTILINE: "line1\nline2",
      QUOTED: 'say "hi"',
    };
    const serialized = serializeEnv(env);
    const parsed = parseEnvContent(serialized);
    expect(parsed).toEqual(env);
  });
});

describe("getEnvFilename", () => {
  test("returns .env", () => {
    expect(getEnvFilename()).toBe(".env");
  });
});

describe("getAIEnvFilename", () => {
  test("returns .env.ai", () => {
    expect(getAIEnvFilename()).toBe(".env.ai");
  });
});
