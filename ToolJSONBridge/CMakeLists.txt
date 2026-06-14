# ===================================================================
#  CMakeList.txt
#  MCPStudio - ToolJSONBridge Dynamic Library
#
#  Created by EoF Software Labs on 2026.
#  Copyright © 2026 EoF Software Labs. All rights reserved.
# ===================================================================

project(ToolJSONBridge VERSION 1.0.0 LANGUAGES CXX OBJCXX)

set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")

add_library(ToolJSONBridge SHARED
    ToolJSONBridge.mm
)

target_include_directories(ToolJSONBridge PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
)

set_target_properties(ToolJSONBridge PROPERTIES
    OUTPUT_NAME "ToolJSONBridge"
    MACOSX_RPATH TRUE
    INSTALL_NAME_DIR "@rpath"
)

target_link_libraries(ToolJSONBridge
    PRIVATE "-framework Foundation"
)
