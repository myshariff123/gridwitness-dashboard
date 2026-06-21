#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# GridWitness domain migration: nip.io → gridwitness.ca
#
# Run this script ON THE EC2 SERVER after your DNS A record
# for gridwitness.ca points to 16.174.1.7 and has propagated.
#
# Check DNS first:
#   nslookup gridwitness.ca
#   (should return 16.174.1.7)
#
# Usage:
#   chmod +x migrate_to_gridwitness_ca.sh
#   sudo bash migrate_to_gridwitness_ca.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

NEW_DOMAIN="gridwitness.ca"
APP_DIR="/home/ubuntu/gridwitness-dashboard"
ENV_FILE="$APP_DIR/.env.local"

echo ""
echo "=== Step 1: Verify DNS propagation ==="
IP=$(dig +short "$NEW_DOMAIN" | tail -1)
if [ "$IP" != "16.174.1.7" ]; then
  echo "ERROR: $NEW_DOMAIN resolves to '$IP', expected 16.174.1.7"
  echo "DNS has not propagated yet. Wait and retry."
  exit 1
fi
echo "DNS OK: $NEW_DOMAIN → $IP"

echo ""
echo "=== Step 2: Write/update nginx config for $NEW_DOMAIN ==="
cat > /etc/nginx/sites-available/gridwitness <<'NGINX'
server {
    listen 80;
    server_name gridwitness.ca www.gridwitness.ca;
    return 301 https://gridwitness.ca$request_uri;
}

server {
    listen 443 ssl;
    server_name www.gridwitness.ca;
    ssl_certificate     /etc/letsencrypt/live/gridwitness.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gridwitness.ca/privkey.pem;
    return 301 https://gridwitness.ca$request_uri;
}

server {
    listen 443 ssl;
    server_name gridwitness.ca;

    ssl_certificate     /etc/letsencrypt/live/gridwitness.ca/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gridwitness.ca/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

# Enable site (idempotent)
ln -sf /etc/nginx/sites-available/gridwitness /etc/nginx/sites-enabled/gridwitness

# Remove old nip.io site if it exists
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/*nip*

nginx -t
echo "Nginx config validated."

echo ""
echo "=== Step 3: Issue SSL certificate for $NEW_DOMAIN ==="
certbot certonly --nginx \
  -d "$NEW_DOMAIN" \
  -d "www.$NEW_DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email myousufshariff@gmail.com

echo "SSL certificate issued."

echo ""
echo "=== Step 4: Reload nginx with new cert ==="
systemctl reload nginx
echo "Nginx reloaded."

echo ""
echo "=== Step 5: Update Next.js environment file ==="
# Read existing .env.local and replace APP_URL, or create if missing
if [ -f "$ENV_FILE" ]; then
  # Update NEXT_PUBLIC_APP_URL in place
  sed -i "s|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=https://gridwitness.ca|g" "$ENV_FILE"
  # If the line didn't exist, add it
  grep -q "NEXT_PUBLIC_APP_URL" "$ENV_FILE" || echo "NEXT_PUBLIC_APP_URL=https://gridwitness.ca" >> "$ENV_FILE"
else
  echo "No .env.local found — creating with required variables."
  echo "NEXT_PUBLIC_APP_URL=https://gridwitness.ca" > "$ENV_FILE"
fi
echo "Updated NEXT_PUBLIC_APP_URL in $ENV_FILE"

echo ""
echo "=== Step 6: Pull latest code (with updated Lambda defaults) ==="
cd "$APP_DIR"
git pull origin main

echo ""
echo "=== Step 7: Rebuild Next.js app ==="
npm run build

echo ""
echo "=== Step 8: Restart PM2 ==="
pm2 restart gridwitness-dashboard
pm2 save

echo ""
echo "=== Step 9: Update Lambda APP_URL environment variable ==="
REGION="ca-central-1"

for FUNC in gw-ms-attestation-staging gw-ms-filing-reminder-staging; do
  echo "Updating $FUNC..."
  aws lambda update-function-configuration \
    --region "$REGION" \
    --function-name "$FUNC" \
    --environment "Variables={APP_URL=https://gridwitness.ca}" \
    --query "FunctionArn" --output text
done
echo "Lambda env vars updated."

echo ""
echo "=== Step 10: Verify ==="
sleep 3
HTTP=$(curl -o /dev/null -s -w "%{http_code}" "https://$NEW_DOMAIN")
echo "https://$NEW_DOMAIN returned HTTP $HTTP"
if [ "$HTTP" = "200" ] || [ "$HTTP" = "307" ] || [ "$HTTP" = "302" ]; then
  echo "Site is live at https://$NEW_DOMAIN"
else
  echo "WARNING: unexpected HTTP code $HTTP — check PM2 and nginx logs."
fi

echo ""
echo "=== DONE ==="
echo ""
echo "Manual step remaining (Cognito — do this in AWS Console):"
echo "  1. Go to: AWS Console → Cognito → User Pools → ca-central-1_IcSJiRC6e"
echo "  2. App clients → gridwitness-app (client ID: 4hpe00jpi8mlkntjkh8vkckqhv)"
echo "  3. Allowed callback URLs — ADD: https://gridwitness.ca/auth/callback"
echo "  4. Allowed sign-out URLs — ADD: https://gridwitness.ca"
echo "  5. Save changes"
echo ""
echo "After saving Cognito: test login at https://gridwitness.ca"
