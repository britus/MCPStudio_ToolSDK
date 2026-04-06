// ===================================================================
// Handler Function: getDocumentsPath
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Gets the system documents directory path
 * @param {Object} params - Command parameters (currently unused)
 * @returns {null|null} Returns null after setting tool result with documents path or error
 */
function getDocumentsPath(params) {
    console.log("Get documents path");
    
    // Get documents directory
    var path = MCPStudio.getDocumentsPath();
    
    var result = {
        path: path,
        type: "documents"
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            path: path,
            operation: "getDocumentsPath",
            success: true
        }
    }));
    
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	getDocumentsPath
};
