#!/usr/bin/env bash
set -e

# Build and deploy the plugin to the local WordPress directory.
# Usage: bash bin/deploy.sh

PLUGIN_NAME="ems-route-card-engine"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WP_ENV_DIR="${WP_ENV_DIR:-$(cd "$SCRIPT_DIR/../../wordpress-env" 2>/dev/null && pwd)}"
TARGET_DIR="${WP_PLUGINS_DIR:-$WP_ENV_DIR/wordpress/wp-content/plugins}/$PLUGIN_NAME"
STAGING_DIR="$SCRIPT_DIR/../temp/ems-route-card-engine-deploy"

echo "==> Deploying $PLUGIN_NAME to $TARGET_DIR..."

# 1. Build JS assets
echo "==> Building JS assets..."
npm run build --silent

# 2. Clean staging area
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/$PLUGIN_NAME"

# 3. Copy source files to staging
echo "==> Staging files..."
rsync -a \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='vendor/' \
  --exclude='dist/' \
  --exclude='node_modules/' \
  --exclude='phpunit.xml' \
  --exclude='.gitignore' \
  --exclude='*.log' \
  --exclude='temp/' \
  . "$STAGING_DIR/$PLUGIN_NAME/"

# 4. Install production Composer dependencies in staging
echo "==> Installing production dependencies..."
if command -v composer >/dev/null 2>&1; then
  composer install \
    --no-dev \
    --optimize-autoloader \
    --working-dir="$STAGING_DIR/$PLUGIN_NAME" \
    --quiet
fi

# 5. Sync staging to target
echo "==> Syncing to $TARGET_DIR..."
mkdir -p "$TARGET_DIR"
rsync -a --delete "$STAGING_DIR/$PLUGIN_NAME/" "$TARGET_DIR/"

# 6. Clean up
rm -rf "$STAGING_DIR"

# 7. Try to activate via WP-CLI in shared docker environment if available
if [ -d "$WP_ENV_DIR" ] && command -v docker >/dev/null 2>&1; then
  echo "==> Refreshing plugin status in local WordPress container..."
  (cd "$WP_ENV_DIR" && docker compose run --rm wpcli plugin activate $PLUGIN_NAME --quiet 2>/dev/null) || true
fi

echo "==> Done! $PLUGIN_NAME deployed successfully."
