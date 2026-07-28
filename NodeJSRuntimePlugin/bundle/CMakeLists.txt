# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - NodeJS Runtime Plugin Bundle
# ===================================================================

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
    PRIVATE "-framework Foundation"
)

set_target_properties(NodeJSRuntimeBundle PROPERTIES
    INSTALL_RPATH "@executable_path/../Resources/Bundles;@loader_path/../../.."
    BUILD_WITH_INSTALL_RPATH TRUE
)

target_compile_definitions(NodeJSRuntimeBundle PRIVATE
    TOOL_BUNDLE=1
    NODEJS_RUNTIME_VERSION="${PROJECT_VERSION}"
)

# ToolJSONBridge is loaded through @loader_path/../../.., i.e. from the
# directory containing NodeJSRuntimeTool.bundle.
add_custom_command(TARGET NodeJSRuntimeBundle POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_FILE:ToolJSONBridge>
        $<TARGET_BUNDLE_DIR:NodeJSRuntimeBundle>/..
    VERBATIM
)
