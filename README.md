# envibe

[![npm version](https://img.shields.io/npm/v/envibe.svg)](https://www.npmjs.com/package/envibe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The missing permission layer between AI agents and your .env**

---

## The Problem

AI coding assistants (Claude Code, Cursor, Copilot) need your environment variables to run and test code. But they can see **everything**—API keys, database passwords, payment secrets.

It's all-or-nothing. Until now.

## The Solution

`envibe` gives you **per-variable access control** with 5 levels:

| Level | AI Can See | AI Can Modify | Example |
|-------|-----------|---------------|---------|
| `full` | Actual value | Yes | `NODE_ENV`, `PORT`, `DEBUG` |
| `read-only` | Actual value | No | `DATABASE_URL` |
| `placeholder` | `<VAR_NAME>` | No | `API_KEY` |
| `schema-only` | Format only | No | Complex configs |
| `hidden` | Nothing | No | `STRIPE_SECRET_KEY` |

## Quick Start

Add envibe as an MCP server to your AI tool:

```json
{
  "mcpServers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```

On first use, envibe automatically:
1. Creates `.env.manifest.yaml` from your `.env.example`
2. Generates `.env.ai` (filtered view for AI)
3. Blocks direct `.env` file access
4. Creates an encrypted, deduplicated `.env` snapshot

Snapshots live in `.envibe/backups/` and are encrypted by default with a
machine-local key at `~/.envibe/key`. Back up that key separately: encrypted
snapshots cannot be recovered if it is lost.

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Your .env (secrets)                                        │
│  ├── STRIPE_SECRET_KEY=sk_live_xxx    ← hidden from AI      │
│  ├── DATABASE_URL=postgres://...       ← AI can read        │
│  └── DEBUG=true                        ← AI can read/write  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  .env.manifest.yaml (access rules)                          │
│  variables:                                                 │
│    STRIPE_SECRET_KEY: { access: hidden }                    │
│    DATABASE_URL: { access: read-only }                      │
│    DEBUG: { access: full }                                  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  .env.ai (what AI sees)                                     │
│  DEBUG=true                    # [full]                     │
│  DATABASE_URL=postgres://...   # [read-only]                │
│  # STRIPE_SECRET_KEY hidden                                 │
└─────────────────────────────────────────────────────────────┘
```

## Example Manifest

```yaml
# .env.manifest.yaml
version: 1
variables:
  NODE_ENV:
    access: full
    description: "Environment mode"

  DATABASE_URL:
    access: read-only
    description: "Database connection string"

  OPENAI_API_KEY:
    access: placeholder
    description: "OpenAI API key"

  STRIPE_SECRET_KEY:
    access: hidden
    description: "Payment processing - never expose"
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `envibe setup` | Full setup (recommended) |
| `envibe setup -i` | Interactive mode - choose access levels |
| `envibe generate` | Regenerate `.env.ai` |
| `envibe view` | Display variables with access levels |
| `envibe mcp` | Start MCP server |
| `envibe backup list` | List snapshot metadata (never contents) |
| `envibe backup create --reason <reason>` | Create a deduplicated snapshot |
| `envibe backup prune --keep 20 --max-age-days 30` | Apply retention |
| `envibe restore <id\|index\|latest> --dry-run` | Preview a masked key-level diff |
| `envibe restore <id\|index\|latest> --yes` | Restore after creating a safety snapshot |

Encryption is on by default. Local plaintext snapshots can be explicitly
enabled in `.env.manifest.yaml` with `backup: { encrypt: false }`.

## Installation

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add envibe npx envibe-mcp
```

Or add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Claude Desktop</b></summary>

Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```

Config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
</details>

<details>
<summary><b>VS Code (Copilot/Continue)</b></summary>

Add to your VS Code `settings.json`:
```json
{
  "mcp.servers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

Add to Cursor MCP settings:
```json
{
  "mcpServers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>Windsurf</b></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "envibe": {
      "command": "npx",
      "args": ["envibe-mcp"]
    }
  }
}
```
</details>

<details>
<summary><b>CLI (standalone)</b></summary>

```bash
# Install globally
npm install -g envibe

# Run setup
envibe setup
```
</details>

## MCP Tools

| Tool | Description |
|------|-------------|
| `env_list` | List visible variables with access levels |
| `env_get` | Get a variable's value (respects permissions) |
| `env_set` | Set a variable (only `full` access) |
| `env_describe` | Get detailed info including format and example |
| `env_check_required` | Check which required variables are missing |
| `env_blind_set` | Set protected writable variables without reading them |
| `env_check_gitignore` | Validate secret and backup exclusions |
| `env_backup_list` | List snapshot metadata without contents |
| `env_backup_diff` | Compare an explicit snapshot id with masked values |
| `env_restore` | Restore an explicit snapshot id and report changed key names |

### v0.2.0 Features

- **Better error messages** - When access is denied, get helpful guidance
- **Format hints** - Know what format a variable should be (url, key, number, etc.)
- **Required var checking** - Use `env_check_required` to guide users through setup

## Why envibe?

| Approach | Problem |
|----------|---------|
| **dotenvx** | Encrypts files, but AI still needs the decryption key |
| **permissions.deny** | Blocks all .env access—no granular control |
| **Just ignore .env** | AI can't run or test code that needs env vars |
| **envibe** | Per-variable access control. AI sees what you allow. |

## File Structure

```
your-project/
├── .env                  # Real secrets (gitignored)
├── .env.example          # Template for devs (committed)
├── .env.manifest.yaml    # Access rules (committed)
├── .env.ai               # AI-safe view (gitignored)
├── .envibe/              # Encrypted local snapshots (gitignored + agent-denied)
└── .claude/
    └── settings.json     # Claude Code config (committed)
```

## Security

- `.env` files are **gitignored** and blocked from AI
- `.env.manifest.yaml` contains **rules only**, not values—safe to commit
- `.env.ai` is **regenerated** from `.env` + manifest—gitignore it
- Unknown variables default to `placeholder` (fail-safe)
- Bash workarounds blocked (`cat .env`, `head .env`, etc.)
- `.envibe/` is self-ignoring and denied to agents; snapshot files use mode `0600`
- Restore always preserves the current state as a safety snapshot first

## License

MIT

---

Built for the AI coding era. Stop leaking secrets.
