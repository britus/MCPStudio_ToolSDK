// ===================================================================
// Handler Function: fileExists
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function fileExists(params) {
    var path = params.path || "";
    
    if (path === "") {
        return shared.createErrorResult("Missing path parameter");
    }
    
    console.log("Check file existence: " + path);
    
    // Check if file exists
    var exists = MCPStudio.fileExists(path);
    
    var result = {
        exists: exists,
        path: path,
    };
    
    // Set result using MCPStudio bridge
    MCPStudio.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	exists: exists,
            path: path,
            operation: "fileExists",
            success: true
        }
    }));
  
    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
	fileExists
};