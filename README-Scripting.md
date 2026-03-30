# API/Tool Summary - README-Scripting.md

---

## MCP Studio Tool SDK - Scripting Reference Guide

### Overview

This document provides a comprehensive summary of all available tools, their functions, parameters, and usage patterns for the MCP Studio Tool SDK environment.

---

## Table of Contents

1. [Import Instructions](#import-instructions)
2. [Tool Entry Function Requirements](#tool-entry-function-requirements)
3. [Built-in Tools Reference](#built-in-tools-reference)
4. [Code Patterns and Best Practices](#code-patterns-and-best-practices)
5. [Error Handling](#error-handling)
6. [Result Format Specification](#result-format-specification)

---

## Import Instructions

All tool scripts are located in the Scripts directory and can be imported using Node.js require syntax:

```javascript
// Import shared functions (required for all tools)
const shared = require('sharedFunctions');

// Import specific tools
const checkWithXcode = require('checkWithXcode').checkWithXcode;
const shellCall = require('shellCall').shellCall;
const analyzeDirectory = require('analyzeDirectory').analyzeDirectory;

// Access all exports at once
const tools = {
    checkWithXcode: require('checkWithXcode'),
    shellCall: require('shellCall'),
    fileRead: require('fileRead'),
    // ... etc
};
```

---

## Tool Entry Function Requirements

Every tool script MUST implement the toolEntry function with the following signature:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    // Required signature
    // sid: session ID string
    // handlerName: handler name requested by caller
    // jsonParams: raw JSON parameters as string from MCPStudio controller
    // Return JSON string or use MCPStudio.setToolResult() to set result object then return null
}
```

### Implementation Example

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams); // Parse raw JSON string
    
    // Validate handler name exists in tool exports
    if (!toolExports[handlerName]) {
        MCPStudio.setToolResult({
            text: "Error: Handler not found: " + handlerName,
            metadata: {
                success: false,
                code: "HANDLER_NOT_FOUND"
            }
        });
        return null;
    }
    
    // Execute the requested handler with parsed parameters
    try {
        var result = toolExports[handlerName](params);
        
        if (result === null) {
            // Handler already set result via MCPStudio.setToolResult()
            return null;
        }
        
        // Return result as JSON string or let handler call MCPStudio.setToolResult()
        if (typeof result === 'object') {
            var jsonResult = JSON.stringify(result);
            MCPStudio.setToolResult(jsonResult);
            return null;
        }
        
        return result;
    } catch (error) {
        MCPStudio.setToolResult({
            text: "Error executing handler: " + error.message,
            metadata: {
                success: false,
                code: "EXECUTION_ERROR",
                error: error.message
            }
        });
        return null;
    }
}

module.exports = { toolEntry };
```

---

## Built-in Tools Reference

### 1. checkWithXcode.js

**Purpose**: Build and validate Xcode projects using xcodebuild

```javascript
function checkWithXcode(params) {
    // Required parameters:
    var projectName = params.projectName || "";
    var projectDir = params.projectDir || "";
    
    // Optional parameters:
    var scheme = params.scheme || "";
    var configuration = params.configuration || "Debug";
    var platform = params.platform || "macosx";
    var codesign = params.codesign || "";
    var cleanBuild = params.clean === true;
    var showOperationLogs = params.showOperationLogs === true;
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| projectName | string | Yes | - | Project name (without .xcodeproj) |
| projectDir | string | Yes | - | Absolute path to project directory |
| scheme | string | No | - | Scheme name, defaults to first scheme if empty |
| configuration | string | No | Debug | Build config: Debug/Release/Profile |
| platform | string | No | macosx | Target: macosx/iphoneos/iphonesimulator |
| clean | boolean | No | false | Clean build before building |
| showOperationLogs | boolean | No | false | Show verbose operation logs |
| codesign | string | No | - | Apple Developer Team Identifier |

**Usage Example**:
```javascript
const result = checkWithXcode({
    projectName: "MyProject",
    projectDir: "/path/to/project",
    scheme: "Debug",
    configuration: "Release",
    platform: "macosx",
    clean: true,
    showOperationLogs: false
});
```

---

### 2. shellCall.js

**Purpose**: Execute system shell commands with configurable parameters

```javascript
function shellCall(params) {
    // Required parameters:
    var command = params.command || "";
    
    // Optional parameters:
    var parameters = params.parameters || [];
    var shell = params.shell || "/bin/bash";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| command | string | Yes | - | Shell command to execute |
| parameters | Array<string> | No | [] | Command parameters as array |
| shell | string | No | /bin/bash | Shell for #! line: /bin/sh or /bin/bash |

**Usage Examples**:
```javascript
// Single command
const result = shellCall({
    command: "pwd"
});

// Command with parameters
const result = shellCall({
    command: "ls",
    parameters: ["-la"]
});

// Custom shell
const result = shellCall({
    command: "echo",
    parameters: ["Hello World"],
    shell: "/bin/sh"
});
```

---

### 3. fileRead.js

**Purpose**: Read content from files

```javascript
function fileRead(params) {
    var filePath = params.filePath || "";
    var encoding = params.encoding || "utf-8";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filePath | string | Yes | - | Absolute or relative path to file |
| encoding | string | No | utf-8 | File encoding (utf-8, ascii, etc.) |

**Usage Example**:
```javascript
const result = fileRead({
    filePath: "/path/to/file.txt",
    encoding: "utf-8"
});
```

---

### 4. fileSave.js

**Purpose**: Save content to files

```javascript
function fileSave(params) {
    var filePath = params.filePath || "";
    var content = params.content || "";
    var encoding = params.encoding || "utf-8";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filePath | string | Yes | - | Absolute or relative path to file |
| content | string | Yes | - | Content to save in file |
| encoding | string | No | utf-8 | File encoding (utf-8, ascii, etc.) |

**Usage Example**:
```javascript
const result = fileSave({
    filePath: "/path/to/file.txt",
    content: "Hello World",
    encoding: "utf-8"
});
```

---

### 5. analyzeDirectory.js

**Purpose**: Get summary of directory contents

```javascript
function analyzeDirectory(params) {
    var dirPath = params.dirPath || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| dirPath | string | Yes | - | Absolute path to directory |

**Usage Example**:
```javascript
const result = analyzeDirectory({
    dirPath: "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/Scripts"
});
```

---

### 6. fetchResource.js

**Purpose**: Retrieve MCP web resources or local documents

```javascript
function fetchResource(params) {
    var resourceName = params.resourceName || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| resourceName | string | Yes | - | Name of resource link or document |

**Usage Example**:
```javascript
const result = fetchResource({
    resourceName: "sample-document.json"
});
```

---

### 7. directoryCreate.js (mkdir)

**Purpose**: Create directories at specified paths

```javascript
function directoryCreate(params) {
    var dirPath = params.dirPath || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| dirPath | string | Yes | - | Full qualified path of directory to create |

**Usage Example**:
```javascript
const result = directoryCreate({
    dirPath: "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/NewFolder"
});
```

---

### 8. fileDelete.js

**Purpose**: Delete files or directories

```javascript
function fileDelete(params) {
    var path = params.path || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| path | string | Yes | - | Path to file or directory to delete |

**Usage Example**:
```javascript
const result = fileDelete({
    path: "/path/to/file.txt"
});
```

---

### 9. httpGet.js

**Purpose**: Fetch/get data from web sites or web services

```javascript
function httpGet(params) {
    var url = params.url || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | - | Full qualified URL to fetch data from |

**Usage Example**:
```javascript
const result = httpGet({
    url: "https://api.example.com/data"
});
```

---

### 10. httpPost.js

**Purpose**: POST JSON data to web sites or web services

```javascript
function httpPost(params) {
    var url = params.url || "";
    var data = params.data || {};
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | - | Full qualified URL to POST to |
| data | object | No | {} | JSON object as POST body data |

**Usage Example**:
```javascript
const result = httpPost({
    url: "https://api.example.com/submit",
    data: {
        "name": "Test",
        "value": 123
    }
});
```

---

### 11. plistBuddy.js

**Purpose**: macOS PlistBuddy operations for preference files

```javascript
function plistBuddy(params) {
    var filePath = params.filePath || "";
    var operation = params.operation || "";
    var key = params.key || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| filePath | string | Yes | - | Path to plist file |
| operation | string | Yes | - | Operation: get/set/delete/list |
| key | string | No | - | Plist key to operate on |

**Usage Examples**:
```javascript
// Get value
const result = plistBuddy({
    filePath: "/path/to/Preferences.plist",
    operation: "get",
    key: "KeyToRead"
});

// Set value
const result = plistBuddy({
    filePath: "/path/to/Preferences.plist",
    operation: "set",
    key: "KeyToWrite",
    value: "newValue"
});
```

---

### 12. fileExists.js

**Purpose**: Check if file exists at specified path

```javascript
function fileExists(params) {
    var path = params.path || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| path | string | Yes | - | Path to file to check |

**Usage Example**:
```javascript
const result = fileExists({
    path: "/path/to/file.txt"
});
```

---

## Code Patterns and Best Practices

### Pattern 1: Shared Functions Import

All tools must import shared functions for consistent behavior:

```javascript
// Required import for all tool scripts
const shared = require('sharedFunctions');

// Optional: other shared dependencies
const MCPStudio = require('MCPStudioRuntime');
```

---

### Pattern 2: Logging Helper Function

Use buildLog() helper in all tools for consistent output:

```javascript
function buildLog(message) {
    console.log(message);
    stdOut.push(message);
}
```

**Usage**:
```javascript
buildLog("=== Tool Name Task ===");
buildLog("Processing item: " + item);
buildLog("Operation completed at: " + new Date());
```

---

### Pattern 3: Input Validation

Always validate required parameters before execution:

```javascript
function myTool(params) {
    var requiredParam = params.requiredParam || "";
    
    // Validate input
    if (!requiredParam) {
        return shared.createErrorResult("Missing required parameter: requiredParam");
    }
    
    // Proceed with execution
    // ...
}
```

---

### Pattern 4: Result Handling

Use MCPStudio.setToolResult() to communicate results:

```javascript
// Success case
MCPStudio.setToolResult(JSON.stringify({
    text: "Operation completed successfully",
    metadata: {
        success: true,
        path: operationPath,
        code: operationCode,
        // ...
    }
}));
return null; // Result already set

// Failure case
MCPStudio.setToolResult(JSON.stringify({
    text: "Error: Operation failed",
    metadata: {
        success: false,
        code: "OPERATION_FAILED",
        error: errorMessage,
        // ...
    }
}));
return null;
```

---

### Pattern 5: Error Creation Helper

Use shared.createErrorResult() for consistent error messages:

```javascript
var errorCode = "MISSING_PARAMETER";
var errorMessage = "Missing required parameter: " + paramName;

MCPStudio.setToolResult(JSON.stringify({
    text: errorMessage,
    metadata: {
        success: false,
        code: errorCode,
        // ...
    }
}));
return null;
```

---

### Pattern 6: Command Execution

When executing shell commands, properly escape special characters:

```javascript
var command = params.command || "";
var escapedCommand = command.replace(/"/g, '\\"')
                            .replace('$', '\\$')
                            .replace('`', '\\`');
```

---

## Error Handling

### Common Error Codes

| Code | Description |
|------|-------------|
| MISSING_PARAMETER | Required parameter not provided |
| HANDLER_NOT_FOUND | Requested handler doesn't exist |
| FILE_NOT_FOUND | Specified file path does not exist |
| DIRECTORY_NOT_FOUND | Specified directory path does not exist |
| PERMISSION_DENIED | Insufficient permissions for operation |
| OPERATION_FAILED | Generic operation failure |
| EXECUTION_ERROR | Script execution error |

---

### Error Response Format

All errors should follow this format:

```javascript
MCPStudio.setToolResult(JSON.stringify({
    text: "Error: [Human readable message]",
    metadata: {
        success: false,
        code: "ERROR_CODE",
        path: operationPath,
        error: "[Stack trace or detailed error]"
    }
}));
```

---

## Result Format Specification

### Success Response Format

```json
{
    "text": "Operation completed successfully",
    "metadata": {
        "path": "/path/to/operation",
        "success": true,
        "code": "OPERATION_SUCCESS",
        "exitCode": 0,
        "stdout": [],
        "stderr": []
    }
}
```

### Failure Response Format

```json
{
    "text": "Error: Operation failed with exit code 1",
    "metadata": {
        "path": "/path/to/operation",
        "success": false,
        "code": "OPERATION_FAILED",
        "exitCode": 1,
        "stdout": [],
        "stderr": ["Error details..."]
    }
}
```

---

## Tool Export Pattern

All tool scripts must export their main function:

```javascript
module.exports = {
    checkWithXcode,      // Or specific exported function name
    toolEntry            // Required entry point
};
```

**Example**:
```javascript
// checkWithXcode.js exports
module.exports = {
    checkWithXcode
};

// shellCall.js exports
module.exports = {
    shellCall
};

// Tool entry script exports (must always include toolEntry)
module.exports = {
    toolEntry
};
```

---

## Complete Tool Entry Script Template

```javascript
// ===================================================================
// MCP Studio Tool SDK - Tool Entry Handler
// Required for all tool scripts to function properly
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Tool exports map (register all available tools)
var toolExports = {};

/**
 * Initialize and register available tools
 * @param {Object} tools - Object containing all available tool functions
 */
function initToolRegistry(tools) {
    // Register all available tools in the registry
    for (var key in tools) {
        if (tools.hasOwnProperty(key)) {
            toolExports[key] = tools[key];
        }
    }
}

/**
 * Initialize with checkWithXcode as default tool
 */
function init() {
    var checkWithXcode = require('checkWithXcode').checkWithXcode;
    var shellCall = require('shellCall').shellCall;
    var fileRead = require('fileRead').fileRead;
    var fileSave = require('fileSave').fileSave;
    // ... register all other tools
    
    initToolRegistry({
        checkWithXcode: checkWithXcode,
        shellCall: shellCall,
        fileRead: fileRead,
        fileSave: fileSave
    });
}

/**
 * Required tool entry function - MUST implement this signature
 * @param {string} sid - Session ID string
 * @param {string} handlerName - Handler name requested by caller
 * @param {string} jsonParams - Raw JSON parameters as string from MCPStudio controller
 * @returns {string|null} Return JSON string or null if using MCPStudio.setToolResult()
 */
function toolEntry(sid, handlerName, jsonParams) {
    // Parse raw JSON string parameters
    var params;
    try {
        params = JSON.parse(jsonParams);
    } catch (e) {
        MCPStudio.setToolResult({
            text: "Error: Failed to parse parameters JSON",
            metadata: {
                success: false,
                code: "INVALID_JSON",
                error: e.message,
                path: sid,
                handlerName: handlerName
            }
        });
        return null;
    }

    // Validate handler name exists in tool exports
    if (!toolExports[handlerName]) {
        MCPStudio.setToolResult({
            text: "Error: Handler not found: " + handlerName,
            metadata: {
                success: false,
                code: "HANDLER_NOT_FOUND",
                path: sid,
                handlerName: handlerName
            }
        });
        return null;
    }

    // Execute the requested handler with parsed parameters
    try {
        var result = toolExports[handlerName](params);

        if (result === null) {
            // Handler already set result via MCPStudio.setToolResult()
            return null;
        }

        // Return result as JSON string or let handler call MCPStudio.setToolResult()
        if (typeof result === 'object') {
            var jsonResult = JSON.stringify(result);
            MCPStudio.setToolResult(jsonResult);
            return null;
        }

        return result;

    } catch (error) {
        MCPStudio.setToolResult({
            text: "Error executing handler: " + error.message,
            metadata: {
                success: false,
                code: "EXECUTION_ERROR",
                error: error.message,
                stack: error.stack,
                path: sid,
                handlerName: handlerName
            }
        });
        return null;
    }
}

// Initialize tool registry
init();

module.exports = {
    toolEntry
};
```

---

## Quick Start Guide

1. **Create tool script** with proper function signature
2. **Implement buildLog()** helper for consistent logging
3. **Validate all inputs** before execution
4. **Use MCPStudio.setToolResult()** to return results
5. **Export main function** from module
6. **Register in toolEntry** via shared registry

---

## References

- checkWithXcode.js - Xcode project build utility
- shellCall.js - Shell command execution wrapper
- fileRead.js - File reading utility
- fileSave.js - File writing utility
- analyzeDirectory.js - Directory analysis utility
- fetchResource.js - MCP resource fetching utility
- httpGet.js - HTTP GET requests
- httpPost.js - HTTP POST requests

---

*Document generated for MCP Studio Tool SDK v1.0*
