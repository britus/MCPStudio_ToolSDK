// ===================================================================
// Handler Function: createDirectory -p
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Creates a directory at the specified path, including parent directories if needed
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to create (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory creation status or error
 */
function createDirectory(params) {
    var dirValidation = shared.validateDirectoryPath(
        params.dirPath || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio",
        "dirPath"
    );
    var dirPath;
    var success;
    var result;

    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "createDirectory"
        });
    }

    dirPath = dirValidation.value;

    console.log("Create directory: " + dirPath);
    
    // Create directory
    if (!MCPStudio.fileExists(dirPath)) {
        success = MCPStudio.createDirectory(dirPath);
        if (!success) {
            return shared.setErrorResult("Failed to create directory: " + dirPath, {
                operation: "createDirectory",
                path: dirPath
            });
        }
    }
    
    result = {
        status: "Directory successfully created.",
        path: dirPath
    };

    return shared.setSuccessResult(result, {
        path: dirPath,
        operation: "createDirectory"
    });
}

module.exports = {
	createDirectory
};
