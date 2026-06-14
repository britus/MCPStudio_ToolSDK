# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - NodeJS Runtime Plugin
# ===================================================================

cmake_minimum_required(VERSION 3.25)

project(NodeJSRuntimePlugin VERSION 1.0.0)

if(NOT TARGET ToolJSONBridge)
    add_subdirectory(../ToolJSONBridge ${CMAKE_BINARY_DIR}/ToolJSONBridge)
endif()
add_subdirectory(bundle)
