// ===================================================================
// Handler Function: readFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Reads and returns the content of a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to read (required)
 * @returns {null|null} Returns null after setting tool result with file content or error
 */
function readFile(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Read file: " + path);
    
    // Read file content
    var content = MCPStudio.readFile(path);
    
    if (content === null) {
        return shared.createErrorResult("Failed to read file: " + path);
    }
    
    var result = {
        content: content,
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            path: path,
            content: content,
            operation: "readFile",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	readFile
};
