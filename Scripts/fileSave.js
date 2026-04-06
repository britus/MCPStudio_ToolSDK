// ===================================================================
// Handler Function: saveFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Saves content to a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.file_path - Path where to save the file (required)
 * @param {string} params.content - Content to write to the file (required)
 * @returns {null|null} Returns null after setting tool result with save status or error
 */
function saveFile(params) {
    var path = params.file_path || "";
    var content = params.content || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing parameter: file_path");
    }
    
    console.log("Save file: " + path);
    
    // Save file content
    var success = MCPStudio.saveFile(path, content);
    
    if (!success) {
        return shared.createErrorResult("Failed to save file: " + path);
    }
    
    var result = {
        success: "File successfully saved.",
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            path: path,
            operation: "saveFile",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	saveFile
};
