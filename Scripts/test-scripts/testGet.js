// ===================================================================
// Handler Function: testGet
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testGet(params) {
    console.log("--- Testing HTTP GET ---");
    
    // Use a reliable test endpoint
    var testUrl = "https://httpbin.org/get"
    testUrl = params.testUrl || testUrl;
    testUrl = params.url     || testUrl;
    
    console.log("Making GET request to: " + testUrl);
    
    try {
        //var responseJSON = MCPStudio.httpGet(testUrl, "{}");
        var responseJSON = MCPStudio.httpGet(testUrl, JSON.stringify({
                qryParam1: "pvalue1",
                qryParam2: "pvalue2"
            }));

        console.log("MCPStudio.httpGet Result: " + responseJSON);
        
        var response = JSON.parse(responseJSON);
        
        console.log("Response status: " + response.statusCode);
        console.log("Response body length: " + (response.body ? response.body.length : 0));
        
        if (response.error) {
        	return JSON.stringify({
                text: "GET request failed: " + response.error,
                metadata: {
                    error: "GET request failed: " + response.error,
                    success: false,
                    response: response,
                    operation: "httpGet"
                }
            });
        }
        
        if (response.statusCode !== 200) {
            return JSON.stringify({
                text: "GET request failed: " + response.error,
                metadata: {
                    error: "GET request failed: " + response.error,
                    success: false,
                    response: response,
                    operation: "httpPost"
                }
            });
        }
        
        return JSON.stringify({
            text: response.body,
            metadata: { 
                operation: "httpGet", 
                passed: true,
                status: response.statusCode,
                bodyLength: response.body.length,
                headers: response.headers
            }
        });
    } catch(e) {
        return JSON.stringify({
            error: "Exception during GET test: " + e.toString()
        });
    }
}

module.exports = {
	testGet
};
