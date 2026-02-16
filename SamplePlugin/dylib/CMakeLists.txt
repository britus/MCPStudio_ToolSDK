# ===================================================================
#  CMakeList.txt
#  MCPStudio - Custom Tool SDK - SamplePlugin Dynamic Library
#
#  Created by EoF Software Labs on 2026.
#  Copyright © 2026 EoF Software Labs. All rights reserved.
# ===================================================================

project(SampleTool VERSION 1.0.0 LANGUAGES C)

# Universal Binary Build (arm64 + x86_64)
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")

# Find ToolSDK includes
include_directories(../../include)
include_directories(../../ToolJSONBridge)

add_library(SampleTool SHARED
    ToolDescriptor.c
    PluginMain.c
)

# Include directories
target_include_directories(SampleTool PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

set_target_properties(SampleTool PROPERTIES
    OUTPUT_NAME "SampleTool"
    MACOSX_BUNDLE OFF
    CXX_VISIBILITY_PRESET hidden
    VISIBILITY_INLINES_HIDDEN YES
)

set_target_properties(SampleTool PROPERTIES COMPILE_DEFINITIONS
    "TOOL_DYLIB=1"
)
