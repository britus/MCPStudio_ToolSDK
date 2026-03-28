// ===================================================================
// Handler Function: getTempPath
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function getTempPath(params) {
    console.log("Get temporary path");
    
    // Get temp directory
    var path = Swift.getTempPath();
    
    var result = {
        path: path,
        type: "temporary"
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	path: path,
            operation: "getTempPath",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	getTempPath
};