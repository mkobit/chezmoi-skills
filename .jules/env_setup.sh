#!/bin/bash
# Jules environment setup for chezmoi-skills repository
# For more information, see: https://jules.google/docs/environment/

set -euo pipefail

echo "Setting up chezmoi-skills environment..."

echo "--- Diagnostic Information ---"
echo "User: $(whoami)"
echo "Bun version: $(bun -v 2>/dev/null || echo 'Not installed')"
GIT_COMMIT_HASH=$(git rev-parse HEAD)
GIT_COMMIT_DATE=$(git log -1 --format=%cI)
export GIT_COMMIT_HASH
export GIT_COMMIT_DATE
echo "Git commit hash: ${GIT_COMMIT_HASH}"
echo "Git commit date: ${GIT_COMMIT_DATE}"
echo "------------------------------"

# Install mise
if ! command -v mise &>/dev/null; then
    echo "Installing mise..."
    curl -s https://mise.run | bash
    export PATH="$HOME/.local/bin:$PATH"
fi

mise trust
mise install
eval "$(mise activate bash)"
mise doctor

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Bun version: $(bun --version)"
echo "Environment ready"
