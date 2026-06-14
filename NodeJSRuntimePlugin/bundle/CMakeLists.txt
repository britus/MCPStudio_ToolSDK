# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - NodeJS Runtime Plugin Bundle
# ===================================================================

project(NodeJSRuntimeBundle VERSION 1.0.0 LANGUAGES C CXX OBJC OBJCXX)

set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")

include_directories(../../include)
include_directories(../../ToolJSONBridge)

add_library(NodeJSRuntimeBundle MODULE
    ToolDescriptor.c
    PluginMain.mm
    NodeJSRuntimeHandler.mm
)

target_include_directories(NodeJSRuntimeBundle PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ../../include
    ../../ToolJSONBridge
)

set_target_properties(NodeJSRuntimeBundle PROPERTIES
    OUTPUT_NAME "NodeJSRuntimeTool"
    BUNDLE TRUE
    BUNDLE_EXTENSION bundle
)

target_link_libraries(NodeJSRuntimeBundle
    PRIVATE ToolJSONBridge
    PRIVATE "-framework Cocoa"
    PRIVATE "-framework Foundation"
    PRIVATE "-framework AppKit"
)

set_target_properties(NodeJSRuntimeBundle PROPERTIES
    INSTALL_RPATH "@executable_path/../Resources/Bundles;@loader_path/../../.."
    BUILD_WITH_INSTALL_RPATH TRUE
)

set_target_properties(NodeJSRuntimeBundle PROPERTIES COMPILE_DEFINITIONS
    "TOOL_BUNDLE=1"
)

add_custom_command(TARGET NodeJSRuntimeBundle POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_FILE:ToolJSONBridge>
        $<TARGET_FILE_DIR:NodeJSRuntimeBundle>/../../..
)
