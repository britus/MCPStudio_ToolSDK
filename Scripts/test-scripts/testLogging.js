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
    
    // Test MCPStudio.log with different types
    MCPStudio.log('debug', -1, 'MCPStudio debug log test');
    MCPStudio.log('info', 100, 'MCPStudio info log test with code');
    MCPStudio.log('warning', 200, 'MCPStudio warning log test');
    MCPStudio.log('error', 500, 'MCPStudio error log test');
    
    return JSON.stringify({
        text: "Logging tests completed - check logs",
        metadata: { test: "logging" }
    });
}

module.exports = {
	testLogging
};
