// ===================================================================
// Example JavaScript Tool Script for MCPStudio
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[Script] Script started - SID: " + sid 
                + ", Handler: " + handlerName 
                + " JSON: " + jsonParams);
    
    try {

        // Parse input parameters
        var params = JSON.parse(jsonParams);

        
        // Route to appropriate handler
        switch(handlerName) {
            case "processFile":
                return processFile(params);
            
            case "analyzeDirectory":
                return analyzeDirectory(params);
            
            case "createReport":
                return createReport(params);
            
            case "transformData":
                return transformData(params);

            case "fetchResource":
                return fetchResource(params);

            case "fetchPrompt":
                return fetchPrompt(params);

            default:
                return createErrorResult("Unknown handler: " + handlerName);
        }
        
    } catch(error) {
        console.error("[Script] Script error: " + error.toString());
        return createErrorResult(error.toString());
    }
}

// ===================================================================
// Handler Functions
// ===================================================================

function processFile(params) {
    var filePath = params.filePath || "";
    
    if (!filePath) {
        return createErrorResult("filePath parameter is required");
    }
    
    console.log("[Script] Processing file: " + filePath);
    
    // Check if file exists
    if (!Swift.fileExists(filePath)) {
        return createErrorResult("File not found: " + filePath);
    }
    
    // Read file content
    var content = Swift.readFile(filePath);
    if (!content) {
        return createErrorResult("Failed to read file: " + filePath);
    }
    
    // Process the content (example: count lines and words)
    var lines = content.split('\n');
    var wordCount = content.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
    
    var result = {
        filePath: filePath,
        lineCount: lines.length,
        wordCount: wordCount,
        charCount: content.length,
        preview: lines.slice(0, 5).join('\n')
    };
    
    // Set result using Swift bridge
    Swift.setToolResult(JSON.stringify({
        text: JSON.stringify(result, null, 2),
        metadata: {
            operation: "processFile",
            success: true
        }
    }));
    
    return null; // Result already set via Swift.setToolResult
}

function analyzeDirectory(params) {
    var dirPath = params.dirPath || Swift.getDocumentsPath();
    
    console.log("[Script] Analyzing directory: " + dirPath);
    
    if (!Swift.fileExists(dirPath)) {
        return createErrorResult("Directory not found: " + dirPath);
    }
    
    // List directory contents
    var items = Swift.listDirectory(dirPath);
    
    var analysis = {
        path: dirPath,
        totalItems: items.length,
        items: items.map(function(item) {
            var fullPath = dirPath + "/" + item;
            return {
                name: item,
                exists: Swift.fileExists(fullPath)
            };
        })
    };
    
    return createSuccessResult(analysis, { operation: "analyzeDirectory" });
}

function createReport(params) {
    var title = params.title || "Untitled Report";
    var data = params.data || {};
    var outputPath = params.outputPath;
    
    console.log("[Script] Creating report: " + title);
    
    // Generate report content
    var reportContent = "========================================\n";
    reportContent += title + "\n";
    reportContent += "========================================\n";
    reportContent += "Generated: " + new Date().toISOString() + "\n\n";
    
    for (var key in data) {
        reportContent += key + ": " + JSON.stringify(data[key]) + "\n";
    }
    
    if (outputPath) {
        // Save to file
        var saved = Swift.saveFile(outputPath, reportContent);
        
        if (saved) {
            return createSuccessResult({
                message: "Report saved successfully",
                path: outputPath,
                size: reportContent.length
            }, { operation: "createReport" });
        } else {
            return createErrorResult("Failed to save report to: " + outputPath);
        }
    } else {
        // Return content directly
        return createSuccessResult({
            content: reportContent,
            size: reportContent.length
        }, { operation: "createReport" });
    }
}

