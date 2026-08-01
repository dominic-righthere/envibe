import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LocalSnapshotStore,
  diffSnapshot,
  restoreSnapshot,
} from "./backup";
import { AccessLevel, type Manifest } from "./types";

let fixture: string;
let keyPath: string;

beforeEach(async () => {
  fixture = await mkdtemp(join(tmpdir(), "envibe-backup-"));
  keyPath = join(fixture, "machine", "key");
});

afterEach(async () => {
  await rm(fixture, { recursive: true, force: true });
});

describe("LocalSnapshotStore", () => {
  test("encrypts/decrypts, uses safe names, and applies restrictive modes", async () => {
    const store = new LocalSnapshotStore({
      projectDir: fixture,
      keyPath,
      now: () => new Date("2026-07-24T01:02:03.456Z"),
    });
    const snapshot = await store.put("SECRET=top-secret\n", "Before CLI set: API_KEY");
    expect(snapshot?.id).toBe("2026-07-24T01-02-03-456Z__before-cli-set-api-key.env.enc");
    expect(await store.get(snapshot!.id)).toBe("SECRET=top-secret\n");
    expect((await readFile(join(store.backupDir, snapshot!.id))).includes(Buffer.from("top-secret"))).toBe(false);
    expect((await stat(store.rootDir)).mode & 0o777).toBe(0o700);
    expect((await stat(store.backupDir)).mode & 0o777).toBe(0o700);
    expect((await stat(join(store.backupDir, snapshot!.id))).mode & 0o777).toBe(0o600);
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(join(store.rootDir, ".gitignore"), "utf8")).toBe("*\n");
  });

  test("supports explicit plaintext opt-out and skips identical newest content", async () => {
    let now = new Date("2026-07-24T01:00:00.000Z");
    const store = new LocalSnapshotStore({ projectDir: fixture, encrypt: false, now: () => now });
    const first = await store.put("A=1\n", "first");
    now = new Date("2026-07-24T01:00:01.000Z");
    expect(await store.put("A=1\n", "duplicate")).toBeNull();
    expect((await store.list())[0]?.encrypted).toBe(false);
    expect(await readFile(join(store.backupDir, first!.id), "utf8")).toBe("A=1\n");
  });

  test("fails actionably when the machine key for encrypted snapshots is missing", async () => {
    const store = new LocalSnapshotStore({ projectDir: fixture, keyPath });
    const snapshot = await store.put("A=1\n", "first");
    await unlink(keyPath);
    expect(store.get(snapshot!.id)).rejects.toThrow("Restore the original key backup");
    expect(store.put("A=2\n", "second")).rejects.toThrow("Encrypted envibe snapshots exist");
  });

  test("prunes by count and age without deleting the sole newest snapshot", async () => {
    let now = new Date("2026-05-01T00:00:00.000Z");
    const store = new LocalSnapshotStore({ projectDir: fixture, encrypt: false, now: () => now });
    for (let index = 0; index < 4; index++) {
      await store.put(`A=${index}\n`, `item-${index}`);
      now = new Date(now.getTime() + 86_400_000 * 11);
    }
    const result = await store.prune({ keep: 2, maxAgeDays: 15 });
    expect(result.kept).toHaveLength(1);
    expect(result.removed).toHaveLength(2);
    expect((await store.list())[0]?.reason).toBe("item-3");

    const onlyStore = new LocalSnapshotStore({ projectDir: join(fixture, "only"), encrypt: false, now: () => now });
    await onlyStore.put("ONLY=1\n", "ancient");
    now = new Date(now.getTime() + 86_400_000 * 100);
    expect((await onlyStore.prune({ keep: 1, maxAgeDays: 0 })).kept).toHaveLength(1);
  });

  test("diff masks protected values and restore creates a safety snapshot", async () => {
    let now = new Date("2026-07-24T01:00:00.000Z");
    const store = new LocalSnapshotStore({ projectDir: fixture, keyPath, now: () => now });
    const envPath = join(fixture, ".env");
    await writeFile(envPath, "VISIBLE=old\nMASKED=old-secret\nHIDDEN=hidden-old\n");
    const target = await store.put(await readFile(envPath, "utf8"), "target");
    now = new Date("2026-07-24T01:00:01.000Z");
    await writeFile(envPath, "VISIBLE=new\nMASKED=new-secret\nHIDDEN=hidden-new\nADDED=value\n");
    const manifest: Manifest = {
      version: 1,
      variables: {
        VISIBLE: { access: AccessLevel.FULL },
        MASKED: { access: AccessLevel.PLACEHOLDER },
        HIDDEN: { access: AccessLevel.HIDDEN },
        ADDED: { access: AccessLevel.PLACEHOLDER },
      },
    };
    const diff = await diffSnapshot(store, target!.id, manifest, envPath);
    expect(JSON.stringify(diff)).not.toContain("old-secret");
    expect(JSON.stringify(diff)).not.toContain("new-secret");
    expect(JSON.stringify(diff)).not.toContain("hidden-old");
    expect(diff.find((item) => item.key === "MASKED")?.snapshotValue).toBe("<MASKED>");

    const restored = await restoreSnapshot(store, target!.id, envPath);
    expect(restored.safetySnapshot?.reason).toContain("pre-restore");
    expect(restored.changedKeys).toEqual(["ADDED", "HIDDEN", "MASKED", "VISIBLE"]);
    expect(await readFile(envPath, "utf8")).toContain("VISIBLE=old");
    expect((await store.list()).length).toBe(2);
  });
});
