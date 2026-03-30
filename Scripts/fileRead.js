// ===================================================================
// Handler Function: readFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function readFile(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Read file: " + path);
    
    // Read file content
    var content = MCPStudio.readFile(path);
    
    if (content === null) {
        return shared.createErrorResult("Failed to read file: " + path);
    }
    
    var result = {
        content: content,
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
    	    path: path,
	        content: content,
            operation: "readFile",
            success: true
        }
    }));
  
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	readFile
};