// ===================================================================
// Handler Function: getTempPath
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Gets the system temporary directory path
 * @param {Object} params - Command parameters (currently unused)
 * @returns {null|null} Returns null after setting tool result with temp path or error
 */
function getTempPath(params) {
    console.log("Get temporary path");
    
    // Get temp directory
    var path = MCPStudio.getTempPath();
    
    var result = {
        path: path,
        type: "temporary"
    };
    
    // Set result using MCPStudio bridge
    return shared.setSuccessResult(result, {
        path: path,
        operation: "getTempPath"
    });
}

module.exports = {
	getTempPath
};
