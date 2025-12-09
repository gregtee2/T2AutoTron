#!/bin/bash

# T2AutoTron 2.1 - One-Click Installer (Mac/Linux)

set -e

echo ""
echo "==============================================="
echo "   T2AutoTron 2.1 - One-Click Installer"
echo "==============================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for Node.js
echo "[1/4] Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo "  ERROR: Node.js is not installed!"
    echo ""
    echo "  Please install Node.js 18+ from:"
    echo "  https://nodejs.org/"
    echo ""
    echo "  Or use your package manager:"
    echo "    macOS:  brew install node"
    echo "    Ubuntu: sudo apt install nodejs npm"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "   Found Node.js $(node -v)"

if [ "$NODE_VERSION" -lt 18 ]; then
    echo ""
    echo "  WARNING: Node.js v$NODE_VERSION detected. Version 18+ recommended."
    echo ""
    sleep 2
fi

# Install backend dependencies
echo ""
echo "[2/4] Installing backend dependencies..."
cd "$SCRIPT_DIR/v3_migration/backend"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   Already installed, skipping..."
fi

# Install frontend dependencies
echo ""
echo "[3/4] Installing frontend dependencies..."
cd "$SCRIPT_DIR/v3_migration/frontend"
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "   Already installed, skipping..."
fi

# Create empty .env if it doesn't exist
echo ""
echo "[4/4] Preparing configuration..."
cd "$SCRIPT_DIR/v3_migration/backend"
if [ ! -f ".env" ]; then
    cat > .env << EOF
# T2AutoTron Environment Configuration
# Configure via Settings UI in the app

PORT=3000
EOF
    echo "   Created default .env file"
else
    echo "   Configuration file exists"
fi

# Make start script executable
chmod +x "$SCRIPT_DIR/start.sh" 2>/dev/null || true

# Done!
echo ""
echo "==============================================="
echo "   Installation Complete!"
echo "==============================================="
echo ""
echo "  To start T2AutoTron, run:"
echo ""
echo "    ./start.sh"
echo ""
echo "  Or manually:"
echo "    Terminal 1: cd v3_migration/backend && npm start"
echo "    Terminal 2: cd v3_migration/frontend && npm run dev"
echo ""
echo "  Then open: http://localhost:5173"
echo ""
echo "  First time? Click 'Settings & API Keys' to configure"
echo "  your Home Assistant, Hue, or other integrations."
echo ""
