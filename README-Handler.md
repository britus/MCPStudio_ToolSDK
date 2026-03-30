# MCP Studio Tool SDK - Handler Documentation

This document provides comprehensive documentation for all available tool handlers in the MCP Studio Tool SDK. Each handler follows a consistent interface pattern and can be called through the `toolEntry` entry point.

---

## Table of Contents

1. [Handler System Overview](#handler-system-overview)
2. [Toolchain Handlers](#toolchain-handlers)
3. [File Operation Handlers](#file-operation-handlers)
4. [HTTP/MCP Handlers](#httpmcp-handlers)
5. [Path Utility Handlers](#path-utility-handlers)
6. [Handler Parameters Format](#handler-parameters-format)
7. [Error Handling](#error-handling)

---

## Handler System Overview

All handlers are orchestrated through the `tool_entry.js` entry point script. Each handler accepts a JSON object as parameters and returns either:
- A **JSON result** for structured data operations
- **Plain text** for simple operations (e.g., log messages)

### Calling Convention

```javascript
// Basic call format
const result = toolEntry(sessionId, handlerName, JSON.stringify(params));
```

Example:
```javascript
toolEntry("session123", "fileExists", JSON.stringify({
    "path": "/path/to/test/file.txt"
}));
```

---

## Toolchain Handlers

### analyzeDirectory

**Description**: Analyzes and summarizes directory contents with detailed statistics.

**Parameters**:
```json
{
  "dirPath": "/path/to/directory",
  "recursive": true,
  "extensions": [".js", ".cpp"],
  "sort": "name"
}
```

**Returns**: JSON object with directory analysis results including file counts, sizes, and metadata.

**Example**:
```json
{
  "dirPath": "/path/to/EoF/mcpstudio/MCPStudio_ToolSDK/Scripts",
  "fileCount": 45,
  "totalSize": 234567,
  "files": [...]
}
```

---

### checkWithXcode

**Description**: Builds a project using Xcode with `xcodebuild`.

**Parameters**:
```json
{
  "projectDir": "/path/to/project",
  "projectName": "MyProject",
  "scheme": "",
  "configuration": "Debug",
  "platform": "macosx",
  "clean": false,
  "archive": false,
  "codeSigningIdentity": null,
  "onlyActiveArchs": false,
  "showOperationLogs": false
}
```

**Returns**: JSON build result with success status and logs.

---

### clangCheckSyntax

**Description**: Checks source code syntax using the Clang compiler.

**Parameters**:
```json
{
  "sourceFile": "/path/to/source.cpp"
}
```

**Returns**: JSON result indicating syntax validity or errors.

---

### clangCompile

**Description**: Compiles source code using the Clang compiler.

**Parameters**:
```json
{
  "sourceFile": "/path/to/source.cpp"
}
```

**Returns**: JSON compilation result with build status.

---

### clangMake

**Description**: Builds a Unix make project using `make`.

**Parameters**:
```json
{
  "makeFile": "/path/to/Makefile"
}
```

**Returns**: JSON build result with make output.

---

### cmakeBuild

**Description**: Builds a CMake project.

**Parameters**:
```json
{
  "projectDir": "/path/to/project",
  "projectTarget": "myapp",
  "buildType": "debug",
  "cmakeFlags": ["-DCMAKE_CXX_STANDARD=17"],
  "verbose": true
}
```

**Returns**: JSON build result with CMake output.

---

### qmakeBuild

**Description**: Builds a Qt/QMake project.

**Parameters**:
```json
{
  "projectDir": "/path/to/project",
  "projectTarget": "myapp",
  "qtdir": "/usr/local/qt6",
  "buildType": "debug",
  "verbose": true
}
```

**Returns**: JSON build result with QMake output.

---

### shellCall

**Description**: Executes arbitrary Unix shell commands.

**Parameters**:
```json
{
  "command": "ls -la",
  "parameters": [],
  "shell": "/bin/bash"
}
```

**Returns**: JSON result with command output (stdout/stderr).

---

## File Operation Handlers

### mkdir

**Description**: Creates a directory at the specified path.

**Parameters**:
```json
{
  "dirPath": "/path/to/new/directory"
}
```

**Returns**: Plain text success message or error.

---

### fileExists

**Description**: Checks if a file exists at the specified path.

**Parameters**:
```json
{
  "path": "/path/to/file.txt"
}
```

**Returns**: JSON object with `exists: true/false` and metadata.

**Example**:
```json
{
  "exists": true,
  "path": "/path/to/test/file.txt",
  "size": 1024,
  "modified": "2026-03-30T16:09:03.417Z"
}
```

---

### readFile

**Description**: Reads file contents from the specified path.

**Parameters**:
```json
{
  "file_path": "/path/to/file.txt"
}
```

**Returns**: JSON object with `content` field containing file text.

---

### saveFile

**Description**: Saves/writes content to a file.

**Parameters**:
```json
{
  "file_path": "/path/to/file.txt",
  "content": "Hello, World!"
}
```

**Returns**: Plain text success message or error.

---

### openFile

**Description**: Opens a file for reading (returns file handle/content).

**Parameters**:
```json
{
  "file_path": "/path/to/file.txt"
}
```

**Returns**: JSON object with file content.

---

### deleteFile

**Description**: Deletes a file at the specified path.

**Parameters**:
```json
{
  "path": "/path/to/file.txt"
}
```

**Returns**: Plain text success message or error.

---

### listDirectory

**Description**: Lists all files in a directory (supports filtering by extension).

**Parameters**:
```json
{
  "path": "/path/to/directory",
  "extensions": [".js"],
  "recursive": true,
  "sort": "name"
}
```

**Returns**: JSON array of file objects with metadata.

---

### createDirectory

**Description**: Creates a directory at the specified path.

**Parameters**:
```json
{
  "dirPath": "/path/to/new/directory"
}
```

**Returns**: Plain text success message or error.

---

### getDocumentsPath

**Description**: Returns the user's Documents folder path.

**Parameters**: None (or `{"path": ""}` for consistency).

**Returns**: String containing the Documents folder path.

---

### getTempPath

**Description**: Returns the system temporary directory path.

**Parameters**: None (or `{"path": ""}` for consistency).

**Returns**: String containing the temp directory path.

---

## HTTP/MCP Handlers

### fetchData (fetchData)

**Description**: Fetches data from a URL (GET request).

**Parameters**:
```json
{
  "url": "https://api.example.com/data"
}
```

**Returns**: JSON object with `status`, `headers`, and `body` fields.

---

### postData (postData)

**Description**: Sends POST request to a URL.

**Parameters**:
```json
{
  "url": "https://api.example.com/endpoint",
  "method": "POST",
  "contentType": "application/json",
  "body": {"key": "value"}
}
```

**Returns**: JSON object with response data.

---

### fetchJSON (fetchJSON)

**Description**: Fetches and parses JSON from a URL.

**Parameters**:
```json
{
  "url": "https://api.example.com/data.json"
}
```

**Returns**: Parsed JSON object or error message.

---

### downloadFile (downloadFile)

**Description**: Downloads a file from a URL and saves to local path.

**Parameters**:
```json
{
  "url": "https://example.com/file.zip",
  "destPath": "/path/to/save/file.zip"
}
```

**Returns**: JSON object with download status and file info.

---

### scrapeWebpage (scrapeWebpage)

**Description**: Scrapes HTML content from a webpage.

**Parameters**:
```json
{
  "url": "https://example.com",
  "selector": ".content"
}
```

**Returns**: JSON object with scraped content.

---

### apiRequest (apiRequest)

**Description**: Generic API request handler supporting all HTTP methods.

**Parameters**:
```json
{
  "url": "https://api.example.com/endpoint",
  "method": "GET|POST|PUT|DELETE",
  "headers": {"Authorization": "Bearer token"},
  "body": {"key": "value"}
}
```

**Returns**: JSON object with API response.

---

### checkStatus (checkStatus)

**Description**: Checks HTTP status of a URL.

**Parameters**:
```json
{
  "url": "https://example.com"
}
```

**Returns**: JSON object with HTTP status code and headers.

---

### webhookCall (webhookCall)

**Description**: Sends a webhook notification.

**Parameters**:
```json
{
  "url": "https://webhook.site/endpoint",
  "method": "POST",
  "body": {"message": "Hello"}
}
```

**Returns**: JSON object with webhook delivery status.

---

## Path Utility Handlers

### getDocumentsPath

**Description**: Returns the user's Documents folder path.

**Parameters**: None (or `{"path": ""}` for consistency).

**Returns**: String containing the Documents folder path.

---

### getTempPath

**Description**: Returns the system temporary directory path.

**Parameters**: None (or `{"path": ""}` for consistency).

**Returns**: String containing the temp directory path.

---

## Handler Parameters Format

All handlers accept parameters as a JSON object. The structure varies by handler but typically includes:

```json
{
  "key1": "value1",
  "key2": "value2"
}
```

### Common Parameter Types

| Type | Description | Example |
|------|-------------|---------|
| `string` | Path, URL, or text content | `"/path/to/file"` |
| `boolean` | Enable/disable flags | `true/false` |
| `array` | Lists of items (files, extensions) | `[".js", ".cpp"]` |
| `object` | Complex data structures | `{ "key": "value" }` |

---

## Error Handling

All handlers return errors in a consistent JSON format:

```json
{
  "error": true,
  "message": "Error description here",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `FILE_NOT_FOUND`: File or directory does not exist
- `PERMISSION_DENIED`: Insufficient permissions
- `INVALID_PATH`: Path format is invalid
- `BUILD_FAILED`: Build operation failed
- `NETWORK_ERROR`: Network connectivity issue

---

## Shared Functions

The SDK includes a shared functions module for common operations:

```javascript
const shared = require('sharedFunctions');

// Error handling
shared.error("Error message");

// Logging (if implemented)
shared.log("Log message");
```

---

## Best Practices

1. **Always validate paths** before file operations
2. **Handle errors gracefully** by checking return values
3. **Use appropriate build types** (Debug/Release) for builds
4. **Clean builds** when necessary to avoid stale artifacts
5. **Log important operations** for debugging

---

## Quick Reference

| Handler | Category | Use Case |
|---------|----------|----------|
| `analyzeDirectory` | Toolchain | Directory analysis |
| `checkWithXcode` | Toolchain | Xcode builds |
| `clangCheckSyntax` | Toolchain | Syntax checking |
| `cmakeBuild` | Toolchain | CMake builds |
| `qmakeBuild` | Toolchain | Qt builds |
| `shellCall` | Toolchain | Shell commands |
| `mkdir` | File Ops | Create directories |
| `fileExists` | File Ops | Check file existence |
| `readFile` | File Ops | Read file contents |
| `saveFile` | File Ops | Write file contents |
| `listDirectory` | File Ops | List directory contents |
| `fetchData` | HTTP | GET requests |
| `postData` | HTTP | POST requests |
| `fetchJSON` | HTTP | JSON fetching |
| `downloadFile` | HTTP | File downloads |

---

**Last Updated**: 2026-03-30  
**SDK Version**: MCPStudio_ToolSDK v1.0
