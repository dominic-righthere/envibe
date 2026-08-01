export const REQUIRED_GITIGNORE_PATTERNS = [
  ".env",
  ".env.*",
  "!.env.example",
  "!.env.manifest.yaml",
] as const;

export interface GitignoreCheckResult {
  valid: boolean;
  issues: string[];
  passed: string[];
  warnings: string[];
}

function meaningfulLines(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

export function checkGitignoreContent(content: string): GitignoreCheckResult {
  const lines = new Set(meaningfulLines(content));
  const issues: string[] = [];
  const passed: string[] = [];

  for (const pattern of REQUIRED_GITIGNORE_PATTERNS) {
    if (lines.has(pattern)) {
      passed.push(`${pattern} is present`);
    } else {
      issues.push(`Missing '${pattern}' pattern`);
    }
  }

  const extras = [...lines].filter(
    (line) =>
      (line === ".env.ai" || line.startsWith(".env")) &&
      !REQUIRED_GITIGNORE_PATTERNS.includes(
        line as (typeof REQUIRED_GITIGNORE_PATTERNS)[number],
      ),
  );
  const warnings =
    issues.length === 0 && extras.length > 0
      ? [`Safe required coverage is present with additional patterns: ${extras.join(", ")}`]
      : [];

  return { valid: issues.length === 0, issues, passed, warnings };
}
