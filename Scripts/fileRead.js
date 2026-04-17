// ===================================================================
// Handler Function: readFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Reads and returns the content of a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to read (required)
 * @returns {null|null} Returns null after setting tool result with file content or error
 */
function readFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var content;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "readFile"
        });
    }

    path = pathValidation.value;
    
    console.log("Read file: " + path);
    
    // Read file content
    content = MCPStudio.readFile(path);
    
    if (content === null) {
        return shared.setErrorResult("Failed to read file: " + path, {
            operation: "readFile",
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
        operation: "readFile"
    });
}

module.exports = {
	readFile
};
