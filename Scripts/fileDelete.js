// ===================================================================
// Handler Function: deleteFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function deleteFile(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Delete file: " + path);
    
    // Delete file
    var success = MCPStudio.deleteFile(path);
    
    if (!success) {
        return shared.createErrorResult("Failed to delete file: " + path);
    }
    
    var result = {
        success: "File successfully deleted.",
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	path: path,
            operation: "deleteFile",
            success: true
        }
    }));
  
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	deleteFile
};