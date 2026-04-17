// ===================================================================
// Handler Function: saveFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Saves content to a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.file_path - Path where to save the file (required)
 * @param {string} params.content - Content to write to the file (required)
 * @returns {null|null} Returns null after setting tool result with save status or error
 */
function saveFile(params) {
    var pathValidation = shared.validateFilePath(params.file_path || "", "file_path");
    var path;
    var content = params.content || "";
    var success;
    var result;
    
    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "saveFile"
        });
    }

    path = pathValidation.value;
    
    console.log("Save file: " + path);
    
    // Save file content
    success = MCPStudio.saveFile(path, content);
    
    if (!success) {
        return shared.setErrorResult("Failed to save file: " + path, {
            operation: "saveFile",
            path: path
        });
    }
    
    result = {
        success: "File successfully saved.",
        path: path
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "saveFile"
    });
}

module.exports = {
	saveFile
};
