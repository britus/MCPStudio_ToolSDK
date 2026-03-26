# EoF MCP Studio JavaScript Scripting System

Full-featured JavaScript scripting integration for Swift applications using JavaScriptCore.

## Quick Start

### Create a JavaScript Script

Create a file named `myScript.js`:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    if (handlerName === "hello") {
        return JSON.stringify({
            text: "Hello, " + (params.name || "World") + "!",
            metadata: { greeting: true }
        });
    }
    
    return JSON.stringify({
        error: "Unknown handler: " + handlerName
    });
}
```

## Example: Creating a Custom Tool

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    // Validate parameters
    if (!params.data) {
        return JSON.stringify({ error: "Missing data parameter" });
    }
    
    // Process the data
    var processed = params.data.toUpperCase();
    
    return JSON.stringify({
        text: processed,
        metadata: { 
            operation: "uppercase",
            originalLength: params.data.length
        }
    });
}
```

## Features

**Full JavaScriptCore Integration**
- Modern JavaScript execution environment
- Error handling and exception reporting
- Per-session context management

**File System Access**
- Read/write files

**Path Utilities**
- Directory listing and navigation

**Logging**
- Console API and Swift logging bridge

**Result Setting**
- Tool result JSON setting from JavaScript

## JavaScript API Summary

### File Operations
```javascript
Swift.fileExists(path)          // Check file existence, returns true or false
Swift.readFile(path)            // Read file content, returns string or nil on failure
Swift.saveFile(path, content)   // Write content to file, returns true on success or false
Swift.openFile(path)            // Alias for readFile with logging support
Swift.deleteFile(path)          // Delete file or directory, returns true on success or false
Swift.listDirectory(path)       // List directory contents, returns array of names
Swift.createDirectory(path)     // Create directory with parent paths if needed, returns true on success or false
```

### Path Utilities
```javascript
Swift.getDocumentsPath()        // Get user documents directory path, returns string
Swift.getTempPath()             // Get system temporary directory path, returns string
```

### Logging
```javascript
console.log(message)            // Info level log message
console.error(message)          // Error level log message
console.warn(message)           // Warning level log message
console.debug(message)          // Debug level log message

Swift.log(type, code, message)  // Detailed logging with Swift backend (type: string, code: int, message: string)
```

### Result Setting
```javascript
Swift.setToolResult(jsonString) // Set result from JavaScript, must be called before function returns
```

## Script Requirements

Every script MUST have a toolEntry function:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    // Required signature
    // sid: session ID string
    // handlerName: handler name requested by caller
    // jsonParams: raw JSON parameters as string from Swift controller
    // Return JSON string or use Swift.setToolResult() to set result object
}
```

## Result Format

Return results as JSON strings:

**Success:**
```json
{
    "text": "Result content or JSON data",
    "metadata": {
        "key": "value"
    }
}
```

**Error:**
```json
{
    "error": "Error message"
}
```

## Testing

Run the test script to verify functionality using the MCP Studio Script Editor

## Common Patterns

### Reading and Processing a File
```javascript
function processFile(params) {
    var content = Swift.readFile(params.filePath);
    if (!content) {
        return JSON.stringify({ error: "File not found" });
    }
    
    var lines = content.split('\n');
    var result = { lineCount: lines.length };
    
    return JSON.stringify({
        text: JSON.stringify(result),
        metadata: { operation: "count" }
    });
}
```

### Creating a Report
```javascript
function createReport(params) {
    var report = "Report Title\n" +
                 "Generated: " + new Date() + "\n\n" +
                 "Data: " + JSON.stringify(params.data);
    
    var outputPath = Swift.getTempPath() + "/report.txt";
    
    if (Swift.saveFile(outputPath, report)) {
        return JSON.stringify({
            text: "Report saved to: " + outputPath,
            metadata: { path: outputPath }
        });
    }
    
    return JSON.stringify({ error: "Failed to save report" });
}
```

### Batch Processing
```javascript
function batchProcess(params) {
    var files = Swift.listDirectory(params.directory);
    var results = [];
    
    files.forEach(function(file) {
        var path = params.directory + "/" + file;
        var content = Swift.readFile(path);
        
        if (content) {
            // Process content
            var processed = content.toUpperCase();
            var outPath = params.outputDir + "/" + file;
            
            Swift.saveFile(outPath, processed);
            results.push({ file: file, status: "success" });
        }
    });
    
    return JSON.stringify({
        text: JSON.stringify({ processed: results.length }),
        metadata: { results: results }
    });
}
```

## Advanced Features

### Input Validation with @schema

Add a @schema block at the top of your script to define expected input types:

```javascript
/**
 * @schema {
 *   "input": { "type": "string", "description": "User input text" },
 *   "count": { "type": "number", "description": "Number of items to process" },
 *   "enabled": { "type": "bool", "description": "Enable or disable feature" }
 * }
 */

