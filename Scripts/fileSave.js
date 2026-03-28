// ===================================================================
// Handler Function: saveFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function saveFile(params) {
    var path = params.path || "";
    var content = params.content || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Save file: " + path);
    
    // Save file content
    var success = Swift.saveFile(path, content);
    
    if (!success) {
        return shared.createErrorResult("Failed to save file: " + path);
    }
    
    var result = {
        success: "File successfully saved.",
        path: path,
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
	        path: path,
            operation: "saveFile",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	saveFile
};