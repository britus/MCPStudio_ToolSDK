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

✅ **Full JavaScriptCore Integration**
- Modern JavaScript execution environment
- Error handling and exception reporting
- Per-session context management

✅ **File System Access**
- Read/write files

## JavaScript API Summary

### File Operations
```javascript
Swift.fileExists(path)          // Check existence
Swift.readFile(path)            // Read file content
Swift.saveFile(path, content)   // Write file
Swift.openFile(path)            // Read with logging
Swift.deleteFile(path)          // Delete file/directory
Swift.listDirectory(path)       // List contents
Swift.createDirectory(path)     // Create directory
```

### Path Utilities
```javascript
Swift.getDocumentsPath()        // Get Documents directory
Swift.getTempPath()             // Get Temp directory
```

### Logging
```javascript
console.log(message)            // Info log
console.error(message)          // Error log
console.warn(message)           // Warning log
console.debug(message)          // Debug log

Swift.log(type, code, message)  // Detailed logging
```

### Result Setting
```javascript
Swift.setToolResult(jsonString) // Set result from JavaScript
```

## Script Requirements

Every script MUST have a `toolEntry` function:

```javascript
function toolEntry(sid, handlerName, jsonParams) {
    // Required signature
    // Return JSON string or use Swift.setToolResult()
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

### Current State:
The code includes basic security practices but could be improved.

### Detailed Recommendations:

#### Input Sanitization for Scripts
Add input validation to prevent injection attacks:

```javascript
function sanitizePath(path) {
    // Remove potentially dangerous characters
    return path.replace(/(\.\.\/|\/\.\.\/)/g, '').replace(/[^a-zA-Z0-9._\-\/]/g, '');
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

## Debugging

1. Use `console.log()` liberally
2. Check log view for detailed logs
3. Test file paths with `Swift.fileExists()`
4. Validate JSON before parsing
5. Use the test script to verify functionality

## Support

For examples, check:
- `example_tool_script.js` - Full featured examples
- `test_script.js` - Test suite and verification

## License

Copyright © 2026 EoF Software Labs. All rights reserved.

---

**Need Help?**

1. Run the test script: `test_script.js`
2. Check the examples in `example_tool_script.js`
3. Review log view for debugging