function fetchResource(params) {
    var resourceName = params.resourceName;
    
    if (!resourceName || resourceName.length === 0) {
        return createErrorResult("Resource name requiered");
    }
    
    var json = Swift.resourceConfig(resourceName);
    if (!json || json.length === 0) {
    	return createErrorResult("Failed to get resource " + resourceName);
    }
    
    var resource = JSON.parse(json);
    if (!resource) {
    	return createErrorResult("Failed to parse resource " + resourceName);
    }
    
    var data = {
    	operation: "fetchResource",
        message: resource.name + " URL: " + resource.uri,
        name: resource.name,
        uri: resource.uri,
        mimeType: resource.mimeType,
        relatedResources: resource.relatedResources
    };
    
    return createSuccessResult(data, data);
}

function fetchPrompt(params) {
    var promptName = params.promptName;
    
    if (!promptName || promptName.length === 0) {
        return createErrorResult("Prompt name requiered");
    }
    
    var json = Swift.promptConfig(promptName);
    if (!json || json.length === 0) {
    	return createErrorResult("Failed to get prompt " + promptName);
    }
    
    var prompt = JSON.parse(json);
    if (!prompt) {
    	return createErrorResult("Failed to parse prompt " + promptName);
    }
   
    var data = {
    	operation: "fetchPrompt",
        message: prompt.name + ": " + prompt.template,
        name: prompt.name,
        arguments: prompt.arguments
    };
    
    return createSuccessResult(data, data);
}

function transformData(params) {
    var inputPath = params.inputPath;
    var outputPath = params.outputPath;
    var transform = params.transform || "uppercase";
    
    if (!inputPath) {
        return createErrorResult("inputPath parameter is required");
    }
    
    console.log("[Script] Transforming data from: " + inputPath);
    
    // Read input file
    var content = Swift.openFile(inputPath);
    if (!content) {
        return createErrorResult("Failed to read input file");
    }
    
    // Apply transformation
    var transformed;
    switch(transform) {
        case "uppercase":
            transformed = content.toUpperCase();
            break;
        case "lowercase":
            transformed = content.toLowerCase();
            break;
        case "reverse":
            transformed = content.split('').reverse().join('');
            break;
        case "linecount":
            var lines = content.split('\n');
            transformed = lines.map(function(line, i) {
                return (i + 1) + ": " + line;
            }).join('\n');
            break;
        default:
            return createErrorResult("Unknown transform: " + transform);
    }
    
    // Save or return
    if (outputPath) {
        var saved = Swift.saveFile(outputPath, transformed);
        
        return createSuccessResult({
            message: "Data transformed and saved",
            inputPath: inputPath,
            outputPath: outputPath,
            transform: transform
        }, { operation: "transformData" });
    } else {
        return createSuccessResult({
            transformed: transformed
        }, { operation: "transformData" });
    }
}

// ===================================================================
// Helper Functions
// ===================================================================

function createSuccessResult(data, metadata) {
    var result = {
        text: JSON.stringify(data, null, 2),
        success: true,
        metadata: metadata || {}
    };
    
    var json = JSON.stringify(result);
    console.log("[Script] Result: " + json);
    
    return json
}

function createErrorResult(errorMessage) {
    var result = {
        text: errorMessage,
        success: false,
        metadata: { code: -10421, error: errorMessage }
    };
    
    var json = JSON.stringify(result);
    console.log("[Script] Result: " + json);

    return json
}

// ===================================================================
// Utility Functions - Available to all handlers
// ===================================================================

function ensureDirectory(path) {
    if (!Swift.fileExists(path)) {
        return Swift.createDirectory(path);
    }
    return true;
}

function readJSON(filePath) {
    var content = Swift.readFile(filePath);
    if (content) {
        try {
            return JSON.parse(content);
        } catch(e) {
            Swift.log('error', 400, 'Failed to parse JSON from: ' + filePath);
            return null;
        }
    }
    return null;
}

function writeJSON(filePath, data) {
    var json = JSON.stringify(data, null, 2);
    return Swift.saveFile(filePath, json);
}

function getTempFile(prefix) {
    var temp = Swift.getTempPath();
    var timestamp = new Date().getTime();
    return temp + "/" + prefix + "_" + timestamp + ".txt";
}

console.log("[Script] Example script loaded successfully");
