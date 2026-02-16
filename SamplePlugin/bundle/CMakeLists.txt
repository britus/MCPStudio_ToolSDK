# ===================================================================
#  CMakeList.txt
#  MCPStudio - Custom Tool SDK - SamplePlugin macOS Plugin Bundle
#
#  Created by EoF Software Labs on 2026.
#  Copyright © 2026 EoF Software Labs. All rights reserved.
# ===================================================================

# Define the project name and version
project(SampleToolBundle VERSION 1.0.0 LANGUAGES C CXX OBJC OBJCXX)

# Universal Binary Build (arm64 + x86_64)
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")

# Find ToolSDK includes
include_directories(../../include)
include_directories(../../ToolJSONBridge)

add_library(SampleToolBundle MODULE
    ToolDescriptor.c
    PluginMain.mm
)

# Include directories
target_include_directories(SampleToolBundle PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

set_target_properties(SampleToolBundle PROPERTIES
    OUTPUT_NAME "SampleTool"
    BUNDLE TRUE
    BUNDLE_EXTENSION bundle
)

#set_target_properties(SampleToolBundle PROPERTIES
#    SUFFIX ".plugin"
#)

set_target_properties(SampleToolBundle PROPERTIES COMPILE_DEFINITIONS
    "TOOL_BUNDLE=1"
)

target_link_libraries(SampleToolBundle
    PRIVATE "-framework Cocoa"
    PRIVATE "-framework Foundation"
    PRIVATE "-framework AppKit"
)
