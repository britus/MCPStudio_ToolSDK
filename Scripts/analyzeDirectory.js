// ===================================================================
// Handler Function: analyzeDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Analyzes a directory and returns information about its contents
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to the directory to analyze (optional, defaults to documents path)
 * @returns {string} JSON string representing analysis result
 */
function analyzeDirectory(params) {
    var dirValidation = shared.validateDirectoryPath(
        params.dirPath || MCPStudio.getDocumentsPath(),
        "dirPath"
    );
    var dirPath;
    var items;
    var analysis;

    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "analyzeDirectory"
        });
    }

    dirPath = dirValidation.value;
    
    console.log("Analyzing directory: " + dirPath);
    
    if (!MCPStudio.fileExists(dirPath)) {
        return shared.setErrorResult("Directory not found: " + dirPath, {
            operation: "analyzeDirectory",
            path: dirPath
        });
    }
    
    // List directory contents
    items = MCPStudio.listDirectory(dirPath);
    if (items === null) {
        return shared.setErrorResult("Failed to list directory: " + dirPath, {
            operation: "analyzeDirectory",
            path: dirPath
        });
    }
    
    analysis = {
        path: dirPath,
        totalItems: items.length,
        items: items.map(function(item) {
            var fullPath = shared.joinPath(dirPath, item);
            return {
                name: item,
                exists: MCPStudio.fileExists(fullPath)
            };
        })
    };
    
    return shared.setSuccessResult(analysis, {
        operation: "analyzeDirectory",
        path: dirPath
    });
}

module.exports = {
	analyzeDirectory
};
