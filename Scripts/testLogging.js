// ===================================================================
// Handler Function: testLogging
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

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

module.exports = {
	testLogging
};
