// ===================================================================
// Handler Function: testAll
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Import test functions
const testGet = require('testGet');
const testPost = require('testPost');
const testDownload = require('testDownload');
const testJSON = require('testJSON');
const testDifferentMethods = require('testDifferentMethods');
const testCustomHeaders = require('testCustomHeaders');

function testHttpAll(params) {
    console.log("=== Running All HTTP Tests ===");
    
    var results = {
        get: testGet.testGet(params),
        json: testJSON.testJSON(params),
        post: testPost.testPost(params),
        download: testDownload.testDownload(params),
        testDifferentMethods: testDifferentMethods.testDifferentMethods(params),
        testCustomHeaders: testCustomHeaders.testCustomHeaders(params),
    };
    
    var allPassed = true;
    for (var test in results) {
        var result = JSON.parse(results[test]);
        if (result.error) {
            allPassed = false;
            console.error("Test failed: " + test + " - " + result.error);
        } else {
            console.log("Test passed: " + test);
        }
    }
    
    return JSON.stringify({
        text: JSON.stringify({
            summary: allPassed ? "All HTTP tests passed" : "Some tests failed",
            results: results
        }, null, 2),
        metadata: {
            operation: "testAll",
            allPassed: allPassed
        }
    });
}

module.exports = {
	testHttpAll
};
