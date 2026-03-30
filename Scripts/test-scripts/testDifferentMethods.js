// ===================================================================
// Handler Function: testDifferentMethods
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testDifferentMethods(params) {
    console.log("--- Testing Different HTTP Methods ---");
    
    var baseUrl = "https://httpbin.org/";
    var methods = ["GET", "POST", "PUT", "DELETE"];
    var results = {};
    
    methods.forEach(function(method) {
        var url = baseUrl + method.toLowerCase();
        console.log("Testing " + method + " request");
        
        try {
            var body = method === "POST" || method === "PUT" ? 
                JSON.stringify({ test: true }) : null;
            
            var responseJSON = MCPStudio.httpRequest(method, url, body, null);
            var response = JSON.parse(responseJSON);
            
            results[method] = {
                success: !response.error && response.status === 200,
                status: response.status,
                error: response.error || null
            };
        } catch(e) {
            results[method] = {
                success: false,
                error: e.toString()
            };
        }
    });
    
    var allPassed = Object.keys(results).every(function(method) {
        return results[method].success;
    });
    
    return JSON.stringify({
        text: JSON.stringify({
            passed: allPassed,
            results: results
        }, null, 2),
        metadata: { test: "httpMethods" }
    });
}

module.exports = {
	testDifferentMethods
};
