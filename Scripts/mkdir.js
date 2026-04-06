// ===================================================================
// Handler Function: mkdir -p
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Creates a directory at the specified path, including parent directories if needed
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to create (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory creation status
 */
function mkdir(params) {
    var dirPath = params.dirPath || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio";
    
    console.log("Create directory: " + dirPath);
    
    // Create directory
    if (!MCPStudio.fileExists(dirPath)) {
        var success = MCPStudio.createDirectory(dirPath);
        if (!success) {
            return shared.createErrorResult("Failed to create directory: " + dirPath);
        }
    }
        
    var result = {
        success: "Directory successfully created.",
        path: dirPath,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            path: dirPath,
            operation: "mkdir",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	mkdir
};
