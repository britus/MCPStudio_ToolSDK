// ===================================================================
// Handler Function: processFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function previewFile(params) {
    var filePath = params.filePath || "";
    
    if (!filePath) {
        return shared.createErrorResult("filePath parameter is required");
    }
    
    console.log("Processing file: " + filePath);
    
    // Check if file exists
    if (!Swift.fileExists(filePath)) {
        return shared.createErrorResult("File not found: " + filePath);
    }
    
    // Read file content
    var content = Swift.readFile(filePath);
    if (!content) {
        return shared.createErrorResult("Failed to read file: " + filePath);
    }
    
    // Process the content (example: count lines and words)
    var lines = content.split('\n');
    var wordCount = content.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
    
    var result = {
        filePath: filePath,
        lineCount: lines.length,
        wordCount: wordCount,
        charCount: content.length,
        preview: lines.slice(0, 10).join('\n')
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

module.exports = {
	processFile
};
