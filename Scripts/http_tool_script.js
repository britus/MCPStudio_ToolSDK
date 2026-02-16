// ===================================================================
// HTTP/HTTPS Example Script
// Demonstrates web resource access and processing
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("HTTP Tool - Handler: " + handlerName);
    
    try {
        var params = JSON.parse(jsonParams);
        
       	switch(handlerName) {
            case "fetchData":
                return fetchData(params);
            
            case "postData":
                return postData(params);
            
            case "fetchJSON":
                return fetchJSON(params);
            
            case "downloadFile":
                return downloadFile(params);
            
            case "apiRequest":
                return apiRequest(params);
            
            case "scrapeWebpage":
                return scrapeWebpage(params);
            
            case "checkStatus":
                return checkStatus(params);
            
            case "webhookCall":
                return webhookCall(params);
            
            default:
                return error("Unknown handler: " + handlerName);
        }
    } catch(e) {
        console.error("Error: " + e.toString());
        return error(e.toString());
    }
}

// ===================================================================
// HTTP Handler Functions
// ===================================================================

function fetchData(params) {
    var url = params.url;
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("Fetching data from: " + url);
    
    // Prepare headers
    var headers = params.headers || {};
    var headersJSON = JSON.stringify(headers);
    
    // Make GET request
    var responseJSON = Swift.httpGet(url, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("HTTP request failed: " + response.error);
    }
    
    if (response.statusCode >= 400) {
        return error("HTTP " + response.statusCode + ": " + response.statusText);
    }
    
    // Optional: Save to file
    if (params.saveToFile) {
        var saved = Swift.saveFile(params.saveToFile, response.body);
        if (!saved) {
            console.warn("Failed to save response to file");
        }
    }
    
    return success({
        status: response.statusCode,
        contentLength: response.body.length,
        content: response.body,
        headers: response.headers
    }, { operation: "fetchData", url: url });
}

function postData(params) {
    var url = params.url;
    var data = params.data || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("Posting data to: " + url);
    
    // Convert data to JSON string if its an object
    var body = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Prepare headers
    var headers = params.headers || {};
    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    var headersJSON = JSON.stringify(headers);
    
    // Make POST request
    var responseJSON = Swift.httpPost(url, body, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("POST request failed: " + response.error);
    }
    
    if (response.statusCode >= 400) {
        return error("HTTP " + response.statusCode + ": " + response.statusText);
    }
    
    return success({
        status: response.statusCode,
        statusText: response.statusText,
        response: response.body
    }, { operation: "postData", url: url });
}

function fetchJSON(params) {
    var url = params.url;
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("Fetching JSON from: " + url);
    a
    // Set Accept header for JSON
    var headers = params.headers || {};
    headers['Accept'] = 'application/json';
    var headersJSON = JSON.stringify(headers);
    
    // Make GET request
    var responseJSON = Swift.httpGet(url, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("Failed to fetch JSON: " + response.error);
    }
    
    if (response.statusCode >= 400) {
        return error("HTTP " + response.statusCode + ": " + response.statusText);
    }
    
    // Parse JSON response
    try {
        var jsonData = JSON.parse(response.body);
        
        // Optional: Transform or filter data
        if (params.transform) {
            jsonData = applyTransform(jsonData, params.transform);
        }
        
        // Optional: Save to file
        if (params.saveToFile) {
            Swift.saveFile(params.saveToFile, JSON.stringify(jsonData, null, 2));
        }
        
        return success({
            status: response.statusCode,
            data: jsonData
        }, { operation: "fetchJSON", url: url });
    } catch(e) {
        return error("Failed to parse JSON response: " + e.toString());
    }
}

function downloadFile(params) {
    var url = params.url;
    var destination = params.destination;
    
    if (!url) {
        return error("URL is required");
    }
    
    if (!destination) {
        // Generate default destination in temp directory
        var filename = url.split('/').pop() || 'download.txt';
        destination = Swift.getTempPath() + "/" + filename;
    }
    
    console.log("Downloading file from: " + url);
    console.log("Destination: " + destination);
    
    var success = Swift.downloadFile(url, destination);
    
    if (!success) {
        return error("Failed to download file");
    }
    
    // Get file info
    var exists = Swift.fileExists(destination);
    var content = null;
    var size = 0;
    
    if (exists) {
        content = Swift.readFile(destination);
        size = content ? content.length : 0;
    }
    
    return createSuccessResult({
        message: "File downloaded successfully",
        path: destination,
        size: size,
        exists: exists
    }, { operation: "downloadFile", url: url });
}

function apiRequest(params) {
    var url = params.url;
    var method = (params.method || 'GET').toUpperCase();
    var data = params.data;
    var headers = params.headers || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("Making " + method + " request to: " + url);
    
    // Prepare body
    var body = null;
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }
    
    var headersJSON = JSON.stringify(headers);
    
    // Make request
    var responseJSON = Swift.httpRequest(method, url, body, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("API request failed: " + response.error);
    }
    
    // Parse response if JSON
    var parsedBody = response.body;
    if (response.headers['Content-Type'] && 
        response.headers['Content-Type'].indexOf('application/json') >= 0) {
        try {
            parsedBody = JSON.parse(response.body);
        } catch(e) {
            console.warn("Failed to parse JSON response");
        }
    }
    
    return success({
        status: response.statusCode,
        statusText: response.statusText,
        headers: response.headers,
        body: parsedBody
    }, { 
        operation: "apiRequest", 
        method: method, 
        url: url 
    });
}

