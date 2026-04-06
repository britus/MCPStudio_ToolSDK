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
    var dirPath = params.dirPath || MCPStudio.getDocumentsPath();
    
    console.log("Analyzing directory: " + dirPath);
    
    if (!MCPStudio.fileExists(dirPath)) {
        return shared.createErrorResult("Directory not found: " + dirPath);
    }
    
    // List directory contents
    var items = MCPStudio.listDirectory(dirPath);
    
    var analysis = {
        path: dirPath,
        totalItems: items.length,
        items: items.map(function(item) {
            var fullPath = dirPath + "/" + item;
            return {
                name: item,
                exists: MCPStudio.fileExists(fullPath)
            };
        })
    };
    
    return shared.createSuccessResult(analysis, { operation: "analyzeDirectory" });
}

module.exports = {
	analyzeDirectory
};
