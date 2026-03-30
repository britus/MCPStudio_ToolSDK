// ===================================================================
// Handler Function: testPaths
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testPaths() {
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
