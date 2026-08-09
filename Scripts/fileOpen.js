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
    var limited;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "openFile"
        });
    }

    path = pathValidation.value;
    
    console.log("Open file: " + path);
    
    // Open file (alias for readFile)
    content = MCPStudio.readFile(path);
    
    if (content === null) {
        return shared.setErrorResult("Failed to open file: " + path, {
            operation: "openFile",
            path: path
        });
    }

    limited = shared.limitText(content);
    
    result = {
        content: limited.text,
        path: path,
        originalLength: limited.originalLength,
        truncated: limited.truncated
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "openFile"
    });
}

module.exports = {
	openFile
};
