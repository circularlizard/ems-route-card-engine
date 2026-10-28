#!/usr/bin/env bash
set -e

# Reads the Version header from ems-route-card-engine.php, bumps patch, and produces dist/ems-route-card-engine-{VERSION}.zip
# Usage: bash bin/package.sh

PLUGIN_FILE="ems-route-card-engine.php"
DIST_DIR="dist"
STAGING_DIR="/tmp/ems-route-card-engine-build"

CURRENT=$(grep -m1 "Version:" "$PLUGIN_FILE" | sed 's/.*Version:[[:space:]]*//' | tr -d '[:space:]')

if [ -z "$CURRENT" ]; then
  echo "ERROR: Could not read Version from $PLUGIN_FILE"
  exit 1
fi

# Increment patch segment (e.g. 0.1.0 -> 0.1.1)
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)
PATCH=$(( PATCH + 1 ))
VERSION="${MAJOR}.${MINOR}.${PATCH}"

# Write new version back into the plugin header
sed -i '' "s/ \* Version:[[:space:]]*${CURRENT}/ \* Version:     ${VERSION}/" "$PLUGIN_FILE"
sed -i '' "s/define( 'EMS_ROUTE_CARD_VERSION', '${CURRENT}' );/define( 'EMS_ROUTE_CARD_VERSION', '${VERSION}' );/" "$PLUGIN_FILE"
echo "==> Bumped version: ${CURRENT} → ${VERSION}"

ZIP_NAME="ems-route-card-engine-${VERSION}.zip"
ZIP_PATH="${DIST_DIR}/${ZIP_NAME}"

echo "==> Building EMS Route Card Engine v${VERSION}..."

# Build JS assets
echo "==> Building JS assets..."
npm run build --silent

# Clean staging area
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/ems-route-card-engine"

# Copy source files
rsync -a \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='bin/' \
  --exclude='tests/' \
  --exclude='vendor/' \
  --exclude='dist/' \
  --exclude='node_modules/' \
  --exclude='phpunit.xml' \
  --exclude='.gitignore' \
  --exclude='*.log' \
  --exclude='temp/' \
  . "$STAGING_DIR/ems-route-card-engine/"

# Install production Composer dependencies
composer install \
  --no-dev \
  --optimize-autoloader \
  --working-dir="$STAGING_DIR/ems-route-card-engine" \
  --quiet

# Create output directory and zip
mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH"

(cd "$STAGING_DIR" && zip -r -q -9 "${OLDPWD}/${ZIP_PATH}" ems-route-card-engine)

rm -rf "$STAGING_DIR"

echo "==> Package created: ${ZIP_PATH} ($(du -h "${ZIP_PATH}" | cut -f1))"
