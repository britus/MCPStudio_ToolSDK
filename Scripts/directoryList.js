// ===================================================================
// Handler Function: listDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Lists the contents of a directory at the specified path
 * @param {Object} params - Command parameters
 * @param {string} [params.path] - Path to the directory to list (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory contents or error
 */
function listDirectory(params) {
    var path = params.path || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio";
    
    console.log("List directory: " + path);
    
    // List directory contents
    var contents = MCPStudio.listDirectory(path);
    
    if (contents === null) {
        return shared.createErrorResult("Failed to list directory: " + path);
    }
    
    var result = {
        contents: contents,
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            contents: contents,
            path: path,
            operation: "listDirectory",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	listDirectory
};
