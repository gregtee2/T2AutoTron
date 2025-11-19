#!/bin/bash
set -e

# Permissions (GPIO for Shelly, Hue, etc.)
usermod -a -G gpio,dialout $SUDO_USER

# Desktop entry
mkdir -p /home/$SUDO_USER/.local/share/applications
cat > /home/$SUDO_USER/.local/share/applications/t2-autotron.desktop << EOL
[Desktop Entry]
Name=T2AutoTron
Exec=/usr/bin/t2-autotron
Type=Application
Terminal=false
Categories=Utility;
EOL
chown $SUDO_USER:$SUDO_USER /home/$SUDO_USER/.local/share/applications/t2-autotron.desktop

# Install Home Assistant Core
if ! command -v hass >/dev/null 2>&1; then
  useradd -rm homeassistant -G dialout,gpio
  mkdir -p /srv/homeassistant
  chown homeassistant:homeassistant /srv/homeassistant
  sudo -u homeassistant -H bash -c "cd /srv/homeassistant && python3 -m venv . && . bin/activate && pip install wheel homeassistant==2025.5.5"
  cat > /etc/systemd/system/homeassistant.service << EOL
[Unit]
Description=Home Assistant
After=network-online.target mongod.service
[Service]
User=homeassistant
WorkingDirectory=/srv/homeassistant
ExecStart=/srv/homeassistant/bin/hass
Restart=always
[Install]
WantedBy=multi-user.target
EOL
  systemctl daemon-reload
  systemctl enable homeassistant
  systemctl start homeassistant
fi

# Backend service
cat > /etc/systemd/system/t2-autotron-backend.service << EOL
[Unit]
Description=T2AutoTron Backend
After=network.target mongod.service homeassistant.service
[Service]
ExecStart=/usr/bin/node /usr/lib/t2-autotron/server.js
WorkingDirectory=/usr/lib/t2-autotron
Restart=always
User=pi
[Install]
WantedBy=multi-user.target
EOL
systemctl daemon-reload
systemctl enable t2-autotron-backend
systemctl start t2-autotron-backend

# Open Home Assistant port
if command -v ufw >/dev/null 2>&1; then
  ufw allow 8123
fi

# Prompt for Home Assistant and Telegram configuration
echo "Please visit http://<pi-ip>:8123/profile to create a long-lived access token."
echo "Add it to /usr/lib/t2-autotron/.env as HOME_ASSISTANT_TOKEN=your_token_here"
echo "Add your Telegram bot token to /usr/lib/t2-autotron/.env as TELEGRAM_BOT_TOKEN=your_bot_token_here"