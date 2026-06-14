# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - Python Runtime Plugin Bundle
# ===================================================================

project(PythonRuntimeBundle VERSION 1.0.0 LANGUAGES C CXX OBJC OBJCXX)

set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64")
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0")

include_directories(../../include)
include_directories(../../ToolJSONBridge)

add_library(PythonRuntimeBundle MODULE
    ToolDescriptor.c
    PluginMain.mm
    PythonRuntimeHandler.mm
)

target_include_directories(PythonRuntimeBundle PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ../../include
    ../../ToolJSONBridge
)

set_target_properties(PythonRuntimeBundle PROPERTIES
    OUTPUT_NAME "PythonRuntimeTool"
    BUNDLE TRUE
    BUNDLE_EXTENSION bundle
)

target_link_libraries(PythonRuntimeBundle
    PRIVATE ToolJSONBridge
    PRIVATE "-framework Cocoa"
    PRIVATE "-framework Foundation"
    PRIVATE "-framework AppKit"
)

set_target_properties(PythonRuntimeBundle PROPERTIES
    INSTALL_RPATH "@executable_path/../Resources/Bundles;@loader_path/../../.."
    BUILD_WITH_INSTALL_RPATH TRUE
)

set_target_properties(PythonRuntimeBundle PROPERTIES COMPILE_DEFINITIONS
    "TOOL_BUNDLE=1"
)

add_custom_command(TARGET PythonRuntimeBundle POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_FILE:ToolJSONBridge>
        $<TARGET_FILE_DIR:PythonRuntimeBundle>/../../..
)