function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    // Validation is automatically performed by the Swift bridge
    if (params.count > 100) {
        return JSON.stringify({ error: "Count exceeds limit of 100" });
    }
    
    // Process data...
}
```

### Secure File Operations

Always validate paths before accessing files:

```javascript
function safeFileOperation(params) {
    var path = params.path;
    var allowedDirs = [Swift.getDocumentsPath(), Swift.getTempPath()];
    
    if (!allowedDirs.some(dir => path.startsWith(dir))) {
        return JSON.stringify({ error: "Path not allowed" });
    }
    
    if (Swift.fileExists(path)) {
        var content = Swift.readFile(path);
        if (content) {
            return JSON.stringify({
                text: content,
                metadata: { path: path }
            });
        }
    }
    
    return JSON.stringify({ error: "File not found" });
}
```

### Running External Commands 

Important Note: 
Xcode tools working with ['None' Sandbox Version](https://mcpstudio.eofsl.com/download.html) only

Use process() or shell() to execute external tools and capture output:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    var command = "/usr/bin/ls";
    var args = ["-la", "/tmp"];
    
    // setup receiver var
    // ctx.setObject(stdoutLines as NSArray, forKeyedSubscript: stdOutEntry as NSString)
    // ctx.setObject(stderrLines as NSArray, forKeyedSubscript: stdErrEntry as NSString)
    var outputLines = Array();
    var stdoutEntry = "outputLines";
    var errorLines = Array();
    var stderrEntry = "errorLines";
    
    var success = SwiftBridge.process(
        command,
        args,
        stdoutEntry,
        stderrEntry
    );
    
    if (success) {
        return JSON.stringify({
            text: "Executed " + command + " successfully",
            metadata: {
                stdout: stdoutEntry,
                stderr: stderrEntry
            }
        });
    } else {
        return JSON.stringify({ error: "Command failed" });
    }
}
```

### HTTP Requests

Make HTTP calls using httpGet, httpPost, or httpRequest:

#### GET Request
```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    // GET request with query parameters
    var result = SwiftBridge.httpGet(
        "https://api.example.com/v1/data",
        "{\"page\":1, \"q\":\"search\"}"
    );
    
    return JSON.stringify({
        text: result,
        metadata: { method: "GET", url: "example.com" }
    });
}
```

#### POST Request with Headers
```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    // POST request with body and custom headers
    var result = SwiftBridge.httpPost(
        "https://api.example.com/v1/upload",
        "{\"filename\":\"test.txt\"}",  // Request body as JSON string
        "{\"Authorization\":\"Bearer token\", \"Content-Type\":\"application/json\"}"
    );
    
    return JSON.stringify({
        text: result,
        metadata: { method: "POST" }
    });
}
```

#### Generic HTTP Request
```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    // Custom HTTP method request (GET, POST, PUT, DELETE, etc.)
    var result = SwiftBridge.httpRequest(
        "PUT",
        "https://api.example.com/v1/resource",
        "{\"id\":\"123\",\"name\":\"test\"}",  // Request body for methods with payload
        "{\"page\":1}"                        // Query parameters JSON string
    );
    
    return JSON.stringify({ text: result });
}
```

### Resource Configuration Access

Retrieve resource configurations by name:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var configName = jsonParams.resourceName || "default";
    
    var configJson = SwiftBridge.resourceConfig(configName);
    
    if (configJson.length > 0) {
        var configObj = JSON.parse(configJson);
        
        return JSON.stringify({
            text: "Resource configuration loaded",
            metadata: { 
                resourceName: configName,
                configVersion: configObj.version || "unknown"
            }
        });
    } else {
        return JSON.stringify({ error: "Resource not found: " + configName });
    }
}
```

### Prompt Configuration Access

Retrieve prompt configurations by name:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var promptName = jsonParams.promptName || "default";
    
    var promptJson = SwiftBridge.promptConfig(promptName);
    
    if (promptJson.length > 0) {
        var promptObj = JSON.parse(promptJson);
        
        return JSON.stringify({
            text: "Prompt configuration loaded",
            metadata: { 
                promptName: promptName,
                promptDescription: promptObj.description || ""
            }
        });
    } else {
        return JSON.stringify({ error: "Prompt not found: " + promptName });
    }
}
```

