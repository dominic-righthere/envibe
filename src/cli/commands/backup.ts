import { Command } from "commander";
import { dirname, resolve } from "node:path";
import { LocalSnapshotStore, createSnapshot } from "../../core/backup";
import { loadManifest } from "../../core/manifest";

async function storeFor(envPath = ".env"): Promise<LocalSnapshotStore> {
  const absolute = resolve(envPath);
  let encrypt = true;
  try { encrypt = (await loadManifest(dirname(absolute))).backup?.encrypt !== false; } catch {}
  return new LocalSnapshotStore({ projectDir: dirname(absolute), encrypt });
}

export const backupCommand = new Command("backup")
  .description("Create, list, and prune local .env snapshots");

backupCommand.command("list")
  .description("List snapshot metadata (never contents)")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (options) => {
    const snapshots = await (await storeFor(options.env)).list();
    if (snapshots.length === 0) return console.log("No snapshots found.");
    snapshots.forEach((item, index) => console.log(`${index}\t${item.id}\t${item.reason}\t${item.size} bytes\t${item.encrypted ? "encrypted" : "plaintext"}`));
  });

backupCommand.command("create")
  .description("Create a deduplicated snapshot")
  .option("-r, --reason <reason>", "Snapshot reason", "manual")
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (options) => {
    const absolute = resolve(options.env);
    let encrypt = true;
    try { encrypt = (await loadManifest(dirname(absolute))).backup?.encrypt !== false; } catch {}
    const snapshot = await createSnapshot(options.reason, { projectDir: dirname(absolute), envPath: absolute, encrypt });
    console.log(snapshot ? `Created ${snapshot.id}` : "No snapshot created (missing or identical to newest).");
  });

backupCommand.command("prune")
  .description("Apply snapshot retention")
  .option("--keep <count>", "Maximum newest snapshots", (value) => Number.parseInt(value, 10), 20)
  .option("--max-age-days <days>", "Maximum snapshot age", (value) => Number.parseInt(value, 10), 30)
  .option("-e, --env <path>", "Path to .env file", ".env")
  .action(async (options) => {
    const result = await (await storeFor(options.env)).prune({ keep: options.keep, maxAgeDays: options.maxAgeDays });
    console.log(`Removed ${result.removed.length}; kept ${result.kept.length}.`);
  });

