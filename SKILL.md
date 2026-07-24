---
name: aienv
description: Safely inspect, compare, update, and verify environment variables and secret-bearing configuration without disclosing secret values. Use when Codex must diagnose literal variable placeholders, migrate environment-backed credentials to static configuration, patch files using a secret already present in the environment, or prove that credentials match without printing them.
---

# Secret-safe environment work

Treat secret values as write-only data. Read them only into process memory, never into assistant-visible output, command arguments, diffs, logs, or error messages.

## Guardrails

- Never run `env`, `printenv`, `set`, `cat`, or an unrestricted file read where secrets may appear.
- Never print, interpolate into commentary, or include a secret in a tool call's literal command text.
- Disable shell tracing with `set +x` before handling secrets.
- Prefer boolean results such as `present`, `matches`, and `placeholder absent` over values, prefixes, hashes, or lengths.
- Do not run `git diff` on files containing static credentials. Never commit those files.
- Preserve restrictive permissions; use `chmod 600` for a personal secret-bearing config when appropriate.
- Request approval before writing outside the active workspace or another protected location.

## Inspect without disclosure

Check whether a variable exists without expanding it into output:

```zsh
if [[ -n "${SECRET_TOKEN:-}" ]]; then
  print 'secret-status: set'
else
  print 'secret-status: unset'
fi
```

Detect a mistakenly stored placeholder by searching only for the variable name:

```zsh
if rg -q 'SECRET_TOKEN' /path/to/config.toml; then
  print 'literal-variable-reference: present'
else
  print 'literal-variable-reference: absent'
fi
```

Classify configuration without printing its line:

```zsh
awk '
  /^\[mcp_servers\.example\]/{inside=1; next}
  /^\[/{inside=0}
  inside && /^bearer_token_env_var/ {print "auth-config: env-var"}
  inside && /^http_headers/ {
    if ($0 ~ /SECRET_TOKEN/) print "auth-config: static-header-containing-placeholder"
    else print "auth-config: static-header"
  }
' /path/to/config.toml
```

## Compare without printing

Extract the stored credential into a shell variable and compare it in-process. Emit only the result:

```zsh
set +x
: "${SECRET_TOKEN:?SECRET_TOKEN is not set}"

line=$(awk '
  /^\[mcp_servers\.example\]/{inside=1; next}
  /^\[/{inside=0}
  inside && /^http_headers =/{print; exit}
' /path/to/config.toml)

stored=${line#*Bearer }
stored=${stored%\" \}}

if [[ "$stored" == "$SECRET_TOKEN" ]]; then
  print 'stored-value: matches-current-token'
else
  print 'stored-value: mismatch'
fi

unset line stored
```

Adapt the extraction to the exact file format. Confirm the expected line exists before parsing it. Never echo either variable while debugging.

## Patch with an environment-held secret

First verify that the old placeholder and surrounding context exist exactly. Then construct the patch from quoted, non-secret fragments and append the secret at runtime. This keeps the value out of the literal command text and ordinary output:

```zsh
set +x
: "${SECRET_TOKEN:?SECRET_TOKEN is not set}"

patch='*** Begin Patch
*** Update File: /path/to/config.toml
@@
-http_headers = { Authorization = "Bearer ${SECRET_TOKEN}" }
+http_headers = { Authorization = "Bearer '
patch+="$SECRET_TOKEN"
patch+='" }
*** End Patch'

apply_patch <<< "$patch"
unset patch
```

Use this only when a static credential is explicitly requested and its plaintext-storage tradeoff is accepted. Prefer an environment reference, keychain, credential helper, or OAuth when those remain reliable across the required execution contexts.

Avoid command tracing and verbose failure modes. If the expected placeholder does not exist, stop before constructing the secret-bearing patch and inspect only sanitized structure.

## Verify the result

Run all applicable checks without displaying the credential:

1. Confirm the variable name or placeholder is absent with `rg -q`.
2. Compare the stored value against the environment value in-process.
3. Ask the consuming CLI for sanitized status output when available.
4. Confirm restrictive file permissions with `stat`.
5. Restart or reload the consumer if it caches configuration.

Example permission check:

```zsh
stat -f '%Sp %N' /path/to/config.toml
```

Report only sanitized facts, for example:

```text
literal-variable-reference: absent
stored-value: matches-current-token
consumer-status: enabled
permissions: owner-read-write-only
```

## Failure handling

- If the environment contains a literal placeholder instead of a concrete value, stop and obtain the real credential through an authorized source.
- If the patch fails, do not print the generated patch. Unset it, re-check sanitized context, and rebuild it.
- If validation requires revealing any part of the secret, choose a different validation method or ask the user to verify locally.
- Do not claim success until placeholder absence and value equality are both independently verified.
