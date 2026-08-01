import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { filterForAI } from "./filter";
import type { Manifest } from "./types";

const MAGIC = Buffer.from("EVB1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_KEEP = 20;
const DEFAULT_MAX_AGE_DAYS = 30;

export interface SnapshotMetadata {
  id: string;
  createdAt: string;
  reason: string;
  encrypted: boolean;
  size: number;
}

export interface SnapshotDiffEntry {
  key: string;
  change: "added" | "removed" | "changed";
  snapshotValue?: string;
  currentValue?: string;
}

export interface PruneResult {
  removed: string[];
  kept: string[];
}

export interface SnapshotStore {
  list(): Promise<SnapshotMetadata[]>;
  put(content: string, reason: string): Promise<SnapshotMetadata | null>;
  get(id: string): Promise<string>;
  prune(options?: { keep?: number; maxAgeDays?: number }): Promise<PruneResult>;
}

export interface LocalSnapshotStoreOptions {
  projectDir?: string;
  encrypt?: boolean;
  keyPath?: string;
  now?: () => Date;
}

function slugReason(reason: string): string {
  const slug = reason
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return slug || "snapshot";
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseSnapshotName(id: string): Pick<SnapshotMetadata, "createdAt" | "reason"> {
  const match = /^(.*?)__(.*?)\.env\.enc$/.exec(id);
  if (!match?.[1] || !match[2]) throw new Error(`Invalid snapshot id: ${id}`);
  const timestamp = match[1].replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/,
    "$1:$2:$3.$4",
  );
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid snapshot timestamp: ${id}`);
  return { createdAt: date.toISOString(), reason: match[2] };
}

function parseEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class LocalSnapshotStore implements SnapshotStore {
  readonly projectDir: string;
  readonly rootDir: string;
  readonly backupDir: string;
  readonly keyPath: string;
  readonly encrypt: boolean;
  private readonly now: () => Date;

  constructor(options: LocalSnapshotStoreOptions = {}) {
    this.projectDir = resolve(options.projectDir ?? process.cwd());
    this.rootDir = join(this.projectDir, ".envibe");
    this.backupDir = join(this.rootDir, "backups");
    this.keyPath = options.keyPath ?? process.env.ENVIBE_KEY_PATH ?? join(homedir(), ".envibe", "key");
    this.encrypt = options.encrypt ?? true;
    this.now = options.now ?? (() => new Date());
  }

  async ensureBackupDir(): Promise<void> {
    await mkdir(this.backupDir, { recursive: true, mode: 0o700 });
    await chmod(this.rootDir, 0o700);
    await chmod(this.backupDir, 0o700);
    const ignorePath = join(this.rootDir, ".gitignore");
    await writeFile(ignorePath, "*\n", { mode: 0o600 });
    await chmod(ignorePath, 0o600);
  }

  private async snapshotFiles(): Promise<string[]> {
    try {
      return (await readdir(this.backupDir))
        .filter((name) => name.endsWith(".env.enc"))
        .sort()
        .reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private pathFor(id: string): string {
    if (basename(id) !== id || !id.endsWith(".env.enc")) {
      throw new Error(`Invalid snapshot id: ${id}`);
    }
    return join(this.backupDir, id);
  }

  private async readKey(create: boolean): Promise<Buffer> {
    try {
      const key = await readFile(this.keyPath);
      if (key.length !== 32) throw new Error(`Invalid envibe backup key at ${this.keyPath}; expected 32 bytes.`);
      return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (!create) {
        throw new Error(
          `Encrypted envibe snapshots exist but the machine-local key is missing at ${this.keyPath}. Restore the original key backup; generating a new key cannot decrypt existing snapshots.`,
        );
      }
      await mkdir(dirname(this.keyPath), { recursive: true, mode: 0o700 });
      const key = randomBytes(32);
      await writeFile(this.keyPath, key, { mode: 0o600, flag: "wx" }).catch(async (writeError) => {
        if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
      });
      await chmod(this.keyPath, 0o600);
      return readFile(this.keyPath);
    }
  }

  private async encode(content: string): Promise<Buffer> {
    if (!this.encrypt) return Buffer.from(content, "utf8");
    const existing = await this.snapshotFiles();
    const key = await this.readKey(existing.length === 0);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
  }

  private async decode(data: Buffer): Promise<string> {
    if (!data.subarray(0, MAGIC.length).equals(MAGIC)) return data.toString("utf8");
    const key = await this.readKey(false);
    const iv = data.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = data.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
    const encrypted = data.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  async list(): Promise<SnapshotMetadata[]> {
    const names = await this.snapshotFiles();
    return Promise.all(names.map(async (id) => {
      const info = await stat(this.pathFor(id));
      const head = await readFile(this.pathFor(id)).then((data) => data.subarray(0, MAGIC.length));
      return { id, ...parseSnapshotName(id), encrypted: head.equals(MAGIC), size: info.size };
    }));
  }

  async put(content: string, reason: string): Promise<SnapshotMetadata | null> {
    await this.ensureBackupDir();
    const [newest] = await this.list();
    if (newest && safeEqual(await this.get(newest.id), content)) return null;
    const id = `${timestampForFile(this.now())}__${slugReason(reason)}.env.enc`;
    const path = this.pathFor(id);
    const encoded = await this.encode(content);
    await writeFile(path, encoded, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600);
    await this.prune();
    const metadata = (await this.list()).find((item) => item.id === id);
    if (!metadata) throw new Error(`Snapshot was written but could not be listed: ${id}`);
    return metadata;
  }

  async get(id: string): Promise<string> {
    try {
      return await this.decode(await readFile(this.pathFor(id)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Unknown snapshot id: ${id}`);
      throw error;
    }
  }

  async prune(options: { keep?: number; maxAgeDays?: number } = {}): Promise<PruneResult> {
    const snapshots = await this.list();
    const keep = Math.max(1, options.keep ?? DEFAULT_KEEP);
    const maxAgeMs = Math.max(0, options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86_400_000;
    const now = this.now().getTime();
    const removed: string[] = [];
    for (let index = 1; index < snapshots.length; index++) {
      const snapshot = snapshots[index]!;
      const tooMany = index >= keep;
      const tooOld = now - new Date(snapshot.createdAt).getTime() > maxAgeMs;
      if (tooMany || tooOld) {
        await unlink(this.pathFor(snapshot.id));
        removed.push(snapshot.id);
      }
    }
    return { removed, kept: snapshots.map((item) => item.id).filter((id) => !removed.includes(id)) };
  }

  async resolve(selector: string): Promise<SnapshotMetadata> {
    const snapshots = await this.list();
    const snapshot = selector === "latest"
      ? snapshots[0]
      : /^\d+$/.test(selector)
        ? snapshots[Number(selector)]
        : snapshots.find((item) => item.id === selector);
    if (!snapshot) throw new Error(`Unknown snapshot: ${selector}`);
    return snapshot;
  }
}

