// ===================================================================
// Handler Function: getDocumentsPath
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function getDocumentsPath(params) {
    console.log("Get documents path");
    
    // Get documents directory
    var path = Swift.getDocumentsPath();
    
    var result = {
        path: path,
        type: "documents"
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
        	path: path,
            operation: "getDocumentsPath",
            success: true
        }
    }));
  
    return null; // Result already set via Swift.setToolResult
}

module.exports = {
	getDocumentsPath
};