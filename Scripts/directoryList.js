// ===================================================================
// Handler Function: listDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function listDirectory(params) {
    var path = params.path || MCPStudio.getDocumentsPath();
    
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