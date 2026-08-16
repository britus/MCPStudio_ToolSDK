// ===================================================================
// HTTP/HTTPS Example Script
// Demonstrates web resource access and processing
// ===================================================================

const shared = require('sharedFunctions');

function validateURL(rawURL) {
    var url = typeof rawURL === "string" ? rawURL.trim() : "";
    var authority;

    if (!url) {
        return { ok: false, message: "URL is required" };
    }
    if (!/^https?:\/\/[^\s]+$/i.test(url)) {
        return { ok: false, message: "URL must use http or https" };
    }
    authority = url.split('/')[2] || "";
    if (!authority) {
        return { ok: false, message: "URL must include a host" };
    }
    if (authority.indexOf('@') >= 0) {
        return { ok: false, message: "URL must not contain embedded credentials" };
    }

    return { ok: true, value: url };
}

function displayURL(url) {
    return String(url).split('#')[0].split('?')[0];
}

function copyHeaders(headers) {
    var result = {};
    var source = headers && typeof headers === "object" && !Array.isArray(headers) ? headers : {};
    var key;

    for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            result[key] = String(source[key]);
        }
    }

    return result;
}

function safeResponseHeaders(headers) {
    var result = copyHeaders(headers);
    var key;
    var lower;

    for (key in result) {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            lower = key.toLowerCase();
            if (lower === "set-cookie" || lower === "cookie" ||
                lower === "authorization" || lower.indexOf("api-key") >= 0) {
                result[key] = "[REDACTED]";
            }
        }
    }

    return result;
}

function parseResponse(responseJSON) {
    var response;

    if (typeof responseJSON !== "string") {
        throw new Error("HTTP bridge returned a non-string response");
    }
    response = JSON.parse(responseJSON);
    if (!response || typeof response !== "object" || Array.isArray(response)) {
        throw new Error("HTTP bridge returned an invalid response object");
    }

    response.headers = response.headers || {};
    response.body = response.body === undefined || response.body === null ? "" : response.body;
    return response;
}

function request(method, url, body, headers) {
    var headersJSON = JSON.stringify(headers || {});
    var responseJSON;

    // httpRequest is the documented MCP Studio bridge. The method-specific
    // fallbacks keep the scripts compatible with older host versions.
    if (typeof MCPStudio.httpRequest === "function") {
        responseJSON = MCPStudio.httpRequest(method, url, body, headersJSON);
    } else if (method === "GET" && typeof MCPStudio.httpGet === "function") {
        responseJSON = MCPStudio.httpGet(url, headersJSON);
    } else if (method === "POST" && typeof MCPStudio.httpPost === "function") {
        responseJSON = MCPStudio.httpPost(url, body, headersJSON);
    } else if (method === "PUT" && typeof MCPStudio.httpPut === "function") {
        responseJSON = MCPStudio.httpPut(url, body, headersJSON);
    } else {
        throw new Error("The MCP Studio HTTP bridge does not support " + method);
    }

    return parseResponse(responseJSON);
}

function limitedContent(value, maxCharacters) {
    var text = String(value === undefined || value === null ? "" : value);
    var limit = maxCharacters || 50000;

    return {
        content: text.length > limit ? text.substring(0, limit) : text,
        originalLength: text.length,
        truncated: text.length > limit
    };
}

/**
 * Entry point for all script tool calls
 * @param {string} handlerName - Method/handler name to execute (required)
 * @param {Object} params - Parameters object containing operation-specific parameters
 * @returns {string} JSON result or plain text
 */
