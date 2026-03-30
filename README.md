# MCPStudio_ToolSDK

Official SDK of the EoF MCP Studio App for macOS

## Overview

The MCPStudio_ToolSDK provides a comprehensive framework for building custom tools, plugins, and scripts for the MCP Studio application. This SDK enables developers to extend MCP Studio functionality through:

- **JavaScript Scripting** - Full API access via built-in utilities
- **C/C++ Plugins** - Build dynamic libraries (dylib) and bundles
- **Build Integration** - CMake, Xcode, QMake support
- **File Operations** - Secure file access with macOS sandboxing
- **HTTP Tools** - REST API client for network operations
- **Build Automation** - Project build management utilities

## SDK Structure

```
MCPStudio_ToolSDK/
├── Scripts/                    # JavaScript utility scripts
│   ├── clangTools.js          # Clang compiler tools
│   ├── cmakeBuild.js          # CMake build automation
│   ├── checkWithXcode.js      # Xcode project validation
│   ├── fileRead.js            # File reading utilities
│   ├── fileSave.js            # File writing utilities
│   ├── shellCall.js           # Shell command execution
│   ├── httpTools.js           # HTTP request utilities
│   ├── directoryList.js       # Directory listing operations
│   ├── directoryCreate.js     # Directory creation utilities
│   └── tool_entry.js          # Tool entry point registry
├── SamplePlugin/              # Sample plugin template
│   ├── dylib/                 # Dynamic library implementation
│   ├── bundle/                # Bundle implementation
│   ├── CMakeLists.txt         # Master build configuration
│   └── ToolCapabilities.json  # Plugin capabilities definition
├── test-scripts/             # Test suite for utilities
│   ├── testFileOps.js        # File operation tests
│   ├── testHttpAll.js        # HTTP method tests
│   ├── testJSON.js           # JSON handling tests
│   └── ...                   # Additional test scripts
└── README*.md               # Documentation files

## Quick Start Guide

### 1. Build a Sample Plugin

```bash
cd SamplePlugin
mkdir build
cd build
cmake ..
make
```

This generates both `SampleTool` dylib and `SampleTool.bundle`.

### 2. Create Custom Tool Scripts

Add scripts to the `Scripts/` directory:

```javascript
// Example: customTools.js
function toolEntry(sid, toolName, params, resultJson, resultSize) {
    // Your tool implementation here
    return null;
}

module.exports = {
    toolEntry
};
```

### 3. Execute via MCP Studio

Use the MCP Studio UI to:
- Configure custom tools in Tools/ directory
- Load scripts from Scripts/ directory
- Execute with parameters and view results

## API Reference

### File Operations
- [`fileRead.js`](Scripts/fileRead.js) - Read file contents
- [`fileSave.js`](Scripts/fileSave.js) - Write file contents
- [`fileExists.js`](Scripts/fileExists.js) - Check file existence
- [`fileDelete.js`](Scripts/fileDelete.js) - Delete files

### Build Tools
- [`cmakeBuild.js`](Scripts/cmakeBuild.js) - CMake project builds
- [`checkWithXcode.js`](Scripts/checkWithXcode.js) - Xcode project validation
- [`qmakeBuild.js`](Scripts/qmakeBuild.js) - QMake project builds

### Shell Utilities
- [`shellCall.js`](Scripts/shellCall.js) - Execute shell commands
- [`getGccInfo.js`](Scripts/getGccInfo.js) - GCC compiler information
- [`gccSettings.js`](Scripts/gccSettings.js) - GCC configuration utilities

### Directory Operations
- [`directoryList.js`](Scripts/directoryList.js) - List directory contents
- [`directoryCreate.js`](Scripts/directoryCreate.js) - Create directories
- [`mkdir.js`](Scripts/mkdir.js) - Create single directory

### HTTP Tools
- [`httpTools.js`](Scripts/httpTools.js) - HTTP request utilities
- [`fetchResource.js`](Scripts/fetchResource.js) - MCP resource fetching
- [`previewFile.js`](Scripts/previewFile.js) - File preview functionality

### Core Utilities
- [`tool_entry.js`](Scripts/tool_entry.js) - Tool entry point registry
- [`bootstrap.js`](Scripts/bootstrap.js) - Bootstrap utilities
- [`sharedFunctions.js`](Scripts/sharedFunctions.js) - Shared helper functions

## Documentation Links

### Handler Components
- **[README-Handler.md](README-Handler.md)** - Detailed handler components documentation including MyResourceHandler and FileAccessHandler

### Scripting System
- **[README-Scripting.md](README-Scripting.md)** - JavaScript scripting integration with full API reference and examples

### Sample Plugin
- **[README-SamplePlugin.md](README-SamplePlugin.md)** - Building SamplePlugin bundle and dylib documentation

### Server Implementation
- **[README-MCPServer.md](README-MCPServer.md)** - MCP HTTP Server implementation with architecture and protocol methods

## Project Structure Summary

### MCPStudio_ToolSDK/
- **Scripts/** - JavaScript utilities for file operations, build tools, shell commands, HTTP requests
- **SamplePlugin/** - CMake-based plugin template with dylib and bundle implementations
- **test-scripts/** - Test suite for validating utility functions

## Key Features

### JavaScript Scripting Integration
- Full API access to file system, build tools, HTTP client
- Parameterized tool execution with logging
- Secure macOS sandbox support

### Plugin System
- Support for dynamic libraries (.dylib) and bundles (.bundle)
- CMake-based build configuration
- Tool descriptor registration via `toolDescribe()`
- ABI-compliant entry points (`toolEntry`, `toolExecute`)

### Build Automation
- CMake project builds with custom flags
- Xcode project validation and building
- QMake support for Qt projects
- GCC/Clang compiler integration

### Secure Operations
- macOS security-scoped file access
- Plugin loading with secure bookmarks
- Sandboxed execution environment

## Configuration

The MCP Studio application uses the following configuration directories:

```
Tools/     - Custom tool configurations
Resources/ - Resource definitions
Prompts/   - Prompt templates and configurations
```

## Getting Started

1. **Clone or navigate to the SDK directory**
2. **Review the README files** linked above for detailed documentation
3. **Build the SamplePlugin** to understand plugin structure
4. **Create custom scripts** in the Scripts/ directory
5. **Configure tools** via [MCP Studio App](https://mcpstudio.eofsl.com/download.html) or configuration files

## License

Copyright (C) 2026 EoF Software Lab. All rights reserved.

---

*Last updated: 2026 | SDK Version: 1.0*
