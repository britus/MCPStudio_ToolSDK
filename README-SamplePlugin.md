# Building SamplePlugin Bundle and Dylib

This document provides instructions on how to build the SamplePlugin 
bundle and dylib for the MCPStudio Custom Tool SDK.

## Overview

The SamplePlugin is a sample implementation of a custom tool plugin 
that can be built as either a dynamic library (dylib) or a macOS bundle. 
The build process uses CMake to manage the build configuration. The bundle 
and dylib are always built together.

## Building the SamplePlugin

### Prerequisites

- CMake 3.25 or higher
- Xcode command line tools
- macOS 15.0 or higher

### Building Both Bundle and Dylib

To build both the SamplePlugin bundle and dylib, navigate to the `SamplePlugin` directory and run:

```bash
mkdir build
cd build
cmake ..
make
```

This will generate both the `SampleTool` dylib and the `SampleTool.bundle` files.

## Files

### Dynamic Library

- `SamplePlugin/CMakeLists.txt`: 
Master CMake configuration that builds both the dylib and the bundle.

- `SamplePlugin/dylib/CMakeLists.txt`: 
CMake configuration for the dylib build (used by the master CMakeLists.txt).

- `SamplePlugin/dylib/PluginMain.c`: 
Main implementation of the dylib plugin.

- `SamplePlugin/dylib/ToolDescriptor.c`: 
Tool descriptor for the dylib plugin.

### Bundle

- `SamplePlugin/bundle/CMakeLists.txt`: 
CMake configuration for the bundle build (used by the master CMakeLists.txt).

- `SamplePlugin/bundle/PluginMain.mm`: 
Main implementation of the bundle plugin.

- `SamplePlugin/bundle/ToolDescriptor.c`: 
Tool descriptor for the bundle plugin.

# ToolABI.h API Reference

## Functions

### toolDescribe()
Returns a pointer to the tool descriptor structure.

**Parameters:** None
**Returns:** Pointer to `ToolPluginDescriptor` structure

### toolEntry()
Main entry point for tool execution.

**Parameters:**
- `sid`: Session identifier
- `toolName`: Name of the tool to execute
- `params`: Tool parameters as JSON string
- `resultJson`: Output parameter for result JSON
- `resultSize`: Output parameter for result size

**Returns:** None

### Call Parameter Structure JSON format

```
{
  "name" : "sample_c_handler",
  "toolType" : "CustomTool",
  "execHandler" : "doSomething",
  "sessionId" : "BAD5C3A6-5CF6-437A-83C2-41C89B790CC8",
  "pluginName" : "SampleTool_C_Handler",
  "arguments" : {
    "path_name" : "\/usr\/lib"
  },
  "execMethod" : "toolEntry"
}
```