### Download Remote File

Download a file from URL to local filesystem:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    var params = JSON.parse(jsonParams);
    
    var url = params.remoteUrl;
    var destination = Swift.getTempPath() + "/" + "downloaded_file";
    
    if (SwiftBridge.downloadFile(url, destination)) {
        return JSON.stringify({
            text: "Download completed successfully",
            metadata: { 
                destination: destination,
                url: url
            }
        });
    } else {
        return JSON.stringify({ error: "Download failed" });
    }
}
```

## Error Handling

Always wrap your code in try-catch:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    try {
        var params = JSON.parse(jsonParams);
        // Your code here
    } catch(error) {
        console.error("Error: " + error.toString());
        return JSON.stringify({
            error: error.toString()
        });
    }
}
```

## Security Considerations

### Input Sanitization for Scripts

Add input validation to prevent injection attacks:

```javascript
function sanitizePath(path) {
    // Remove potentially dangerous characters
    return path.replace(/(\.\.\/|\/\.\/)/g, '').replace(/[^a-zA-Z0-9._\-\/]/g, '');
}

function validateFilePath(filePath) {
    // Ensure path is within allowed directories
    var allowedDirs = [Swift.getDocumentsPath(), Swift.getTempPath()];
    for (var i = 0; i < allowedDirs.length; i++) {
        if (filePath.startsWith(allowedDirs[i])) {
            return true;
        }
    }
    return false;
}
```

## Best Practices

1. **Validate inputs** before processing
2. **Check file existence** before operations
3. **Use structured error messages**
4. **Log important operations**
5. **Return metadata** for context
6. **Clean up temporary files**
7. **Handle JSON parsing errors**

## Performance Tips

- JavaScript contexts are cached per session
- Batch file operations when possible
- Use efficient data structures for large datasets

## Debugging

1. Use console.log() liberally
2. Check log view for detailed logs
3. Test file paths with Swift.fileExists()
4. Validate JSON before parsing
5. Use the test script to verify functionality

## API Reference

### SwiftBridge Object Methods

| Method | Parameters | Return Value | Description |
|--------|------------|--------------|-------------|
| `fileExists(path)` | path: string | boolean | Check if file/directory exists at path |
| `readFile(path)` | path: string | string or nil | Read file content as UTF-8 string, returns nil on failure |
| `saveFile(path, content)` | path: string, content: string | boolean | Write content to file atomically, returns true on success |
| `openFile(path)` | path: string | string or nil | Alias for readFile with logging support |
| `deleteFile(path)` | path: string | boolean | Remove file or directory, returns true on success |
| `listDirectory(path)` | path: string | array of strings | List directory contents as array of file/directory names |
| `createDirectory(path)` | path: string | boolean | Create directory with parent paths if needed |
| `getDocumentsPath()` | none | string | Get user documents directory path |
| `getTempPath()` | none | string | Get system temporary directory path |
| `console.log(message)` | message: string | void | Log info level message |
| `console.error(message)` | message: string | void | Log error level message |
| `console.warn(message)` | message: string | void | Log warning level message |
| `console.debug(message)` | message: string | void | Log debug level message |
| `Swift.log(type, code, message)` | type: string, code: integer, message: string | void | Detailed logging with Swift backend |
| `setToolResult(jsonString)` | jsonString: string | void | Set result object from JSON string |
| `httpGet(url, query)` | url: string, query: string or nil | string | Perform synchronous HTTP GET request |
| `httpPost(url, body, headers)` | url: string, body: string, headers: string | string | Perform synchronous HTTP POST request with custom headers |
| `httpRequest(method, url, body, params)` | method: string, url: string, body: string, params: string or nil | string | Generic HTTP request with any method (GET, POST, PUT, DELETE, etc.) |
| `downloadFile(url, destination)` | url: string, destination: string | boolean | Download remote file to local filesystem |
| `resourceConfig(name)` | name: string | string | Get resource configuration JSON by name |
| `promptConfig(name)` | name: string | string | Get prompt configuration JSON by name |

### SwiftBridge.process Method

