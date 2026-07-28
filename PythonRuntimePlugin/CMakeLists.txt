# ===================================================================
#  CMakeLists.txt
#  MCPStudio ToolSDK - Python Runtime Plugin
# ===================================================================

cmake_minimum_required(VERSION 3.25)

if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    if(NOT CMAKE_OSX_ARCHITECTURES)
        set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "macOS architectures" FORCE)
    endif()
    if(NOT CMAKE_OSX_DEPLOYMENT_TARGET)
        set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0" CACHE STRING "Minimum macOS version" FORCE)
    endif()
endif()

project(PythonRuntimePlugin VERSION 1.0.0 LANGUAGES C CXX OBJC OBJCXX)

if(NOT TARGET ToolJSONBridge)
    add_subdirectory(../ToolJSONBridge ${CMAKE_BINARY_DIR}/ToolJSONBridge)
endif()
add_subdirectory(bundle)
