# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - Python Runtime Plugin Bundle
# ===================================================================

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
    PRIVATE "-framework Foundation"
)

set_target_properties(PythonRuntimeBundle PROPERTIES
    INSTALL_RPATH "@executable_path/../Resources/Bundles;@loader_path/../../.."
    BUILD_WITH_INSTALL_RPATH TRUE
)

target_compile_definitions(PythonRuntimeBundle PRIVATE
    TOOL_BUNDLE=1
    PYTHON_RUNTIME_VERSION="${PROJECT_VERSION}"
)

# ToolJSONBridge is loaded through @loader_path/../../.., i.e. from the
# directory containing PythonRuntimeTool.bundle.
add_custom_command(TARGET PythonRuntimeBundle POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_FILE:ToolJSONBridge>
        $<TARGET_BUNDLE_DIR:PythonRuntimeBundle>/..
    VERBATIM
)
