#!/bin/bash
# ToolSDK.xcodeproj Build Script - Direct xcodebuild execution
# Purpose: Build ToolSDK project with Debug configuration on macOS

set -euo pipefail

PROJECT_DIR="/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK"
PROJECT_NAME="ToolSDK.xcodeproj"
CONFIGURATION="Debug"
PLATFORM="-sdk macosx"
SCHEME=""  # Will be auto-detected
ARCH=$(uname -m)
ONLY_ACTIVE_ARCHS="-only-active-architectures"
VERBOSITY="-verbose -showDeps -showIcons"

echo "=========================================="
echo "  ToolSDK.xcodeproj Build"
echo "=========================================="
echo ""
echo "Project: ${PROJECT_NAME}"
echo "Directory: ${PROJECT_DIR}"
echo "Configuration: ${CONFIGURATION}"
echo "Platform: macOS (${PLATFORM})"
echo "Architecture: ${ARCH}"
echo "Mode: Active Architectures Only"
echo ""

# Auto-detect first scheme if available
if [ -d "${PROJECT_DIR}/ToolSDK.xcodeproj/xcshareddata/xcschemes" ]; then
    FIRST_SCHEME=$(ls "${PROJECT_DIR}/ToolSDK.xcodeproj/xcshareddata/xcschemes/" 2>/dev/null | head -1)
    if [ -n "$FIRST_SCHEME" ]; then
        SCHEME="-scheme \"$(basename ${FIRST_SCHEME%.xcscheme})\""
        echo "Detected Scheme: $(basename ${FIRST_SCHEME%.xcscheme})"
    fi
fi

echo ""
echo "Building with xcodebuild..."
echo "-------------------------------"

BUILD_CMD="xcodebuild build \
  -project \"${PROJECT_NAME}\" \
  $SCHEME \
  -configuration ${CONFIGURATION} \
  ${PLATFORM} \
  ${ONLY_ACTIVE_ARCHS} \
  ${VERBOSITY}"

eval "$BUILD_CMD" || exit 1

echo ""
echo "=========================================="
echo "  BUILD COMPLETED SUCCESSFULLY"
echo "=========================================="
