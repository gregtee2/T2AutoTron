#!/bin/bash
set -e

# Verify OS (Raspberry Pi OS, Bookworm preferred)
if ! grep -q "Raspbian GNU/Linux" /etc/os-release; then
  echo "Error: This installer requires Raspberry Pi OS."
  exit 1
fi
if ! grep -q "bookworm" /etc/os-release; then
  echo "Warning: Bookworm recommended. Detected $(grep PRETTY_NAME /etc/os-release)."
fi
if [ "$(uname -m)" != "aarch64" ]; then
  echo "Warning: 64-bit OS recommended for best performance."
fi

# Update system
apt update
apt upgrade -y

# Install Node.js 20.x if not present or wrong version
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v20"; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

# Verify Node.js
if ! node -v | grep -q "^v20"; then
  echo "Error: Node.js 20.x installation failed."
  exit 1
fi

# Install MongoDB if not present
if ! command -v mongod >/dev/null 2>&1; then
  apt install -y mongodb
  systemctl enable mongodb
  systemctl start mongodb
fi