#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-1.0.0.0}"
CONFIG="${CONFIG:-Release}"
SLN_FILE="Jellyfin.Plugin.EnhancedVideoPreviews.sln"
OUTPUT_DIR="release"
ZIP_NAME="jellyfin-enhanced-video-previews-${VERSION}.zip"

echo "=== Building Jellyfin.Plugin.EnhancedVideoPreviews v${VERSION} (${CONFIG}) ==="

if ! command -v dotnet &> /dev/null; then
    echo "Error: 'dotnet' CLI was not found. Please install the .NET SDK (8.0+)." >&2
    exit 1
fi

dotnet restore "$SLN_FILE"
dotnet build "$SLN_FILE" \
    --configuration "$CONFIG" \
    --no-restore \
    /p:Version="$VERSION" \
    /p:AssemblyVersion="$VERSION" \
    /p:FileVersion="$VERSION"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy output dlls
find Jellyfin.Plugin.EnhancedVideoPreviews/bin/"$CONFIG"/net8.0 -name "Jellyfin.Plugin.EnhancedVideoPreviews.dll" -exec cp {} "$OUTPUT_DIR"/ \;

if [ ! -f "$OUTPUT_DIR/Jellyfin.Plugin.EnhancedVideoPreviews.dll" ]; then
    echo "Error: Jellyfin.Plugin.EnhancedVideoPreviews.dll was not found after build." >&2
    exit 1
fi

cd "$OUTPUT_DIR"
zip -r "../$ZIP_NAME" .
cd ..

if command -v md5sum &> /dev/null; then
    CHECKSUM=$(md5sum "$ZIP_NAME" | awk '{ print $1 }')
elif command -v md5 &> /dev/null; then
    CHECKSUM=$(md5 -q "$ZIP_NAME")
else
    CHECKSUM="N/A"
fi

echo "Created: $ZIP_NAME"
echo "MD5 Checksum: $CHECKSUM"

if command -v node &> /dev/null; then
    node scripts/generate-manifest.js --version="$VERSION" --checksum="$CHECKSUM"
fi

echo "=== Build Completed Successfully ==="
