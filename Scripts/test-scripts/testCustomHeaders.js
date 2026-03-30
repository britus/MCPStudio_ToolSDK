// ===================================================================
// Handler Function: testCustomHeaders
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testCustomHeaders(params) {
    console.log("--- Testing Custom Headers ---");
    
    var testUrl = "https://httpbin.org/headers";
    
    var customHeaders = {
        "X-Custom-Header": "TestValue",
        "X-Test-ID": "12345",
        "User-Agent": "MCPStudio-Test/1.0"
    };
    
    var headersJSON = JSON.stringify(customHeaders);
    
    console.log("Sending custom headers to: " + testUrl);
    
    try {
        var responseJSON = MCPStudio.httpGet(testUrl, headersJSON);
        var response = JSON.parse(responseJSON);
        
        if (response.error) {
            return JSON.stringify({
                error: "Request with custom headers failed: " + response.error
            });
        }
        
        // Parse response to check if headers were received
        var responseBody = JSON.parse(response.body);
        var receivedHeaders = responseBody.headers || {};
        
        var headersReceived = 
            receivedHeaders["X-Custom-Header"] === customHeaders["X-Custom-Header"] &&
            receivedHeaders["X-Test-Id"] === customHeaders["X-Test-ID"];
        
        return JSON.stringify({
                text: JSON.stringify({
                passed: headersReceived,
                sentHeaders: customHeaders,
                receivedHeaders: receivedHeaders
            }, null, 2),
            metadata: { test: "customHeaders" }
        });
    } catch(e) {
        return JSON.stringify({
            error: "Exception during custom headers test: " + e.toString()
        });
    }
}

module.exports = {
	testCustomHeaders
};
