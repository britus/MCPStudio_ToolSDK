// ===================================================================
// Handler Function: testPaths
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testPaths() {
    console.log("--- Testing Path Functions ---");
    
    var docsPath = Swift.getDocumentsPath();
    var tempPath = Swift.getTempPath();
    
    console.log("Documents path: " + docsPath);
    console.log("Temp path: " + tempPath);
    
    var results = {
        documentsPath: docsPath,
        tempPath: tempPath,
        documentsExists: Swift.fileExists(docsPath),
        tempExists: Swift.fileExists(tempPath)
    };
    
    return JSON.stringify({
        text: JSON.stringify(results, null, 2),
        metadata: { test: "paths" }
    });
}

module.exports = {
	testPaths
};
