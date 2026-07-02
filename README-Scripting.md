# API/Tool Summary - README-Scripting.md

---

## MCP Studio Tool SDK - Scripting Reference Guide

### Overview
This document provides a comprehensive summary of all available tools, their functions, parameters, and usage patterns for the MCP Studio Tool SDK environment. All tool scripts follow consistent patterns for reliability and maintainability.

---

## Table of Contents
1. [Import Instructions](#import-instructions)
2. [Tool Entry Function Requirements](#tool-entry-function-requirements)
3. [Shared Functions Reference](#shared-functions-reference)
4. [Built-in Tools Reference](#built-in-tools-reference)
5. [Code Patterns and Best Practices](#code-patterns-and-best-practices)
6. [Error Handling](#error-handling)
7. [Result Format Specification](#result-format-specification)

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

### Implementation Example (tool_entry.js)

```javascript
// ===================================================================
// Tool entry main script - FIXED VERSION
// ===================================================================
// Import shared functions
const shared = require('sharedFunctions');
// Toolchain
const analyzedir = require('analyzeDirectory');
const httpTools = require('httpTools');
const fetchPrompt = require('fetchPrompt');
const fetchResource = require('fetchResource');
const checkWithXcode = require('checkWithXcode');
const clangTools = require('clangTools');
const shellCall = require('shellCall');
const skillExecute = require('skill_execute');
const cmakeBuild = require('cmakeBuild');
const qmakeBuild = require('qmakeBuild');
// ... register all other tools
const HANDLERS = {
  // File based Toolchain
  analyzeDirectory: (params) => analyzedir.analyzeDirectory(params),
  mkdir: (params) => mkdir.mkdir(params),
  checkWithXcode: (params) => checkWithXcode.checkWithXcode(params),
  shellCall: (params) => shellCall.shellCall(params),
  // ... etc
};
const VALID_HANDLERS = Object.keys(HANDLERS);

function getHandler(handlerName) {
  if (!VALID_HANDLERS.includes(handlerName)) {
    return null;
  }
  return HANDLERS[handlerName];
}

function parseParams(jsonParams) {
  if (!jsonParams) {
    throw new Error("Missing jsonParams parameter");
  }
  try {
    return JSON.parse(jsonParams);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message || e}`);
  }
}

/**
* Entry point for all MCP script tool calls
* @param {string} sid - Session identifier
* @param {string} handlerName - Method/handler name to execute
* @param {string} jsonParams - JSON string with parameters
* @returns {string} JSON result or plain text
*/
function toolEntry(sid, handlerName, jsonParams) {
  console.log(`[toolEntry]: sid=${sid || 'sid.unknown'} handler=${handlerName || 'Unknown'}`);
  try {
    const handler = getHandler(handlerName);
    if (!handler) {
      return shared.error(`Unknown handler: ${handlerName}.`);
    }
    const params = parseParams(jsonParams);
    return handler(params);
  } catch(e) {
    console.error(`[toolEntry] ${e.message || e}`);
    return shared.error(e.message || e.toString());
  }
}

module.exports = { toolEntry };
```

---

## Shared Functions Reference

### Core Utility Functions (sharedFunctions.js)

All tools should import and use the shared functions for consistent behavior:

```javascript
const shared = require('sharedFunctions');
```

#### Result Creation Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `success(data, metadata)` | Creates a success result with data | JSON string |
| `error(message)` | Creates an error result with message | JSON string |
| `createSuccessResult(data, metadata)` | Creates success result (verbose) | JSON string |
| `createErrorResult(errorMessage)` | Creates error result (verbose) | JSON string |
| `setToolResultPayload(text, metadata)` | Sets tool result via MCPStudio bridge | null |
| `setSuccessResult(data, metadata)` | Sets success result via MCPStudio | null |
| `setErrorResult(errorMessage, metadata)` | Sets error result via MCPStudio | null |

#### Validation Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `validatePath(rawPath, parameterName, options)` | Validates path string | `{ok: bool, message: string, value: string}` |
| `validateFilePath(rawPath, parameterName, options)` | Validates file path (required) | Validation result object |
| `validateDirectoryPath(rawPath, parameterName, options)` | Validates directory path (required) | Validation result object |

#### Helper Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `ensureDirectory(path)` | Ensures directory exists, creates if needed | void |
| `normalizePath(path)` | Normalizes path string | normalized path or null |
| `joinPath(basePath, childName)` | Joins two path segments | joined path string |
| `quoteShellArgument(value)` | Quotes shell argument safely | quoted string |
| `countWords(text)` | Counts words in text | number |

#### Output Access Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `getOutput()` | Returns stdout array | Array<string> |
| `getStandardOutput()` | Returns standard output | Array<string> |
| `getErrorOutput()` | Returns stderr array | Array<string> |

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
function saveFile(params) {
var filePath = params.file_path || "";
var content = params.content || "";
var encoding = params.encoding || "utf-8";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file_path | string | Yes | - | Absolute or relative path to file |
| content | string | Yes | - | Content to save in file |
| encoding | string | No | utf-8 | File encoding (utf-8, ascii, etc.) |

**Usage Example**:
```javascript
const result = fileSave({
  file_path: "/path/to/file.txt",
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

### 7. mkdir.js / directoryCreate.js

**Purpose**: Create directories at specified paths

```javascript
function mkdir(params) {
var dirPath = params.dirPath || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| dirPath | string | Yes | - | Full qualified path of directory to create |

**Usage Example**:
```javascript
const result = mkdir({
  dirPath: "/Users/eofmc/EoF/mcpstudio/MCPStudio_ToolSDK/NewFolder"
});
```

---

### 8. fileDelete.js

**Purpose**: Delete files or directories

```javascript
function deleteFile(params) {
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

### 9. httpGet.js (via httpTools)

**Purpose**: Fetch/get data from web sites or web services

```javascript
function fetchData(params) {
var url = params.url || "";
}
```

**Parameters Table**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| url | string | Yes | - | Full qualified URL to fetch data from |
| headers | Object | No | {} | Optional HTTP headers |
| saveToFile | string | No | - | Optional file path to save response |

**Usage Example**:
```javascript
const result = httpTools("fetchData", {
  url: "https://api.example.com/data"
});
```

---

### 10. httpPost.js (via httpTools)

**Purpose**: POST JSON data to web sites or web services

```javascript
function postData(params) {
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
const result = httpTools("postData", {
  url: "https://api.example.com/submit",
  data: {
    "name": "Test",
    "value": 123
  }
});
```

---

### 11. fileExists.js

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

### 12. Additional Tools

#### clangTools.js
- `clangCheckSyntax(params)` - Check C/C++ syntax with clang
- `clangCompile(params)` - Compile C/C++ code with clang
- `clangMake(params)` - Run make with clang toolchain

#### cmakeBuild.js
- `cmakeBuild(params)` - Build project using CMake

#### qmakeBuild.js
- `qmakeBuild(params)` - Build Qt project using QMake

#### checkWithGcc.js
- `checkWithGcc(params)` - Build and validate GCC projects

#### gccSettings.js
- `gccSettings(params)` - Configure GCC compiler settings

#### getGccInfo.js
- `getGccInfo(params)` - Get GCC compiler information

#### fetchPrompt.js
- `fetchPrompt(params)` - Fetch MCP prompt resources

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
Use console.log() in all tools for consistent output (logs to stdOut):

```javascript
function taskLog(message) {
  console.log(message);
  stdOut.push(message);
}

taskLog("=== Tool Name Task ===");
taskLog("Processing item: " + item);
taskLog("Operation completed at: " + new Date());
```

---

### Pattern 3: Input Validation
Always validate required parameters before execution:

```javascript
function myTool(params) {
  var requiredParam = params.requiredParam || "";
  // Validate input using shared validation functions
  var validation = shared.validateFilePath(requiredParam, "requiredParam");
  if (!validation.ok) {
    return shared.setErrorResult(validation.message, { operation: "myTool" });
  }
  // Proceed with execution
  // ...
}
```

---

### Pattern 4: Result Handling
Use MCPStudio.setToolResult() or shared.* functions to communicate results:

```javascript
// Success case - using shared helper
return shared.setSuccessResult(result, {
  operation: "myTool",
  path: operationPath
});

// Or using MCPStudio directly
MCPStudio.setToolResult(JSON.stringify({
  text: "Operation completed successfully",
  metadata: {
    success: true,
    code: "OPERATION_SUCCESS",
    path: operationPath
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
    path: operationPath
  }
}));
return null;
```

---

### Pattern 5: Error Creation Helper
Use shared.error() or shared.setErrorResult() for consistent error messages:

```javascript
// Simple error
return shared.error("Missing required parameter: " + paramName);

// Detailed error with metadata
return shared.setErrorResult(errorMessage, {
  operation: "myTool",
  path: operationPath,
  code: "MISSING_PARAMETER"
});
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

### Pattern 7: Module Exports
All tool scripts must export their main function:

```javascript
module.exports = {
  checkWithXcode,      // Or specific exported function name
  toolEntry            // Required entry point for tool_entry.js
};
```

**Example - Tool Handler Export**:
```javascript
module.exports = {
  checkWithXcode
};

// Example - Tool Entry Script Export (must always include toolEntry)
module.exports = {
  toolEntry
};
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
| INVALID_JSON | JSON parsing failed |

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

### Validation Error Format

Use validation result objects for parameter validation errors:

```javascript
var validation = shared.validateFilePath(rawPath, "filePath");
if (!validation.ok) {
  return shared.setErrorResult(validation.message, {
    operation: "myTool"
  });
}
```

---

## Result Format Specification

### Success Response Format

```json
{
  "text": "{\"content\": \"...\", \"path\": \"/path/to/file\"}",
  "success": true,
  "metadata": {
    "path": "/path/to/operation",
    "operation": "readFile",
    "code": "OPERATION_SUCCESS"
  }
}
```

### Failure Response Format

```json
{
  "text": "Error: Operation failed with exit code 1",
  "success": false,
  "metadata": {
    "path": "/path/to/operation",
    "error": "Operation failed",
    "code": "OPERATION_FAILED",
    "exitCode": 1
  }
}
```

---

## Tool Export Pattern

All tool scripts must export their main function:

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

## Quick Start Guide

1. **Create tool script** with proper function signature
2. **Import shared functions**: `const shared = require('sharedFunctions');`
3. **Implement input validation** using shared validation functions
4. **Use console.log()** for logging (logs to stdOut)
5. **Call MCPStudio.* methods** for file operations, shell execution, etc.
6. **Set result via** `MCPStudio.setToolResult()` or `shared.setSuccessResult()/setErrorResult()`
7. **Export main function** from module: `module.exports = { functionName }`

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

## References

- checkWithXcode.js - Xcode project build utility
- shellCall.js - Shell command execution wrapper
- fileRead.js - File reading utility
- fileSave.js - File writing utility
- analyzeDirectory.js - Directory analysis utility
- fetchResource.js - MCP resource fetching utility
- httpTools.js - HTTP GET/POST requests
- sharedFunctions.js - Shared utility functions
- tool_entry.js - Main entry point handler

---

*Document generated for MCP Studio Tool SDK v1.0*
