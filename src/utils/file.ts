/**
 * Cross-runtime file utilities
 * Works with both Bun and Node.js
 */
import { readFile, writeFile, access } from "node:fs/promises";

/**
 * File handle compatible with Bun.file() interface
 */
export interface FileHandle {
  exists(): Promise<boolean>;
  text(): Promise<string>;
}

/**
 * Create a file handle (compatible with Bun.file())
 */
export function createFile(path: string): FileHandle {
  return {
    async exists(): Promise<boolean> {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async text(): Promise<string> {
      return readFile(path, "utf-8");
    },
  };
}

/**
 * Write content to a file (compatible with Bun.write())
 */
export async function write(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
}