function scrapeWebpage(params) {
    var url = params.url;
    var selectors = params.selectors || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("Scraping webpage: " + url);
    
    // Fetch HTML
    var headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; MCPStudio/1.0)'
    };
    var headersJSON = JSON.stringify(headers);
    
    var responseJSON = Swift.httpGet(url, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("Failed to fetch webpage: " + response.error);
    }
    
    if (response.statusCode >= 400) {
        return error("HTTP " + response.statusCode + ": " + response.statusText);
    }
    
    var html = response.body;
    
    // Basic text extraction (simple pattern matching)
    var extracted = {
        title: extractTitle(html),
        text: extractText(html),
        links: extractLinks(html),
        images: extractImages(html)
    };
    
    // Apply custom selectors if provided
    for (var key in selectors) {
        var pattern = selectors[key];
        extracted[key] = extractPattern(html, pattern);
    }
    
    // Optional: Save HTML to file
    if (params.saveHTML) {
        Swift.saveFile(params.saveHTML, html);
    }
    
    return success(extracted, { 
        operation: "scrapeWebpage", 
        url: url 
    });
}

function checkStatus(params) {
    var urls = params.urls || [];
    
    if (!Array.isArray(urls) || urls.length === 0) {
        return error("URLs array is required");
    }
    
    console.log("Checking status of " + urls.length + " URLs");
    
    var results = [];
    
    urls.forEach(function(url) {
        var responseJSON = Swift.httpGet(url, null);
        var response = JSON.parse(responseJSON);
        
        results.push({
            url: url,
            status: response.statusCode || 0,
            statusText: response.statusText || 'Unknown',
            error: response.error || null,
            online: !response.error && response.statusCode >= 200 && response.statusCode < 400
        });
    });
    
    var summary = {
        total: results.length,
        online: results.filter(function(r) { return r.online; }).length,
        offline: results.filter(function(r) { return !r.online; }).length
    };
    
    return success({
        summary: summary,
        results: results
    }, { operation: "checkStatus" });
}

function webhookCall(params) {
    var url = params.webhookUrl || params.url;
    var payload = params.payload || {};
    var method = params.method || 'POST';
    
    if (!url) {
        return error("Webhook URL is required");
    }
    
    console.log("Calling webhook: " + url);
    
    var body = JSON.stringify(payload);
    var headers = params.headers || {};
    headers['Content-Type'] = 'application/json';
    
    var headersJSON = JSON.stringify(headers);
    
    var responseJSON;
    if (method === 'POST') {
        responseJSON = Swift.httpPost(url, body, headersJSON);
    } else if (method === 'PUT') {
        responseJSON = Swift.httpPut(url, body, headersJSON);
    } else {
        return error("Webhook method must be POST or PUT");
    }
    
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("Webhook call failed: " + response.error);
    }
    
    return success({
        status: response.statusCode,
        statusText: response.statusText,
        response: response.body
    }, { 
        operation: "webhookCall", 
        url: url 
    });
}

// ===================================================================
// Utility Functions
// ===================================================================

function applyTransform(data, transform) {
    // Simple data transformation
    if (transform.filter && Array.isArray(data)) {
        return data.filter(function(item) {
            return eval(transform.filter);
        });
    }
    
    if (transform.map && Array.isArray(data)) {
        return data.map(function(item) {
            return eval(transform.map);
        });
    }
    
    if (transform.extract && typeof data === 'object') {
        var result = {};
        transform.extract.forEach(function(key) {
            if (data[key] !== undefined) {
                result[key] = data[key];
            }
        });
        return result;
    }
    
    return data;
}

function extractTitle(html) {
    var match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
}

function extractText(html) {
    // Remove scripts and styles
    var text = html.replace(/<script[^>]*>.*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>.*?<\/style>/gi, '');
    
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit length
    return text.substring(0, 1000);
}

function extractLinks(html) {
    var links = [];
    var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    var match;
    
    while ((match = regex.exec(html)) !== null) {
        links.push(match[1]);
    }
    
    return links.slice(0, 50); // Limit to first 50 links
}

function extractImages(html) {
    var images = [];
    var regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    var match;
    
    while ((match = regex.exec(html)) !== null) {
        images.push(match[1]);
    }
    
    return images.slice(0, 20); // Limit to first 20 images
}

function extractPattern(html, pattern) {
    try {
        var regex = new RegExp(pattern, 'gi');
        var matches = [];
        var match;
        
        while ((match = regex.exec(html)) !== null) {
            matches.push(match[1] || match[0]);
        }
        
        return matches;
    } catch(e) {
        console.error("Invalid pattern: " + pattern);
        return [];
    }
}

function success(data, metadata) {
    return JSON.stringify({
        text: JSON.stringify(data, null, 2),
        metadata: metadata || {}
    });
}

function createSuccessResult(data, metadata) {
    return JSON.stringify({
        text: JSON.stringify(data, null, 2),
        metadata: metadata || {}
    });
}

function error(message) {
    return JSON.stringify({
        text: message,
        metadata: {
        	success: false,
        	error: message
        }
    });
}

console.log("HTTP/HTTPS tool script loaded");
