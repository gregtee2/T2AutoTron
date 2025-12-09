#!/bin/bash

# T2AutoTron 2.1 - Start Script (Mac/Linux)

echo ""
echo "==============================================="
echo "   T2AutoTron 2.1 - Starting..."
echo "==============================================="
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if installed
if [ ! -d "$SCRIPT_DIR/v3_migration/backend/node_modules" ]; then
    echo "  ERROR: Not installed yet!"
    echo ""
    echo "  Please run ./install.sh first."
    echo ""
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down T2AutoTron..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "  Starting backend server..."
cd "$SCRIPT_DIR/v3_migration/backend"
npm start &
BACKEND_PID=$!

# Wait for backend to initialize
sleep 3

# Start frontend
echo "  Starting frontend dev server..."
cd "$SCRIPT_DIR/v3_migration/frontend"
npm run dev &
FRONTEND_PID=$!

# Wait for frontend to initialize
sleep 5

echo ""
echo "==============================================="
echo "   T2AutoTron is running!"
echo "==============================================="
echo ""
echo "  Open your browser to: http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

# Open browser (works on macOS and most Linux)
if command -v open &> /dev/null; then
    open http://localhost:5173
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:5173
fi

# Wait for processes
wait
