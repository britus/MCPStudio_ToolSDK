// ===================================================================
// Handler Function: listDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function listDirectory(params) {
    var path = params.path || Swift.getDocumentsPath();
    
    console.log("List directory: " + path);
    
    // List directory contents
    var contents = Swift.listDirectory(path);
    
    if (contents === null) {
        return shared.createErrorResult("Failed to list directory: " + path);
    }
    
    var result = {
        contents: contents,
        path: path,
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	contents: contents,
        	path: path,
            operation: "listDirectory",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	listDirectory
};