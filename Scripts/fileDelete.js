// ===================================================================
// Handler Function: deleteFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Deletes a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to delete (required)
 * @returns {null|null} Returns null after setting tool result with deletion status or error
 */
function deleteFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var success;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "deleteFile"
        });
    }

    path = pathValidation.value;
    
    console.log("Delete file: " + path);
    
    // Delete file
    success = MCPStudio.deleteFile(path);
    
    if (!success) {
        return shared.setErrorResult("Failed to delete file: " + path, {
            operation: "deleteFile",
            path: path
        });
    }
    
    result = {
        success: "File successfully deleted.",
        path: path
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "deleteFile"
    });
}

module.exports = {
	deleteFile
};
