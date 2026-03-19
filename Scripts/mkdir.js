// ===================================================================
// Handler Function: mkdir
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function mkdir(params) {
    var dirPath = params.dirPath || Swift.getDocumentsPath();
    
    console.log("Create directory: " + dirPath);
    
    if (Swift.fileExists(dirPath)) {
        return shared.createErrorResult("Directory already exist: " + dirPath);
    }
    
    // Create directory
    var success = Swift.createDirectory(dirPath);
    if (!success) {
        return shared.createErrorResult("Failed to create directory: " + dirPath);
    }
    
    var result = {
        success: "Directory successfully created.",
        path: dirPath,
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            operation: "mkdir",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	mkdir
};