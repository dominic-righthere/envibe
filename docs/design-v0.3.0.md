# envibe v0.3.0 design

## Context

envibe is the permission and recovery layer between AI coding agents and `.env`
files. It addresses two concrete failures in agent-assisted development:

1. agents either receive all secrets or cannot use environment configuration at
   all; and
2. agents can overwrite or delete `.env` without a recoverable copy.

The first problem is substantially addressed by the existing manifest, five
access levels, generated `.env.ai`, and MCP tools. The second is not yet
implemented. Development has also drifted across `aienv` (the canonical
`envibe` package) and `aienv-mcp` (the newer MCP extraction).

The v0.3.0 release consolidates the repositories, adds secure local recovery,
extends protection beyond Claude Code, and publishes one package through npm
and the MCP registry.

## Product and architecture decisions

- `aienv` is the canonical repository and publishes the `envibe` package.
- One package ships two binaries: `envibe` and `envibe-mcp`.
- The MCP registry name remains `io.github.dominic-righthere/envibe`.
- Backup encryption is enabled by default, with a machine-local key outside the
  repository and an explicit plaintext opt-out.
- v0.3.0 provides a local snapshot store and reserves a provider seam. Choosing
  and implementing an external secret provider is separate follow-up work.
- Agent integrations must use merge-preserving, idempotent configuration.
- The full release ships once, after consolidation, backup/restore, and
  multi-agent work are complete.

## Phase 1: consolidation and hardening

### Port the MCP-only functionality

- Port `env_check_gitignore` from `aienv-mcp`.
- Introduce `src/core/gitignore.ts` as the single source of truth for `.env`,
  `.env.*`, `!.env.example`, and `!.env.manifest.yaml`.
- Make setup write the canonical patterns. The checker must accept the exact
  set, treat safe equivalent supersets as valid with a warning, and reject
  missing required coverage.
- Port `server.json`, preserving the registry name while changing the repository
  and package identifier to `envibe`, setting version `0.3.0`, and supplying a
  positional `mcp` package argument.
- Port the registry publishing workflow, adapt it to Bun, require package,
  server, and tag versions to match, publish npm first, then publish the registry
  record.

### Refactor the MCP server

Split the monolithic server into:

- `src/mcp/setup.ts`: `ensureSetup`, `FALLBACK_MANIFEST`, and bootstrap logic;
- `src/mcp/tools.ts`: `TOOL_DEFINITIONS`, named handlers, and `callTool`;
- `src/mcp/resources.ts`: resource definitions and reads;
- `src/mcp/server.ts`: MCP protocol wiring only; and
- `src/mcp/bin.ts`: executable stdio entry point.

Tests must call the real handlers rather than duplicate their implementation.

### Package and versioning

- Ship `envibe` at `dist/cli/index.js` and `envibe-mcp` at
  `dist/mcp/bin.js`.
- Build both entry points for Node and emit TypeScript declarations.
- Remove the stale `bin/aienv` launcher.
- Set package and server versions to `0.3.0` and import the package version into
  both CLI and MCP identities instead of hardcoding it.
- Add `mcpName: io.github.dominic-righthere/envibe`.

### Hardening and compatibility

- Add an MIT license with Forthrim copyright.
- Rebrand templates from `aienv` to `envibe` and use the real repository URL.
- Remove the broken pre-tool hook that invokes nonexistent `aienv export`.
- Store project MCP registration in `.mcp.json`; keep Claude permissions in
  `.claude/settings.json`.
- CI runs typechecking and tests, then builds and launches both binaries under
  Node 18, 20, and 22. The stdio MCP smoke test uses the built binary.

## Phase 2: secure backup and restore

### Storage and provider seams

Define:

- `SnapshotStore`: list, put, get, and prune snapshots; and
- `SecretProvider`: identify, detect, pull, and optionally push secrets.

v0.3.0 implements only `LocalSnapshotStore`. It stores snapshots under
`.envibe/backups`, creates directories with mode `0700`, files with mode `0600`,
and writes `.envibe/.gitignore` containing `*`.

