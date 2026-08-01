import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import {
  LocalSnapshotStore,
  diffSnapshot,
  restoreSnapshot,
} from "../../core/backup";
import { filterForAI, generateAIEnvContent } from "../../core/filter";
import { loadManifest } from "../../core/manifest";
import { getAIEnvFilename, loadEnvFile } from "../../utils/dotenv";
import { write } from "../../utils/file";

export const restoreCommand = new Command("restore")
  .description("Restore a local .env snapshot")
  .argument("[snapshot]", "Snapshot id, zero-based index, or latest")
  .option("--from-provider <id>", "Reserved external secret provider id")
  .option("--dry-run", "Show a manifest-safe key-level diff without restoring")
  .option("--yes", "Skip interactive confirmation")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (selector: string | undefined, options) => {
    if (options.fromProvider) {
      throw new Error(`Secret provider '${options.fromProvider}' is reserved for a future release; v0.3.0 supports local snapshots only.`);
    }
    if (!selector) throw new Error("A snapshot id, index, or 'latest' is required.");
    const envPath = resolve(options.env);
    const projectDir = dirname(envPath);
    const manifest = await loadManifest(projectDir);
    const store = new LocalSnapshotStore({ projectDir, encrypt: manifest.backup?.encrypt !== false });
    const snapshot = await store.resolve(selector);
    const changes = await diffSnapshot(store, snapshot.id, manifest, envPath);
    console.log(JSON.stringify({ snapshot: snapshot.id, changes }, null, 2));
    if (options.dryRun) return;

    if (!options.yes) {
      const prompt = createInterface({ input, output });
      const answer = await prompt.question(`Restore ${snapshot.id}? A safety snapshot will be created. [y/N] `);
      prompt.close();
      if (!/^y(es)?$/i.test(answer.trim())) return console.log("Restore cancelled.");
    }

    const result = await restoreSnapshot(store, snapshot.id, envPath);
    const { variables } = await loadEnvFile(envPath);
    await write(resolve(projectDir, getAIEnvFilename()), generateAIEnvContent(filterForAI(variables, manifest)));
    console.log(`Restored ${snapshot.id}. Changed keys: ${result.changedKeys.join(", ") || "none"}.`);
    console.log(`Safety snapshot: ${result.safetySnapshot?.id ?? "none (previous .env was absent or identical)"}`);
  });

