// ===================================================================
// HTTP/HTTPS Example Script
// Demonstrates web resource access and processing
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} handlerName - Method/handler name to execute (required)
 * @param {Object} params - Parameters object containing operation-specific parameters
 * @returns {string} JSON result or plain text
 */
function httpTools(handlerName, params) {    
    try {
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
        console.error("[Script] Error: " + e.toString());
        return error(e.toString());
    }
}

// ===================================================================
// HTTP Handler Functions
// ===================================================================

/**
 * Fetches data from a URL using GET request
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL to fetch data from (required)
 * @param {Object} [params.headers] - Optional HTTP headers for the request
 * @param {boolean} [params.saveToFile] - Optional flag to save response to file and its path
 * @returns {string} JSON result with fetched data or error message
 */
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
    var responseJSON = MCPStudio.httpGet(url, headersJSON);
    var response = JSON.parse(responseJSON);
    
    if (response.error) {
        return error("HTTP request failed: " + response.error);
    }
    
    if (response.statusCode >= 400) {
        return error("HTTP " + response.statusCode + ": " + response.statusText);
    }
    
    // Optional: Save to file
    if (params.saveToFile) {
        var saved = MCPStudio.saveFile(params.saveToFile, response.body);
        if (!saved) {
            console.warn("[Script] Failed to save response to file");
        }
    }
    
    return success({
        status: response.statusCode,
        contentLength: response.body.length,
        content: response.body,
        headers: response.headers
    }, { operation: "fetchData", url: url });
}

/**
 * Posts data to a URL using POST request
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL to post data to (required)
 * @param {Object|string} params.data - Data to send in the request body (required if not string)
 * @param {Object} [params.headers] - Optional HTTP headers for the request
 * @returns {string} JSON result with posted data or error message
 */
function postData(params) {
    var url = params.url;
    var data = params.data || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("[Script] Posting data to: " + url);
    
    // Convert data to JSON string if its an object
    var body = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Prepare headers
    var headers = params.headers || {};
    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    var headersJSON = JSON.stringify(headers);
    
    // Make POST request
    var responseJSON = MCPStudio.httpPost(url, body, headersJSON);
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

/**
 * Fetches JSON data from a URL
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL to fetch JSON from (required)
 * @param {Object} [params.headers] - Optional HTTP headers for the request
 * @param {boolean} [params.transform] - Optional flag to apply transformation to data
 * @param {string} [params.saveToFile] - Optional flag to save response to file and its path
 * @returns {string} JSON result with parsed JSON or error message
 */
function fetchJSON(params) {
    var url = params.url;
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("[Script] Fetching JSON from: " + url);
    
    // Set Accept header for JSON
    var headers = params.headers || {};
    headers['Accept'] = 'application/json';
    var headersJSON = JSON.stringify(headers);
    
    // Make GET request
    var responseJSON = MCPStudio.httpGet(url, headersJSON);
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
            MCPStudio.saveFile(params.saveToFile, JSON.stringify(jsonData, null, 2));
        }
        
        return success({
            status: response.statusCode,
            data: jsonData
        }, { operation: "fetchJSON", url: url });
    } catch(e) {
        return error("Failed to parse JSON response: " + e.toString());
    }
}

/**
 * Downloads a file from a URL
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL of the file to download (required)
 * @param {string} [params.destination] - Destination path for the downloaded file (optional, defaults to temp dir)
 * @returns {string} JSON result with download status or error message
 */
function downloadFile(params) {
    var url = params.url;
    var destination = params.destination;
    
    if (!url) {
        return error("URL is required");
    }
    
    if (!destination) {
        // Generate default destination in temp directory
        var filename = url.split('/').pop() || 'download.txt';
        destination = MCPStudio.getTempPath() + "/" + filename;
    }
    
    console.log("[Script] Downloading file from: " + url);
    console.log("[Script] Destination: " + destination);
    
    var success = MCPStudio.downloadFile(url, destination);
    
    if (!success) {
        return error("Failed to download file");
    }
    
    // Get file info
    var exists = MCPStudio.fileExists(destination);
    var content = null;
    var size = 0;
    
    if (exists) {
        content = MCPStudio.readFile(destination);
        size = content ? content.length : 0;
    }
    
    return createSuccessResult({
        message: "File downloaded successfully",
        path: destination,
        size: size,
        exists: exists
    }, { operation: "downloadFile", url: url });
}

/**
 * Makes an HTTP API request with configurable method and body
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL to make the request to (required)
 * @param {string} [params.method='GET'] - HTTP method (GET, POST, PUT, PATCH) (optional, default GET)
 * @param {Object|string} params.data - Request body data (required for POST/PUT/PATCH)
 * @param {Object} [params.headers] - Optional HTTP headers for the request
 * @returns {string} JSON result with API response or error message
 */