Reserve a manifest `provider: { type, config }` block and the CLI shape
`envibe restore --from-provider <id>`, but do not choose or implement an
external provider in this release.

### Encryption and snapshot behavior

- Encrypt snapshots by default using AES-256-GCM from `node:crypto`.
- Generate a machine-local key at `~/.envibe/key` with mode `0600`.
- Permit `backup: { encrypt: false }` in the manifest.
- Fail with an actionable error when encrypted snapshots exist but the key is
  missing.
- Name snapshots using Windows-safe timestamps and reason slugs.
- Skip snapshots identical to the newest copy.
- Keep the newest 20 snapshots and at most 30 days by default, without deleting
  the only newest snapshot.
- Always take a pre-restore safety snapshot before changing `.env`.
- Diff at the key level and mask values through the manifest access policy.

### Wiring and interfaces

Snapshot at the primitive mutation layer so call sites cannot forget. MCP and
CLI calls supply per-key reasons. Skip derived `.env.ai`. MCP startup, setup,
and generate create a deduplicated session snapshot.

Add CLI commands for backup list/create/prune and restore with dry-run,
confirmation, and alternate environment path options. Add MCP tools
`env_backup_list`, `env_backup_diff`, and `env_restore`; restore requires an
explicit snapshot id and returns changed key names only.

Exclude `.envibe/` in gitignore output and every agent read/write/shell deny
configuration.

## Phase 3: multi-agent support

Create a typed adapter layer for Claude Code, Cursor, Codex, and Gemini. Guidance
content is embedded in TypeScript so bundled execution does not depend on
runtime template files.

- Claude writes permissions, `.mcp.json`, and a distributable envibe skill.
- Cursor writes `.cursorignore`, an always-on rule, and merged MCP config.
- Codex writes a marker-delimited block in `AGENTS.md` and prints the MCP add
  command.
- Gemini writes `.geminiignore`, merged settings, and a marker-delimited
  `GEMINI.md` block.

`envibe setup --agents <auto|all|list>` configures adapters; `envibe agents`
reports their status. All adapters are detection-aware, merge-preserving, and
idempotent, and all exclude `.envibe/`.

## Phase 4: release, deprecation, and archive

- Rewrite the README around permission plus recovery, document every CLI and MCP
  interface, use `npx envibe mcp` as the canonical launch command, and attribute
  the project to Forthrim Labs.
- Publish `envibe@0.3.0` to npm before publishing the MCP registry record.
- Verify both binaries, an MCP initialize handshake, and launch from a
  registry-consuming client.
- Publish `envibe-mcp@0.3.0` as a thin wrapper around `envibe`, then deprecate it
  with migration guidance and archive its repository. Existing installations
  must continue to launch.
- Return implementation evidence to Forthrim Ops and record adoption metrics as
  protected Forthrim projects begin daily use.

## Verification gates

- `bun run typecheck`, `bun test`, and `bun run build` pass.
- Built CLI and MCP binaries launch under supported Node versions.
- Setup is idempotent and preserves unrelated user configuration.
- A scratch project exercises all MCP tools without revealing hidden or
  placeholder values.
- Backup encryption, permissions, retention, restore safety, and missing-key
  failures have direct tests.
- A corrupted `.env` is recovered end to end and the safety snapshot remains.
- Published npm, wrapper, and registry invocations work exactly as documented.

## Risks

- Node compatibility is proven by executing built artifacts, not source tests.
- Registry `packageArguments: [{ type: "positional", value: "mcp" }]` is
  load-bearing because bare `npx envibe` intentionally prints CLI help.
- Local backups concentrate secrets, so encryption, a separate key, restrictive
  permissions, self-ignore, and agent deny rules are jointly mandatory.
- Losing `~/.envibe/key` loses access to encrypted backups; errors and docs must
  state this clearly.
- Restore of stale data is mitigated by explicit-id and diff-first behavior plus
  an unconditional pre-restore safety snapshot.
