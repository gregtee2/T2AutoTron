#!/bin/bash

# T2AutoTron 2.1 - Update Tool (Mac/Linux)

set -e

echo ""
echo "==============================================="
echo "   T2AutoTron 2.1 - Update Tool"
echo "==============================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for git
if ! command -v git &> /dev/null; then
    echo "  ERROR: Git is not installed!"
    echo ""
    echo "  Please install Git:"
    echo "    macOS:  brew install git"
    echo "    Ubuntu: sudo apt install git"
    echo ""
    echo "  Or download the latest ZIP from GitHub:"
    echo "  https://github.com/gregtee2/T2AutoTron/archive/refs/heads/main.zip"
    echo ""
    exit 1
fi

# Check if this is a git repo
if [ ! -d ".git" ]; then
    echo "  ERROR: This folder is not a Git repository!"
    echo ""
    echo "  If you downloaded as ZIP, you cannot use this updater."
    echo "  Instead, download a fresh ZIP from:"
    echo "  https://github.com/gregtee2/T2AutoTron/archive/refs/heads/main.zip"
    echo ""
    exit 1
fi

# Show current branch
echo "  Current branch: $(git branch --show-current)"
echo ""

# Check for uncommitted changes
if ! git diff --quiet 2>/dev/null; then
    echo "  WARNING: You have uncommitted local changes!"
    echo ""
    echo "  These files have been modified:"
    git diff --name-only
    echo ""
    read -p "  Stash changes and continue? (y/n): " STASH
    if [[ "$STASH" =~ ^[Yy]$ ]]; then
        echo "  Stashing local changes..."
        git stash push -m "Auto-stash before update $(date)"
        echo "  Your changes are saved. Use 'git stash pop' to restore them."
        echo ""
    else
        echo "  Update cancelled."
        exit 0
    fi
fi

# Fetch and check for updates
echo "  [1/3] Checking for updates..."
git fetch origin main

BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

if [ "$BEHIND" -eq 0 ]; then
    echo ""
    echo "==============================================="
    echo "   Already up to date!"
    echo "==============================================="
    echo ""
    exit 0
fi

echo "  Found $BEHIND new commit(s)!"
echo ""
echo "  Recent changes:"
echo "  -----------------------------------------------"
git log HEAD..origin/main --oneline --no-decorate -10
echo "  -----------------------------------------------"
echo ""

# Pull updates
echo "  [2/3] Downloading updates..."
git pull origin main

# Update dependencies
echo ""
echo "  [3/3] Updating dependencies..."

echo "    Backend..."
cd "$SCRIPT_DIR/v3_migration/backend"
npm install --silent

echo "    Frontend..."
cd "$SCRIPT_DIR/v3_migration/frontend"
npm install --silent

cd "$SCRIPT_DIR"

# Done!
echo ""
echo "==============================================="
echo "   Update Complete!"
echo "==============================================="
echo ""
echo "  Updated $BEHIND commit(s)."
echo ""
echo "  To start T2AutoTron, run:"
echo "    ./start.sh"
echo ""
echo "==============================================="
echo ""