function apiRequest(params) {
    var url = params.url;
    var method = (params.method || 'GET').toUpperCase();
    var data = params.data;
    var headers = params.headers || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("[Script] Making " + method + " request to: " + url);
    
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
    var responseJSON = MCPStudio.httpRequest(method, url, body, headersJSON);
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

/**
 * Scrapes a webpage and extracts content using selectors or simple pattern matching
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL of the webpage to scrape (required)
 * @param {Object} [params.selectors] - Optional object with CSS selector patterns for extraction
 * @param {boolean} [params.saveHTML] - Optional flag to save HTML to file and its path
 * @returns {string} JSON result with extracted content or error message
 */
function scrapeWebpage(params) {
    var url = params.url;
    var selectors = params.selectors || {};
    
    if (!url) {
        return error("URL is required");
    }
    
    console.log("[Script] Scraping webpage: " + url);
    
    // Fetch HTML
    var headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; MCPStudio/1.0)'
    };
    var headersJSON = JSON.stringify(headers);
    
    var responseJSON = MCPStudio.httpGet(url, headersJSON);
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
        MCPStudio.saveFile(params.saveHTML, html);
    }
    
    return success(extracted, { 
        operation: "scrapeWebpage", 
        url: url 
    });
}

/**
 * Checks the HTTP status of multiple URLs
 * @param {Object} params - Command parameters
 * @param {Array<string>} params.urls - Array of URLs to check (required)
 * @returns {string} JSON result with status summary and individual results or error message
 */
function checkStatus(params) {
    var urls = params.urls || [];
    
    if (!Array.isArray(urls) || urls.length === 0) {
        return error("URLs array is required");
    }
    
    console.log("[Script] Checking status of " + urls.length + " URLs");
    
    var results = [];
    
    urls.forEach(function(url) {
        var responseJSON = MCPStudio.httpGet(url, null);
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

/**
 * Calls a webhook URL with configurable payload and method
 * @param {Object} params - Command parameters
 * @param {string} [params.webhookUrl] - Webhook URL (required)
 * @param {string} [params.url] - Alternative webhook URL if webhookUrl not provided
 * @param {Object} [params.payload] - Payload data to send to the webhook (optional)
 * @param {string} [params.method='POST'] - HTTP method (POST or PUT) (optional, default POST)
 * @returns {string} JSON result with webhook response or error message
 */
function webhookCall(params) {
    var url = params.webhookUrl || params.url;
    var payload = params.payload || {};
    var method = params.method || 'POST';
    
    if (!url) {
        return error("Webhook URL is required");
    }
    
    console.log("[Script] Calling webhook: " + url);
    
    var body = JSON.stringify(payload);
    var headers = params.headers || {};
    headers['Content-Type'] = 'application/json';
    
    var headersJSON = JSON.stringify(headers);
    
    var responseJSON;
    if (method === 'POST') {
        responseJSON = MCPStudio.httpPost(url, body, headersJSON);
    } else if (method === 'PUT') {
        responseJSON = MCPStudio.httpPut(url, body, headersJSON);
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

/**
 * Applies a simple transformation to data based on transform type
 * @param {Object|Array} data - The data to transform
 * @param {Object} transform - Transformation configuration with filter/map/extract properties
 * @returns {Object|Array} Transformed data or original data if no transform applied
 */
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

/**
 * Extracts the title from HTML content
 * @param {string} html - HTML content to extract title from
 * @returns {string} The extracted title or empty string if not found
 */
function extractTitle(html) {
    var match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
}

/**
 * Extracts plain text content from HTML by removing scripts, styles, and tags
 * @param {string} html - HTML content to extract text from
 * @returns {string} Cleaned text content (limited to 1000 characters)
 */
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

/**
 * Extracts links from HTML content
 * @param {string} html - HTML content to extract links from
 * @returns {Array<string>} Array of up to 50 extracted link URLs
 */
function extractLinks(html) {
    var links = [];
    var regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    var match;
    
    while ((match = regex.exec(html)) !== null) {
        links.push(match[1]);
    }
    
    return links.slice(0, 50); // Limit to first 50 links
}

/**
 * Extracts image sources from HTML content
 * @param {string} html - HTML content to extract images from
 * @returns {Array<string>} Array of up to 20 extracted image URLs
 */
function extractImages(html) {
    var images = [];
    var regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    var match;
    
    while ((match = regex.exec(html)) !== null) {
        images.push(match[1]);
    }
    
    return images.slice(0, 20); // Limit to first 20 images
}

/**
 * Extracts pattern matches from HTML content using a regular expression
 * @param {string} html - HTML content to search in
 * @param {string} pattern - Regular expression pattern to match
 * @returns {Array<string>} Array of extracted matches or empty array on error
 */
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
        console.error("[Script] Invalid pattern: " + pattern);
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

module.exports = {
	httpTools
};
