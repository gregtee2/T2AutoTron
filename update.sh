#!/bin/bash

# T2AutoTron 2.1 - Update Tool (Mac/Linux)
# Works like ComfyUI updater - just run it and it updates!

echo ""
echo "==============================================="
echo "   T2AutoTron 2.1 - Update Tool"
echo "==============================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for git - install if missing
if ! command -v git &> /dev/null; then
    echo "  Git is not installed - attempting to install..."
    echo ""
    
    # Try to install git
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y git
    elif command -v brew &> /dev/null; then
        brew install git
    elif command -v yum &> /dev/null; then
        sudo yum install -y git
    else
        echo "  ERROR: Could not install Git automatically."
        echo ""
        echo "  Please install Git manually:"
        echo "    macOS:  brew install git"
        echo "    Ubuntu: sudo apt install git"
        echo ""
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        echo "  ERROR: Git installation failed."
        exit 1
    fi
    echo "  Git installed successfully!"
    echo ""
fi

# Check if this is a git repo - if not, convert it
if [ ! -d ".git" ]; then
    echo "  This folder is not yet connected to Git."
    echo "  Converting to Git-enabled install..."
    echo ""
    
    # Initialize and connect to repo
    git init
    git remote add origin https://github.com/gregtee2/T2AutoTron.git
    
    echo "  Fetching latest version..."
    git fetch origin stable
    
    # Reset to stable (keeps local files)
    git reset origin/stable
    git checkout -b stable
    
    echo ""
    echo "  Successfully connected to Git!"
    echo ""
fi

# Make sure we have the remote
if ! git remote -v | grep -q "origin"; then
    echo "  Adding remote origin..."
    git remote add origin https://github.com/gregtee2/T2AutoTron.git
fi

# Fetch and check for updates
echo "  [1/4] Checking for updates..."
git fetch origin stable 2>/dev/null || git fetch origin

BEHIND=$(git rev-list HEAD..origin/stable --count 2>/dev/null || echo "0")

if [ "$BEHIND" -eq 0 ] || [ -z "$BEHIND" ]; then
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
git log HEAD..origin/stable --oneline --no-decorate -10
echo "  -----------------------------------------------"
echo ""

# Stash any local changes
STASHED=0
if ! git diff --quiet 2>/dev/null; then
    echo "  Stashing local changes..."
    git stash push -m "Auto-stash before update"
    STASHED=1
fi

# Pull updates - use reset for clean update
echo "  [2/4] Downloading updates..."
git checkout stable 2>/dev/null || git checkout -b stable origin/stable 2>/dev/null
git reset --hard origin/stable

# Update dependencies
echo ""
echo "  [3/4] Updating backend dependencies..."
cd "$SCRIPT_DIR/v3_migration/backend"
npm install --silent 2>/dev/null || npm install

echo ""
echo "  [4/4] Updating frontend dependencies..."
cd "$SCRIPT_DIR/v3_migration/frontend"
npm install --silent 2>/dev/null || npm install

cd "$SCRIPT_DIR"

# Restore stashed changes
if [ "$STASHED" -eq 1 ]; then
    echo ""
    echo "  Restoring your local changes..."
    git stash pop 2>/dev/null || true
fi

# Done!
echo ""
echo "==============================================="
echo "   Update Complete!"
echo "==============================================="
echo ""
echo "  Updated $BEHIND commit(s)."
echo ""
echo "  To start T2AutoTron, run:"
echo "    ./start_servers.sh"
echo ""
echo "==============================================="
echo ""
