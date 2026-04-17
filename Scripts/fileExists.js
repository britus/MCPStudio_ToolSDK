// ===================================================================
// Handler Function: fileExists
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Checks if a file or directory exists at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to check (required)
 * @returns {null|null} Returns null after setting tool result with existence status
 */
function fileExists(params) {
    var pathValidation = shared.validatePath(params.path || "", "path");
    var path;
    var exists;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "fileExists"
        });
    }

    path = pathValidation.value;
    
    console.log("Check file existence: " + path);
    
    // Check if file exists
    exists = MCPStudio.fileExists(path);
    
    result = {
        exists: exists,
        path: path
    };

    return shared.setSuccessResult(result, {
        exists: exists,
        path: path,
        operation: "fileExists"
    });
}

module.exports = {
	fileExists
};
