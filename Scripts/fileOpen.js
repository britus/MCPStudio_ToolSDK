// ===================================================================
// Handler Function: openFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Opens and reads a file at the specified path (alias for readFile)
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to open/read (required)
 * @returns {null|null} Returns null after setting tool result with file content or error
 */
function openFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var content;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "openFile"
        });
    }

    path = pathValidation.value;
    
    console.log("Open file: " + path);
    
    // Open file (alias for readFile)
    content = MCPStudio.openFile(path);
    
    if (content === null) {
        return shared.setErrorResult("Failed to open file: " + path, {
            operation: "openFile",
            path: path
        });
    }
    
    result = {
        content: content,
        path: path
    };

    return shared.setSuccessResult(result, {
        path: path,
        content: content,
        operation: "openFile"
    });
}

module.exports = {
	openFile
};
