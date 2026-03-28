// ===================================================================
// Handler Function: openFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function openFile(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Open file: " + path);
    
    // Open file (alias for readFile)
    var content = Swift.openFile(path);
    
    if (content === null) {
        return shared.createErrorResult("Failed to open file: " + path);
    }
    
    var result = {
        content: content,
        path: path,
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
    	    path: path,
	        content: content,
            operation: "openFile",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	openFile
};