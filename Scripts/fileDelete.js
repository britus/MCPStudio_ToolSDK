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
    var success = Swift.deleteFile(path);
    
    if (!success) {
        return shared.createErrorResult("Failed to delete file: " + path);
    }
    
    var result = {
        success: "File successfully deleted.",
        path: path,
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	path: path,
            operation: "deleteFile",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	deleteFile
};