#!/bin/bash
# MineControl OS - Oracle Cloud Deployment Script
# Run this on your Oracle Cloud VM after initial setup

set -e

echo "============================================"
echo "  Oracle Cloud Deployment"
echo "============================================"

# Configuration
DOMAIN="${1:-localhost}"
ADMIN_EMAIL="${2:-admin@example.com}"

# Update system
echo "[1/6] Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install dependencies
echo "[2/6] Installing dependencies..."
sudo apt install -y openjdk-21-jdk nodejs npm curl nginx certbot python3-certbot-nginx

# Clone repo (if not already cloned)
if [ ! -d "MineControlOS" ]; then
    echo "[3/6] Cloning MineControlOS..."
    git clone https://github.com/yourusername/MineControlOS.git
    cd MineControlOS
else
    cd MineControlOS
    echo "[3/6] Updating MineControlOS..."
    git pull
fi

# Install and build
echo "[4/6] Installing and building..."
npm install
npm run build

# Generate secure secrets
JWT_SECRET=$(openssl rand -hex 64)
BACKUP_KEY=$(openssl rand -hex 32)

# Create .env file
cat > .env << EOF
PORT=3001
JWT_SECRET=${JWT_SECRET}
BACKUP_KEY=${BACKUP_KEY}
NODE_ENV=production
EOF

# Download PaperMC
echo "[5/6] Downloading PaperMC..."
if [ ! -f "minecraft/server.jar" ]; then
    curl -L -o minecraft/server.jar https://api.papermc.io/v2/projects/paper/versions/1.21.1/builds/latest/downloads/paper-1.21.1-latest.jar
fi

# Setup PM2
echo "[6/6] Setting up PM2..."
sudo npm install -g pm2
pm2 delete minecontrol 2>/dev/null || true
PORT=3001 JWT_SECRET=${JWT_SECRET} BACKUP_KEY=${BACKUP_KEY} pm2 start npm --name "minecontrol" -- start
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

# Setup Nginx reverse proxy
if [ "$DOMAIN" != "localhost" ]; then
    echo "Setting up Nginx with SSL for $DOMAIN..."
    sudo tee /etc/nginx/sites-available/minecontrol > /dev/null << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    sudo ln -sf /etc/nginx/sites-available/minecontrol /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx

    # Get SSL certificate
    sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${ADMIN_EMAIL}
fi

# Open firewall ports
echo "Configuring firewall..."
sudo ufw allow 25565/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo ""
echo "============================================"
echo "  Deployment complete!"
echo ""
if [ "$DOMAIN" != "localhost" ]; then
    echo "  Panel: https://${DOMAIN}"
else
    echo "  Panel: http://$(curl -s ifconfig.me):3001"
fi
echo "  Server: $(curl -s ifconfig.me):25565"
echo "  Login:  owner / minecraft"
echo ""
echo "  ⚠️  CHANGE THE DEFAULT PASSWORD!"
echo "============================================"
