// ===================================================================
// Handler Function: testPaths
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Tests path retrieval functions (getDocumentsPath, getTempPath)
 * @param {Object} params - Command parameters (currently unused, for future extension)
 * @returns {string} JSON string representing path test results
 */
function testPaths(params) {
    console.log("--- Testing Path Functions ---");
    
    var docsPath = MCPStudio.getDocumentsPath();
    var tempPath = MCPStudio.getTempPath();
    
    console.log("Documents path: " + docsPath);
    console.log("Temp path: " + tempPath);
    
    var results = {
        documentsPath: docsPath,
        tempPath: tempPath,
        documentsExists: MCPStudio.fileExists(docsPath),
        tempExists: MCPStudio.fileExists(tempPath)
    };
    
    return JSON.stringify({
        text: JSON.stringify(results, null, 2),
        metadata: { test: "paths" }
    });
}

module.exports = {
	testPaths
};
