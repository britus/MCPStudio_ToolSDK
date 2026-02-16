// ===================================================================
// Test Script for MCPStudio JavaScript Bridge
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {

    if (jsonParams.length == 0) {
        jsonParams = '{"parameter": "none"}';
    }
    if (handlerName == 0) {
        handlerName = "testAll";
    }
    
    try {
        var params = JSON.parse(jsonParams);

        console.log("=== Test Script Started ===");
        console.log("SID: " + sid);
        console.log("Handler: " + handlerName);
        console.log("Params: " + jsonParams);
        
        switch(handlerName) {
            case "testAll":
                return testAll(params);
            case "testLogging":
                return testLogging();
            case "testFileOps":
                return testFileOps(params);
            case "testPaths":
                return testPaths();
            default:
                return JSON.stringify({
                    error: "Unknown test: " + handlerName
                });
        }
    } catch(error) {
        console.error("Test error: " + error.toString());
        return JSON.stringify({
            error: error.toString()
        });
    }
}

// ===================================================================
// Test Functions
// ===================================================================

function testAll(params) {
    console.log("\n=== Running All Tests ===\n");
    
    var results = {
        logging: testLogging(),
        paths: testPaths(),
        fileOps: testFileOps(params)
    };
    
    var allPassed = true;
    for (var test in results) {
        var result = JSON.parse(results[test]);
        if (result.error) {
            allPassed = false;
            console.error("Test failed: " + test);
        } else {
            console.log("Test passed: " + test);
        }
    }
    
    return JSON.stringify({
        text: JSON.stringify({
            summary: allPassed ? "All tests passed" : "Some tests failed",
            results: results
        }, null, 2),
        metadata: {
            operation: "testAll",
            allPassed: allPassed
        }
    });
}

function testLogging() {
    console.log("\n--- Testing Logging ---");
    
    // Test console methods
    console.log("Console.log test");
    console.error("Console.error test");
    console.warn("Console.warn test");
    console.debug("Console.debug test");
    
    // Test Swift.log with different types
    Swift.log('debug', -1, 'Swift debug log test');
    Swift.log('info', 100, 'Swift info log test with code');
    Swift.log('warning', 200, 'Swift warning log test');
    Swift.log('error', 500, 'Swift error log test');
    
    return JSON.stringify({
        text: "Logging tests completed - check logs",
        metadata: { test: "logging" }
    });
}

function testPaths() {
    console.log("\n--- Testing Path Functions ---");
    
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

function testFileOps(params) {
    console.log("\n--- Testing File Operations ---");
    
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

// ===================================================================
// Additional Utility Tests
// ===================================================================

function testJSON() {
    console.log("\n--- Testing JSON Operations ---");
    
    var testData = {
        string: "Hello",
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        nested: {
            key: "value"
        }
    };
    
    var tempPath = Swift.getTempPath();
    var jsonFile = tempPath + "/test.json";
    
    // Write JSON
    var jsonString = JSON.stringify(testData, null, 2);
    var saved = Swift.saveFile(jsonFile, jsonString);
    
    if (!saved) {
        return JSON.stringify({ error: "Failed to save JSON file" });
    }
    
    // Read JSON
    var readString = Swift.readFile(jsonFile);
    if (!readString) {
        return JSON.stringify({ error: "Failed to read JSON file" });
    }
    
    // Parse JSON
    var parsed = JSON.parse(readString);
    
    // Verify
    var match = JSON.stringify(testData) === JSON.stringify(parsed);
    
    // Cleanup
    Swift.deleteFile(jsonFile);
    
    return JSON.stringify({
        text: JSON.stringify({
            saved: saved,
            read: readString !== null,
            parsed: parsed !== null,
            dataMatches: match
        }, null, 2),
        metadata: { test: "json" }
    });
}

console.log("Test script loaded successfully");
