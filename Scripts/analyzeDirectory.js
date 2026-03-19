// ===================================================================
// Handler Function: analyzeDirectory
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function analyzeDirectory(params) {
    var dirPath = params.dirPath || Swift.getDocumentsPath();
    
    console.log("Analyzing directory: " + dirPath);
    
    if (!Swift.fileExists(dirPath)) {
        return shared.createErrorResult("Directory not found: " + dirPath);
    }
    
    // List directory contents
    var items = Swift.listDirectory(dirPath);
    
    var analysis = {
        path: dirPath,
        totalItems: items.length,
        items: items.map(function(item) {
            var fullPath = dirPath + "/" + item;
            return {
                name: item,
                exists: Swift.fileExists(fullPath)
            };
        })
    };
    
    return shared.createSuccessResult(analysis, { operation: "analyzeDirectory" });
}

module.exports = {
	analyzeDirectory
};

