// ===================================================================
// Handler Function: testJSON
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testJSON(params) {
    console.log("--- Testing JSON Fetch ---");
    
    // Use a public JSON API
    var testUrl = params.jsonUrl || "https://httpbin.org/json";
    
    console.log("Fetching JSON from: " + testUrl);
    
    try {
        var headers = JSON.stringify({
            "Accept": "application/json"
        });
        
        var responseJSON = Swift.httpGet(testUrl, headers);
        var response = JSON.parse(responseJSON);
        
        console.log("Response status: " + response.statusCode);
        
        if (response.error) {
        	return JSON.stringify({
                text: "GET request failed: " + response.error,
                metadata: {
                    error: "GET request failed: " + response.error,
                    success: false,
                    response: response,
                    operation: "jsonFetch"
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
                    operation: "jsonFetch"
                }
            });
        }
        
        // Parse JSON response
        var jsonData = null;
        try {
            jsonData = JSON.parse(response.body);
            console.log("Successfully parsed JSON response");
        } catch(e) {
	        return JSON.stringify({
	            text: "Exception during JSON test: " + e.toString(),
	            metadata: {
	                passed: false,
	                status: -1,
	                success: false,
	                error: "Exception during JSON test: " + e.toString(),
	                operation: "jsonFetch"
	            }
	        });
	    }
        return JSON.stringify({
            text: response.body,
            metadata: { 
                operation: "jsonFetch", 
                passed: true,
                status: response.statusCode,
                success: true,
                bodyLength: response.body.length,
                jsonParsed: jsonData !== null,
                response: jsonData,
                headers: response.headers
            }
        });
    } catch(e) {
        return JSON.stringify({
            text: "Exception during JSON test: " + e.toString(),
            metadata: {
                passed: false,
                status: -1,
                success: false,
                error: "Exception during JSON test: " + e.toString(),
                operation: "jsonFetch"
            }
        });
    }
}

module.exports = {
	testJSON
};
