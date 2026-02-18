// ===================================================================
// HTTP Test Script - Tests HTTP/HTTPS capabilities
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[Script] === HTTP Test Script Started ===");

    try {
        var params = JSON.parse(jsonParams);
       
        switch(handlerName) {
            case "testAll":
                return testAll(params);
            case "testGet":
                return testGet(params);
            case "testPost":
                return testPost(params);
            case "testJSON":
                return testJSON(params);
            case "testDownload":
                return testDownload(params);
            default:
                return JSON.stringify({
                    error: "Unknown test: " + handlerName
                });
        }
    } catch(error) {
        console.error("[Script] Test error: " + error.toString());
        return JSON.stringify({
            error: error.toString()
        });
    }

}

// ===================================================================
// Test Functions
// ===================================================================

function testAll(params) {
    console.log("[Script] === Running All HTTP Tests ===");
    
    var results = {
        get: testGet(params),
        json: testJSON(params),
        post: testPost(params),
        download: testDownload(params)
    };
    
    var allPassed = true;
    for (var test in results) {
        var result = JSON.parse(results[test]);
        if (result.error) {
            allPassed = false;
            console.error("Test failed: " + test + " - " + result.error);
        } else {
            console.log("[Script] Test passed: " + test);
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

function testGet(params) {
    console.log("[Script] --- Testing HTTP GET ---");
    
    // Use a reliable test endpoint
    var testUrl = "https://httpbin.org/get"
    testUrl = params.testUrl || testUrl;
    testUrl = params.url     || testUrl;
    
    console.log("[Script] Making GET request to: " + testUrl);
    
    try {
        //var responseJSON = Swift.httpGet(testUrl, "{}");
        var responseJSON = Swift.httpGet(testUrl, JSON.stringify({
                qryParam1: "pvalue1",
                qryParam2: "pvalue2"
            }));

        console.log("[Script] Swift.httpGet Result: " + responseJSON);
        
        var response = JSON.parse(responseJSON);
        
        console.log("[Script] Response status: " + response.statusCode);
        console.log("[Script] Response body length: " + (response.body ? response.body.length : 0));
        
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

function testPost(params) {
    console.log("[Script] --- Testing HTTP POST ---");
    
    var testUrl = params.postUrl || "https://httpbin.org/post";
    
    var testData = {
        message: "Test from MCPStudio",
        timestamp: new Date().toISOString(),
        test: true
    };
    
    console.log("[Script] Making POST request to: " + testUrl);
    console.log("[Script] Data: " + JSON.stringify(testData));
    
    try {
        var body = JSON.stringify(testData);
        var headers = JSON.stringify({
            "Content-Type": "application/json"
        });
        
        var responseJSON = Swift.httpPost(testUrl, body, headers);
        var response = JSON.parse(responseJSON);
        
        console.log("[Script] Response status: " + response.statusCode);
        
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
            console.warn("[Script] Could not parse response body as JSON");
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

function testJSON(params) {
    console.log("[Script] --- Testing JSON Fetch ---");
    
    // Use a public JSON API
    var testUrl = params.jsonUrl || "https://httpbin.org/json";
    
    console.log("[Script] Fetching JSON from: " + testUrl);
    
    try {
        var headers = JSON.stringify({
            "Accept": "application/json"
        });
        
        var responseJSON = Swift.httpGet(testUrl, headers);
        var response = JSON.parse(responseJSON);
        
        console.log("[Script] Response status: " + response.statusCode);
        
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
            console.log("[Script] Successfully parsed JSON response");
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

function testDownload(params) {
    console.log("[Script] --- Testing File Download ---");
    
    // Use a small text file for testing
    var testUrl = params.downloadUrl || "https://httpbin.org/robots.txt";
    var tempPath = Swift.getTempPath();
    var destination = tempPath + "/http_test_download.txt";
    
    console.log("[Script] Downloading file from: " + testUrl);
    console.log("[Script] Destination: " + destination);
    
    try {
        // Clean up any existing file
        if (Swift.fileExists(destination)) {
            Swift.deleteFile(destination);
        }
        
        var success = Swift.downloadFile(testUrl, destination);
        
        if (!success) {
            return JSON.stringify({
                error: "Download failed",
                url: testUrl,
                destination: destination
            });
        }
        
        console.log("[Script] Download completed");
        
        // Verify file exists
        var exists = Swift.fileExists(destination);
        console.log("[Script] File exists: " + exists);
        
        if (!exists) {
            return JSON.stringify({
                error: "Downloaded file does not exist",
                destination: destination
            });
        }
        
        // Read file content
        var content = Swift.readFile(destination);
        var fileSize = content ? content.length : 0;
        
        console.log("[Script] File size: " + fileSize + " bytes");
        
        // Clean up
        Swift.deleteFile(destination);
        
        return JSON.stringify({
            text: JSON.stringify({
                passed: true,
                downloaded: success,
                fileExists: exists,
                fileSize: fileSize,
                contentPreview: content ? content.substring(0, 100) : ""
            }, null, 2),
            metadata: { test: "downloadFile" }
        });
    } catch(e) {
        return JSON.stringify({
            error: "Exception during download test: " + e.toString()
        });
    }
}

// ===================================================================
// Additional Test Functions
// ===================================================================

function testCustomHeaders(params) {
    console.log("[Script] --- Testing Custom Headers ---");
    
    var testUrl = "https://httpbin.org/headers";
    
    var customHeaders = {
        "X-Custom-Header": "TestValue",
        "X-Test-ID": "12345",
        "User-Agent": "MCPStudio-Test/1.0"
    };
    
    var headersJSON = JSON.stringify(customHeaders);
    
    console.log("[Script] Sending custom headers to: " + testUrl);
    
    try {
        var responseJSON = Swift.httpGet(testUrl, headersJSON);
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

function testDifferentMethods(params) {
    console.log("[Script] --- Testing Different HTTP Methods ---");
    
    var baseUrl = "https://httpbin.org/";
    var methods = ["GET", "POST", "PUT", "DELETE"];
    var results = {};
    
    methods.forEach(function(method) {
        var url = baseUrl + method.toLowerCase();
        console.log("[Script] Testing " + method + " request");
        
        try {
            var body = method === "POST" || method === "PUT" ? 
                JSON.stringify({ test: true }) : null;
            
            var responseJSON = Swift.httpRequest(method, url, body, null);
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

console.log("[Script] HTTP test script loaded successfully");