export async function createSnapshot(
  reason: string,
  options: LocalSnapshotStoreOptions & { envPath?: string } = {},
): Promise<SnapshotMetadata | null> {
  const envPath = options.envPath ?? ".env";
  if (basename(envPath) === ".env.ai") return null;
  const absoluteEnv = isAbsolute(envPath) ? envPath : resolve(options.projectDir ?? process.cwd(), envPath);
  try {
    const content = await readFile(absoluteEnv, "utf8");
    return new LocalSnapshotStore({ ...options, projectDir: dirname(absoluteEnv) }).put(content, reason);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function diffSnapshot(
  store: LocalSnapshotStore,
  id: string,
  manifest: Manifest,
  envPath = ".env",
): Promise<SnapshotDiffEntry[]> {
  const before = parseEnv(await store.get(id));
  let after: Record<string, string> = {};
  try { after = parseEnv(await readFile(envPath, "utf8")); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const beforeSafe = new Map(filterForAI(before, manifest).map((item) => [item.key, item.displayValue]));
  const afterSafe = new Map(filterForAI(after, manifest).map((item) => [item.key, item.displayValue]));
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap((key) => {
    if (before[key] === after[key]) return [];
    const change = before[key] === undefined ? "added" : after[key] === undefined ? "removed" : "changed";
    return [{ key, change, snapshotValue: beforeSafe.get(key), currentValue: afterSafe.get(key) }];
  });
}

export async function restoreSnapshot(
  store: LocalSnapshotStore,
  id: string,
  envPath = ".env",
): Promise<{ safetySnapshot: SnapshotMetadata | null; changedKeys: string[] }> {
  const target = await store.get(id);
  let current = "";
  try { current = await readFile(envPath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const safetySnapshot = await store.put(current, `pre-restore-${id}`) ?? (await store.list())[0] ?? null;
  const before = parseEnv(current);
  const after = parseEnv(target);
  await writeFile(envPath, target, { mode: 0o600 });
  await chmod(envPath, 0o600);
  const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort();
  return { safetySnapshot, changedKeys };
}
