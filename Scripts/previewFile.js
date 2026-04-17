// ===================================================================
// Handler Function: processFile
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function previewFile(params) {
    var pathValidation = shared.validateFilePath(params.filePath || "", "filePath");
    var filePath;
    var content;
    var lines;
    var wordCount;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "previewFile"
        });
    }

    filePath = pathValidation.value;
    
    console.log("Processing file: " + filePath);
    
    // Check if file exists
    if (!MCPStudio.fileExists(filePath)) {
        return shared.setErrorResult("File not found: " + filePath, {
            operation: "previewFile",
            filePath: filePath
        });
    }
    
    // Read file content
    content = MCPStudio.readFile(filePath);
    if (content === null) {
        return shared.setErrorResult("Failed to read file: " + filePath, {
            operation: "previewFile",
            filePath: filePath
        });
    }
    
    // Process the content (example: count lines and words)
    lines = content.split('\n');
    wordCount = content.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
    
    result = {
        filePath: filePath,
        lineCount: lines.length,
        wordCount: wordCount,
        charCount: content.length,
        preview: lines.slice(0, 10).join('\n')
    };

    return shared.setSuccessResult(result, {
        filePath: filePath,
        operation: "previewFile"
    });
}

module.exports = {
	previewFile
};
