#!/bin/bash
# Claude Code hook: Regenerate .env.ai before AI reads environment files
#
# Install this hook by copying to your project's .claude/hooks/ directory
# and making it executable: chmod +x pre-tool-use.sh
#
# This ensures AI always sees the latest filtered environment variables

# Only run if the tool is trying to read .env files
if [[ "$TOOL_NAME" == "Read" ]] && [[ "$TOOL_INPUT" == *".env"* ]]; then
  # Skip if reading .env.ai or .env.manifest.yaml (those are allowed)
  if [[ "$TOOL_INPUT" != *".env.ai"* ]] && [[ "$TOOL_INPUT" != *".env.manifest"* ]]; then
    # Regenerate .env.ai
    aienv export --for-ai 2>/dev/null
  fi
fi
