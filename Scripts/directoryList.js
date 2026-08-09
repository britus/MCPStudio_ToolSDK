// ===================================================================
// Handler Function: listDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Lists the contents of a directory at the specified path
 * @param {Object} params - Command parameters
 * @param {string} [params.path] - Path to the directory to list (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory contents or error
 */
function listDirectory(params) {
    var pathValidation = shared.validateDirectoryPath(
        params.path || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio",
        "path"
    );
    var path;
    var contents;
    var totalItems;
    var truncated;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "listDirectory"
        });
    }

    path = pathValidation.value;
    
    console.log("List directory: " + path);
    
    // List directory contents
    contents = MCPStudio.listDirectory(path);
    
    if (contents === null) {
        return shared.setErrorResult("Failed to list directory: " + path, {
            operation: "listDirectory",
            path: path
        });
    }

    totalItems = contents.length;
    truncated = totalItems > 1000;
    if (truncated) {
        contents = contents.slice(0, 1000);
    }
    
    result = {
        contents: contents,
        path: path,
        totalItems: totalItems,
        truncated: truncated
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "listDirectory"
    });
}

module.exports = {
	listDirectory
};