function httpTools(handlerName, params) {
    try {
        switch (handlerName) {
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
                return shared.error("Unknown handler: " + handlerName);
        }
    } catch (e) {
        console.error("[Script] Error: " + e.toString());
        return shared.error(e.message || e.toString());
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
 * @param {string} [params.saveToFile] - Optional path used to save the response
 * @returns {string} JSON result with fetched data or error message
 */
function fetchData(params) {
    var urlValidation = validateURL(params.url);
    var url;

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;

    console.log("Fetching data from: " + displayURL(url));

    // Prepare headers
    var headers = copyHeaders(params.headers);

    // Make GET request
    var response = request("GET", url, null, headers);

    if (response.error) {
        return shared.error("HTTP request failed: " + response.error);
    }

    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
    }

    // Optional: Save to file
    if (params.saveToFile) {
        var pathValidation = shared.validateFilePath(params.saveToFile, "saveToFile");
        if (!pathValidation.ok) {
            return shared.error(pathValidation.message);
        }
        var saved = MCPStudio.saveFile(pathValidation.value, String(response.body));
        if (!saved) {
            return shared.error("Failed to save response: " + pathValidation.value);
        }
    }

    var content = limitedContent(response.body);
    return shared.success({
        status: response.statusCode,
        contentLength: content.originalLength,
        content: content.content,
        truncated: content.truncated,
        headers: safeResponseHeaders(response.headers)
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
    var urlValidation = validateURL(params.url);
    var url;
    var data = params.data === undefined ? {} : params.data;

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;

    console.log("[Script] Posting data to: " + displayURL(url));

    // Convert data to JSON string if its an object
    var body = typeof data === 'string' ? data : JSON.stringify(data);

    // Prepare headers
    var headers = copyHeaders(params.headers);
    if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    var response = request("POST", url, body, headers);

    if (response.error) {
        return shared.error("POST request failed: " + response.error);
    }

    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
    }

    var responseContent = limitedContent(response.body);
    return shared.success({
        status: response.statusCode,
        statusText: response.statusText,
        response: responseContent.content,
        responseLength: responseContent.originalLength,
        truncated: responseContent.truncated
    }, { operation: "postData", url: url });
}

/**
 * Fetches JSON data from a URL
 * @param {Object} params - Command parameters
 * @param {string} params.url - The URL to fetch JSON from (required)
 * @param {Object} [params.headers] - Optional HTTP headers for the request
 * @param {Object} [params.transform] - Optional declarative transformation
 * @param {string} [params.saveToFile] - Optional path used to save the transformed JSON
 * @returns {string} JSON result with parsed JSON or error message
 */
function fetchJSON(params) {
    var urlValidation = validateURL(params.url);
    var url;

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;

    console.log("[Script] Fetching JSON from: " + displayURL(url));

    // Set Accept header for JSON
    var headers = copyHeaders(params.headers);
    headers['Accept'] = 'application/json';
    var response = request("GET", url, null, headers);

    if (response.error) {
        return shared.error("Failed to fetch JSON: " + response.error);
    }

    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
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
            var saveValidation = shared.validateFilePath(params.saveToFile, "saveToFile");
            if (!saveValidation.ok) {
                return shared.error(saveValidation.message);
            }
            if (!MCPStudio.saveFile(saveValidation.value, JSON.stringify(jsonData, null, 2))) {
                return shared.error("Failed to save JSON: " + saveValidation.value);
            }
        }

        return shared.success({
            status: response.statusCode,
            data: jsonData
        }, { operation: "fetchJSON", url: url });
    } catch (e) {
        return shared.error("Failed to process JSON response: " + (e.message || e.toString()));
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
    var urlValidation = validateURL(params.url);
    var url;
    var destination = params.destination;

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;

    if (!destination) {
        // Generate default destination in temp directory
        var filename = url.split('?')[0].split('/').pop() || 'download.txt';
        filename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
        destination = MCPStudio.getTempPath() + "/" + filename;
    }

    var destinationValidation = shared.validateFilePath(destination, "destination");
    if (!destinationValidation.ok) {
        return shared.error(destinationValidation.message);
    }
    destination = destinationValidation.value;

    console.log("[Script] Downloading file from: " + displayURL(url));
    console.log("[Script] Destination: " + destination);

    if (typeof MCPStudio.downloadFile !== "function") {
        return shared.error("This MCP Studio host does not provide the binary download bridge");
    }

    var succeeded = MCPStudio.downloadFile(url, destination);

    if (!succeeded) {
        return shared.error("Failed to download file");
    }

    // Get file info
    var exists = MCPStudio.fileExists(destination);

    return shared.success({
        message: "File downloaded successfully",
        path: destination,
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
    var urlValidation = validateURL(params.url);
    var url;
    var method = params.method || 'GET';
    var data = params.data;
    var headers = copyHeaders(params.headers);

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;
    if (typeof method !== "string") {
        return shared.error("HTTP method must be a string");
    }
    method = method.toUpperCase();
    if (["GET", "POST", "PUT", "PATCH"].indexOf(method) < 0) {
        return shared.error("HTTP method must be GET, POST, PUT, or PATCH");
    }

    console.log("[Script] Making " + method + " request to: " + displayURL(url));

    // Prepare body
    var body = null;
    if (data !== undefined && data !== null &&
        (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }

    var response = request(method, url, body, headers);

    if (response.error) {
        return shared.error("API request failed: " + response.error);
    }
    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
    }

    // Parse response if JSON
    var parsedBody = response.body;
    var contentType = response.headers['Content-Type'] || response.headers['content-type'] || "";
    if (contentType.indexOf('application/json') >= 0) {
        try {
            parsedBody = JSON.parse(response.body);
        } catch (e) {
            console.warn("Failed to parse JSON response");
        }
    }

    var apiContent = typeof parsedBody === "string" ? limitedContent(parsedBody) : null;
    return shared.success({
        status: response.statusCode,
        statusText: response.statusText,
        headers: safeResponseHeaders(response.headers),
        body: apiContent ? apiContent.content : parsedBody,
        bodyLength: apiContent ? apiContent.originalLength : undefined,
        truncated: apiContent ? apiContent.truncated : false
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
 * @param {string} [params.saveHTML] - Optional path used to save the HTML
 * @returns {string} JSON result with extracted content or error message
 */
function scrapeWebpage(params) {
    var urlValidation = validateURL(params.url);
    var url;
    var selectors = params.selectors || {};

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message);
    }
    url = urlValidation.value;
    if (!selectors || typeof selectors !== "object" || Array.isArray(selectors)) {
        return shared.error("selectors must be an object");
    }

    console.log("[Script] Scraping webpage: " + displayURL(url));

    // Fetch HTML
    var headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; MCPStudio/1.0)'
    };
    var response = request("GET", url, null, headers);

    if (response.error) {
        return shared.error("Failed to fetch webpage: " + response.error);
    }

    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
    }

    var html = String(response.body);

    // Basic text extraction (simple pattern matching)
    var extracted = {
        title: extractTitle(html),
        text: extractText(html),
        links: extractLinks(html),
        images: extractImages(html)
    };

    // Apply custom selectors if provided
    for (var key in selectors) {
        if (Object.prototype.hasOwnProperty.call(selectors, key)) {
            var pattern = selectors[key];
            extracted[key] = extractPattern(html, pattern);
        }
    }

    // Optional: Save HTML to file
    if (params.saveHTML) {
        var saveValidation = shared.validateFilePath(params.saveHTML, "saveHTML");
        if (!saveValidation.ok) {
            return shared.error(saveValidation.message);
        }
        if (!MCPStudio.saveFile(saveValidation.value, html)) {
            return shared.error("Failed to save HTML: " + saveValidation.value);
        }
    }

    return shared.success(extracted, {
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
        return shared.error("URLs array is required");
    }
    if (urls.length > 50) {
        return shared.error("At most 50 URLs can be checked per call");
    }

    console.log("[Script] Checking status of " + urls.length + " URLs");

    var results = [];

    urls.forEach(function (url) {
        var validation = validateURL(url);
        var response;

        if (!validation.ok) {
            results.push({
                url: url,
                status: 0,
                statusText: "Invalid URL",
                error: validation.message,
                online: false
            });
            return;
        }

        try {
            response = request("GET", validation.value, null, {});
        } catch (e) {
            response = { statusCode: 0, statusText: "Request failed", error: e.message || String(e) };
        }

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
        online: results.filter(function (r) { return r.online; }).length,
        offline: results.filter(function (r) { return !r.online; }).length
    };

    return shared.success({
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
    var urlValidation = validateURL(params.webhookUrl || params.url);
    var url;
    var payload = params.payload || {};
    var method = params.method || 'POST';

    if (!urlValidation.ok) {
        return shared.error(urlValidation.message === "URL is required" ? "Webhook URL is required" : urlValidation.message);
    }
    url = urlValidation.value;
    if (typeof method !== "string") {
        return shared.error("Webhook method must be a string");
    }
    method = method.toUpperCase();

    console.log("[Script] Calling webhook: " + displayURL(url));

    var body = JSON.stringify(payload);
    var headers = copyHeaders(params.headers);
    headers['Content-Type'] = 'application/json';

    if (method !== 'POST' && method !== 'PUT') {
        return shared.error("Webhook method must be POST or PUT");
    }

    var response = request(method, url, body, headers);

    if (response.error) {
        return shared.error("Webhook call failed: " + response.error);
    }
    if (response.statusCode >= 400) {
        return shared.error("HTTP " + response.statusCode + ": " + response.statusText);
    }

    var webhookContent = limitedContent(response.body);
    return shared.success({
        status: response.statusCode,
        statusText: response.statusText,
        response: webhookContent.content,
        responseLength: webhookContent.originalLength,
        truncated: webhookContent.truncated
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
    if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
        throw new Error("transform must be an object");
    }
    if (transform.filter && (typeof transform.filter !== "object" || Array.isArray(transform.filter))) {
        throw new Error("transform.filter must be an object of property/value pairs");
    }
    if (transform.map && !Array.isArray(transform.map)) {
        throw new Error("transform.map must be an array of property names");
    }
    if (transform.extract && !Array.isArray(transform.extract)) {
        throw new Error("transform.extract must be an array of property names");
    }

    // Declarative filtering avoids evaluating caller-supplied JavaScript in the
    // privileged scripting context. Example: {filter: {status: "active"}}.
    if (transform.filter && Array.isArray(data)) {
        data = data.filter(function (item) {
            var key;
            if (!item || typeof item !== "object") {
                return false;
            }
            for (key in transform.filter) {
                if (Object.prototype.hasOwnProperty.call(transform.filter, key) &&
                    item[key] !== transform.filter[key]) {
                    return false;
                }
            }
            return true;
        });
    }

    // Declarative mapping selects named properties from each array item.
    if (transform.map && Array.isArray(data)) {
        data = data.map(function (item) {
            var mapped = {};
            transform.map.forEach(function (key) {
                if (item && typeof item === "object" && item[key] !== undefined) {
                    mapped[key] = item[key];
                }
            });
            return mapped;
        });
    }

    if (transform.extract && data && typeof data === 'object' && !Array.isArray(data)) {
        var result = {};
        transform.extract.forEach(function (key) {
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
    var text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

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

    while ((match = regex.exec(html)) !== null && links.length < 50) {
        links.push(match[1]);
    }

    return links;
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

    while ((match = regex.exec(html)) !== null && images.length < 20) {
        images.push(match[1]);
    }

    return images;
}

/**
 * Extracts pattern matches from HTML content using a regular expression
 * @param {string} html - HTML content to search in
 * @param {string} pattern - Regular expression pattern to match
 * @returns {Array<string>} Array of extracted matches or empty array on error
 */
function extractPattern(html, pattern) {
    try {
        if (typeof pattern !== "string" || pattern.length === 0 || pattern.length > 200) {
            throw new Error("Pattern must contain 1 to 200 characters");
        }
        var regex = new RegExp(pattern, 'gi');
        var matches = [];
        var match;

        while ((match = regex.exec(html)) !== null && matches.length < 100) {
            matches.push(match[1] || match[0]);
            if (match[0] === '') {
                regex.lastIndex += 1;
            }
        }

        return matches;
    } catch (e) {
        console.error("[Script] Invalid pattern: " + pattern);
        return [];
    }
}

module.exports = {
    httpTools
};
