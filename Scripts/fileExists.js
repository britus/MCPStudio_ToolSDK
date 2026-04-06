// ===================================================================
// Handler Function: fileExists
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Checks if a file or directory exists at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to check (required)
 * @returns {null|null} Returns null after setting tool result with existence status
 */
function fileExists(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Check file existence: " + path);
    
    // Check if file exists
    var exists = MCPStudio.fileExists(path);
    
    var result = {
        exists: exists,
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            exists: exists,
            path: path,
            operation: "fileExists",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	fileExists
};