```javascript
SwiftBridge.process(command, parameters, stdOutEntry, stdErrEntry)
```

Runs an external process synchronously and forwards output to JavaScript environment.

**Parameters:**
- `command`: Absolute path to the executable (e.g., "/usr/bin/node")
- `parameters`: Array of argument strings passed to the executable
- `stdOutEntry`: Name of global JS array that receives stdout lines
- `stdErrEntry`: Name of global JS array that receives stderr lines

**Returns:** boolean - true when process exits with code 0, false otherwise

**Example:**
```javascript
var success = SwiftBridge.process(
    "/usr/bin/ls",
    ["-la", "/tmp"],
    "outputLines",
    "errorLines"
);
```

### SwiftBridge.shell Method

```javascript
SwiftBridge.shell(script)
```

Executes a shell script string via /bin/sh -c synchronously and forwards output to JavaScript environment.

**Parameters:**
- `script`: Shell script source code to execute (string)

**Returns:** boolean - true when shell exits with code 0, false otherwise

**Example:**
```javascript
var success = SwiftBridge.shell("echo 'Hello World' && date");
```

## Scripting Controller Methods

The PluginController provides high-level scripting control methods:

### callScript Method

```swift
public func callScript(sid: String, scriptName: String, handlerName: String, json: String) -> JSONToolResult
```

Calls a script with the specified parameters.

**Parameters:**
- `sid`: Session ID for the script call
- `scriptName`: Name of the script file to execute
- `handlerName`: Name of the handler function to invoke in the script
- `json`: JSON string containing parameters for the script

**Returns:** JSONToolResult - Result object from script execution or error on failure

### clearScriptContext Method

```swift
public func clearScriptContext(sid: String)
```

Clears the JavaScript context for a specific session ID.

**Parameters:**
- `sid`: Session ID to clear context for

### clearAllScriptContexts Method

```swift
public func clearAllScriptContexts()
```

Clears all JavaScript contexts for all sessions.

### loadBundleScript Method (Internal)

```swift
private func loadBundleScript(_ name: String, subdirectory: String) -> String?
```

Loads a script file from the app bundle resource sub-directory.

**Parameters:**
- `name`: Script file name without extension
- `subdirectory`: Resource sub-directory path inside the bundle (e.g., "Resources/ToolSDK/Scripts")

**Returns:** Script content as string, or nil if the resource is not found

### loadScriptFile Method (Internal)

```swift
private func loadScriptFile(_ scriptName: String) -> String?
```

Loads a script file from the specified path.

**Parameters:**
- `scriptName`: Name/path of the script to load

**Returns:** Script content as string, or nil if loading fails

## Schema Validation Parameters

Scripts can define expected input parameters using the @schema annotation block at the top of the file:

### parseSchema Method (Internal)

```swift
private static func parseSchema(from scriptContent: String) -> [ScriptParameterSchema]?
```

Extracts and parses the @schema { ... } block from script source.

**Parameters:**
- `scriptContent`: Full JavaScript source text

**Returns:** Array of field descriptors, or nil if no @schema block present (validation is skipped if missing)

### ScriptParameterSchema Structure

Each descriptor contains:
- `name`: JSON key name of the parameter
- `type`: Expected JSON type - "string", "number", "bool", "array", "object"
- `description`: Human-readable description for error messages (optional)

### validate Method (Internal)

```swift
private static func validate(json: String, against schemas: [ScriptParameterSchema]) -> [ScriptParameterError]
```

Validates given JSON parameter string against provided schema descriptors.

**Parameters:**
- `json`: Raw JSON string passed to callScript (the json argument)
- `schemas`: Field descriptors produced by parseSchema

**Returns:** Array of validation errors; empty means the input is valid

## Error Codes

### File Operations
- 404: File not found or read error
- 500: General file operation failure

### HTTP Operations
- Returns JSON response with statusCode field from server

### Resource/Prompt Access
- -40110: Configuration not found (resourceConfig, promptConfig)

### Script Execution
- 1400: Invalid JSON result
- 1401: Result object missing attribute 'text'
- 1422: Parameter validation failed

## Support

For examples and testing, check:
- test_script.js - Test suite and verification
- example_tool_script.js - Full featured examples

## License

Copyright 2026 EoF Software Labs. All rights reserved.

---

**Need Help?**

1. Run the test script to verify functionality
2. Check the examples for usage patterns
3. Review log view for debugging information
4. Use console.log() and Swift.log() for diagnostic output