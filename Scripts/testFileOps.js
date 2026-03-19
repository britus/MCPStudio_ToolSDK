// ===================================================================
// Handler Function: testFileOps
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testFileOps(params) {
    console.log("--- Testing File Operations ---");
    
    var testDir = params.testDir || Swift.getTempPath() + "/scriptTest";
    var testFile = testDir + "/test.txt";
    var testContent = "Hello from JavaScript!\nLine 2\nLine 3\nTimestamp: " + new Date().toISOString();
    
    var results = {
        operations: []
    };
    
    // Test 1: Create directory
    console.log("Creating directory: " + testDir);
    var dirCreated = Swift.createDirectory(testDir);
    results.operations.push({
        operation: "createDirectory",
        path: testDir,
        success: dirCreated
    });
    
    if (!dirCreated) {
        return JSON.stringify({
            error: "Failed to create test directory",
            results: results
        });
    }
    
    // Test 2: Write file
    console.log("Writing file: " + testFile);
    var fileSaved = Swift.saveFile(testFile, testContent);
    results.operations.push({
        operation: "saveFile",
        path: testFile,
        success: fileSaved,
        size: testContent.length
    });
    
    if (!fileSaved) {
        return JSON.stringify({
            error: "Failed to save test file",
            results: results
        });
    }
    
    // Test 3: Check file exists
    console.log("Checking file exists: " + testFile);
    var exists = Swift.fileExists(testFile);
    results.operations.push({
        operation: "fileExists",
        path: testFile,
        exists: exists
    });
    
    // Test 4: Read file
    console.log("Reading file: " + testFile);
    var readContent = Swift.readFile(testFile);
    var contentMatches = (readContent === testContent);
    results.operations.push({
        operation: "readFile",
        path: testFile,
        success: readContent !== null,
        contentMatches: contentMatches,
        readSize: readContent ? readContent.length : 0
    });
    
    // Test 5: List directory
    console.log("Listing directory: " + testDir);
    var items = Swift.listDirectory(testDir);
    results.operations.push({
        operation: "listDirectory",
        path: testDir,
        itemCount: items.length,
        items: items
    });
    
    // Test 6: Open file (alias for readFile)
    console.log("Opening file: " + testFile);
    var openedContent = Swift.openFile(testFile);
    results.operations.push({
        operation: "openFile",
        path: testFile,
        success: openedContent !== null
    });
    
    // Test 7: Delete file
    console.log("Deleting file: " + testFile);
    var fileDeleted = Swift.deleteFile(testFile);
    results.operations.push({
        operation: "deleteFile",
        path: testFile,
        success: fileDeleted
    });
    
    // Test 8: Verify deletion
    var stillExists = Swift.fileExists(testFile);
    results.operations.push({
        operation: "verifyDeletion",
        path: testFile,
        deleted: !stillExists
    });
    
    // Test 9: Delete directory
    console.log("Deleting directory: " + testDir);
    var dirDeleted = Swift.deleteFile(testDir);
    results.operations.push({
        operation: "deleteDirectory",
        path: testDir,
        success: dirDeleted
    });
    
    // Summary
    var allSuccessful = results.operations.every(function(op) {
        return op.success !== false && 
               op.exists !== false && 
               op.deleted !== false &&
               op.contentMatches !== false;
    });
    
    results.summary = allSuccessful ? "All file operations passed" : "Some operations failed";
    results.testDir = testDir;
    
    console.log("\nTest summary: " + results.summary);
    
    return JSON.stringify({
        text: JSON.stringify(results, null, 2),
        metadata: { 
            test: "fileOps",
            allSuccessful: allSuccessful 
        }
    });
}

module.exports = {
	testFileOps
};
