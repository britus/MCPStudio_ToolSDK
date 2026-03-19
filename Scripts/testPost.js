// ===================================================================
// Handler Function: testPost
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testPost(params) {
    console.log("--- Testing HTTP POST ---");
    
    var testUrl = params.postUrl || "https://httpbin.org/post";
    
    var testData = {
        message: "Test from MCPStudio",
        timestamp: new Date().toISOString(),
        test: true
    };
    
    console.log("Making POST request to: " + testUrl);
    console.log("Data: " + JSON.stringify(testData));
    
    try {
        var body = JSON.stringify(testData);
        var headers = JSON.stringify({
            "Content-Type": "application/json"
        });
        
        var responseJSON = Swift.httpPost(testUrl, body, headers);
        var response = JSON.parse(responseJSON);
        
        console.log("Response status: " + response.statusCode);
        
        if (response.error) {
        	return JSON.stringify({
                text: "POST request failed: " + response.error,
                metadata: {
                    error: "POST request failed: " + response.error,
                    success: false,
                    response: response,
                    operation: "httpPost"
                }
            });
        }
        
        if (response.statusCode !== 200) {
            return JSON.stringify({
                text: "POST request failed: " + response.error,
                metadata: {
                    error: "POST request failed: " + response.error,
                    success: false,
                    response: response,
                    operation: "httpPost"
                }
            });
        }
        
        // Try to parse response to verify data was received
        var responseBody = null;
        try {
            responseBody = JSON.parse(response.body);
        } catch(e) {
            responseBody = "{}"
            console.warn("Could not parse response body as JSON");
        }
        
        return JSON.stringify({
            text: response.body,
            metadata: { 
                operation: "httpPost", 
                passed: true,
                status: response.statusCode,
                success: true,
                bodyLength: response.body.length,
                response: responseBody,
                headers: response.headers
            }
        });
    } catch(e) {
        return JSON.stringify({
            text: "Exception during POST test: " + e.toString(),
            metadata: {
                passed: false,
                status: -1,
                success: false,
                error: "Exception during POST test: " + e.toString(),
                operation: "httpPost"
            }
        });
    }
}

module.exports = {
	testPost
};
