// ===================================================================
// File System Tool Handlers
// ===================================================================
// This module bundles all file-system based handlers used by the
// MCP tool entry script. Each handler validates input, performs the
// requested operation via the MCPStudio bridge, and returns a tool
// result payload through the shared result helpers.
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// ===================================================================
// Handler Function: analyzeDirectory
// ===================================================================

/**
 * Analyzes a directory and returns information about its contents
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to the directory to analyze (optional, defaults to documents path)
 * @returns {string} JSON string representing analysis result
 */
function analyzeDirectory(params) {
    var dirValidation = shared.validateDirectoryPath(
        params.dirPath || MCPStudio.getDocumentsPath(),
        "dirPath"
    );
    var dirPath;
    var items;
    var analysis;

    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "analyzeDirectory"
        });
    }

    dirPath = dirValidation.value;

    console.log("Analyzing directory: " + dirPath);

    if (!MCPStudio.fileExists(dirPath)) {
        return shared.setErrorResult("Directory not found: " + dirPath, {
            operation: "analyzeDirectory",
            path: dirPath
        });
    }

    // List directory contents
    items = MCPStudio.listDirectory(dirPath);
    if (items === null) {
        return shared.setErrorResult("Failed to list directory: " + dirPath, {
            operation: "analyzeDirectory",
            path: dirPath
        });
    }

    var totalItems = items.length;
    var truncated = totalItems > 1000;
    if (truncated) {
        items = items.slice(0, 1000);
    }

    analysis = {
        path: dirPath,
        totalItems: totalItems,
        truncated: truncated,
        items: items.map(function(item) {
            var fullPath = shared.joinPath(dirPath, item);
            return {
                name: item,
                exists: MCPStudio.fileExists(fullPath)
            };
        })
    };

    return shared.setSuccessResult(analysis, {
        operation: "analyzeDirectory",
        path: dirPath
    });
}

// ===================================================================
// Handler Function: createDirectory
// ===================================================================

/**
 * Creates a directory at the specified path, including parent directories if needed
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to create (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory creation status or error
 */
function createDirectory(params) {
    var dirValidation = shared.validateDirectoryPath(
        params.dirPath || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio",
        "dirPath"
    );
    var dirPath;
    var success;
    var result;

    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "createDirectory"
        });
    }

    dirPath = dirValidation.value;

    console.log("Create directory: " + dirPath);

    // Create directory
    if (!MCPStudio.fileExists(dirPath)) {
        success = MCPStudio.createDirectory(dirPath);
        if (!success) {
            return shared.setErrorResult("Failed to create directory: " + dirPath, {
                operation: "createDirectory",
                path: dirPath
            });
        }
    }

    result = {
        status: "Directory successfully created.",
        path: dirPath
    };

    return shared.setSuccessResult(result, {
        path: dirPath,
        operation: "createDirectory"
    });
}

// ===================================================================
// Handler Function: listDirectory
// ===================================================================

/**
 * Lists the contents of a directory at the specified path
 * @param {Object} params - Command parameters
 * @param {string} [params.path] - Path to the directory to list (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory contents or error
 */
function listDirectory(params) {
    var pathValidation = shared.validateDirectoryPath(
        params.path || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio",
        "path"
    );
    var path;
    var contents;
    var totalItems;
    var truncated;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "listDirectory"
        });
    }

    path = pathValidation.value;

    console.log("List directory: " + path);

    // List directory contents
    contents = MCPStudio.listDirectory(path);

    if (contents === null) {
        return shared.setErrorResult("Failed to list directory: " + path, {
            operation: "listDirectory",
            path: path
        });
    }

    totalItems = contents.length;
    truncated = totalItems > 1000;
    if (truncated) {
        contents = contents.slice(0, 1000);
    }

    result = {
        contents: contents,
        path: path,
        totalItems: totalItems,
        truncated: truncated
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "listDirectory"
    });
}

// ===================================================================
// Handler Function: deleteFile
// ===================================================================

/**
 * Deletes a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to delete (required)
 * @returns {null|null} Returns null after setting tool result with deletion status or error
 */
function deleteFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var success;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "deleteFile"
        });
    }

    path = pathValidation.value;

    console.log("Delete file: " + path);

    // Delete file
    success = MCPStudio.deleteFile(path);

    if (!success) {
        return shared.setErrorResult("Failed to delete file: " + path, {
            operation: "deleteFile",
            path: path
        });
    }

    result = {
        message: "File successfully deleted.",
        path: path
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "deleteFile"
    });
}

// ===================================================================
// Handler Function: fileExists
// ===================================================================

/**
 * Checks if a file or directory exists at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to check (required)
 * @returns {null|null} Returns null after setting tool result with existence status
 */
function fileExists(params) {
    var pathValidation = shared.validatePath(params.path || "", "path");
    var path;
    var exists;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "fileExists"
        });
    }

    path = pathValidation.value;

    console.log("Check file existence: " + path);

    // Check if file exists
    exists = MCPStudio.fileExists(path);

    result = {
        exists: exists,
        path: path
    };

    return shared.setSuccessResult(result, {
        exists: exists,
        path: path,
        operation: "fileExists"
    });
}

// ===================================================================
// Handler Function: openFile
// ===================================================================

/**
 * Opens and reads a file at the specified path (alias for readFile)
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to open/read (required)
 * @returns {null|null} Returns null after setting tool result with file content or error
 */
function openFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var content;
    var limited;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "openFile"
        });
    }

    path = pathValidation.value;

    console.log("Open file: " + path);

    // Open file (alias for readFile)
    content = MCPStudio.readFile(path);

    if (content === null) {
        return shared.setErrorResult("Failed to open file: " + path, {
            operation: "openFile",
            path: path
        });
    }

    limited = shared.limitText(content);

    result = {
        content: limited.text,
        path: path,
        originalLength: limited.originalLength,
        truncated: limited.truncated
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "openFile"
    });
}

// ===================================================================
// Handler Function: readFile
// ===================================================================

/**
 * Reads and returns the content of a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.path - Path to the file to read (required)
 * @returns {null|null} Returns null after setting tool result with file content or error
 */
function readFile(params) {
    var pathValidation = shared.validateFilePath(params.path || "", "path");
    var path;
    var content;
    var limited;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "readFile"
        });
    }

    path = pathValidation.value;

    console.log("Read file: " + path);

    // Read file content
    content = MCPStudio.readFile(path);

    if (content === null) {
        return shared.setErrorResult("Failed to read file: " + path, {
            operation: "readFile",
            path: path
        });
    }

    limited = shared.limitText(content);

    result = {
        content: limited.text,
        path: path,
        originalLength: limited.originalLength,
        truncated: limited.truncated
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "readFile"
    });
}

// ===================================================================
// Handler Function: saveFile
// ===================================================================

/**
 * Saves content to a file at the specified path
 * @param {Object} params - Command parameters
 * @param {string} params.file_path - Path where to save the file (required)
 * @param {string} params.content - Content to write to the file (required)
 * @returns {null|null} Returns null after setting tool result with save status or error
 */
function saveFile(params) {
    params = params || {};
    var pathValidation = shared.validateFilePath(params.file_path || "", "file_path");
    var path;
    var content = params.content === undefined || params.content === null ? "" : params.content;
    var success;
    var result;

    if (!pathValidation.ok) {
        return shared.setErrorResult(pathValidation.message, {
            operation: "saveFile"
        });
    }

    if (typeof content !== "string") {
        return shared.setErrorResult("content must be a string", {
            operation: "saveFile"
        });
    }

    path = pathValidation.value;

    console.log("Save file: " + path);

    // Save file content
    success = MCPStudio.saveFile(path, content);

    if (!success) {
        return shared.setErrorResult("Failed to save file: " + path, {
            operation: "saveFile",
            path: path
        });
    }

    result = {
        message: "File successfully saved.",
        path: path
    };

    return shared.setSuccessResult(result, {
        path: path,
        operation: "saveFile"
    });
}

// ===================================================================
// Handler Function: mkdir
// ===================================================================

/**
 * Creates a directory at the specified path, including parent directories if needed
 * @param {Object} params - Command parameters
 * @param {string} [params.dirPath] - Path to create (optional, defaults to documents path/.eof.mcpstudio)
 * @returns {null|null} Returns null after setting tool result with directory creation status
 */
function mkdir(params) {
    var dirValidation = shared.validateDirectoryPath(
        params.dirPath || MCPStudio.getDocumentsPath() + "/.eof.mcpstudio",
        "dirPath"
    );
    var dirPath;
    var success;
    var result;

    if (!dirValidation.ok) {
        return shared.setErrorResult(dirValidation.message, {
            operation: "mkdir"
        });
    }

    dirPath = dirValidation.value;

    console.log("Create directory: " + dirPath);

    // Create directory
    if (!MCPStudio.fileExists(dirPath)) {
        success = MCPStudio.createDirectory(dirPath);
        if (!success) {
            return shared.setErrorResult("Failed to create directory: " + dirPath, {
                operation: "mkdir",
                path: dirPath
            });
        }
    }

    result = {
        message: "Directory successfully created.",
        path: dirPath
    };

    return shared.setSuccessResult(result, {
        path: dirPath,
        operation: "mkdir"
    });
}

// ===================================================================
// Handler Function: previewFile
// ===================================================================

/**
 * Reads a file and returns a preview with line, word and character counts
 * @param {Object} params - Command parameters
 * @param {string} params.filePath - Path to the file to preview (required)
 * @returns {null|null} Returns null after setting tool result with preview data or error
 */
function previewFile(params) {
    var pathValidation = shared.validateFilePath(params.filePath || "", "filePath");
    var filePath;
    var content;
    var lines;
    var wordCount;
    var preview;
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
    preview = shared.limitText(lines.slice(0, 10).join('\n'), 10000);

    result = {
        filePath: filePath,
        lineCount: lines.length,
        wordCount: wordCount,
        charCount: content.length,
        preview: preview.text,
        previewTruncated: preview.truncated
    };

    return shared.setSuccessResult(result, {
        filePath: filePath,
        operation: "previewFile"
    });
}

// ===================================================================
// Handler Function: getDocumentsPath
// ===================================================================

/**
 * Gets the system documents directory path
 * @param {Object} params - Command parameters (currently unused)
 * @returns {null|null} Returns null after setting tool result with documents path or error
 */
function getDocumentsPath(params) {
    console.log("Get documents path");

    // Get documents directory
    var path = MCPStudio.getDocumentsPath();

    var result = {
        path: path,
        type: "documents"
    };

    // Set result using MCPStudio bridge
    return shared.setSuccessResult(result, {
        path: path,
        operation: "getDocumentsPath"
    });
}

// ===================================================================
// Handler Function: getTempPath
// ===================================================================

/**
 * Gets the system temporary directory path
 * @param {Object} params - Command parameters (currently unused)
 * @returns {null|null} Returns null after setting tool result with temp path or error
 */
function getTempPath(params) {
    console.log("Get temporary path");

    // Get temp directory
    var path = MCPStudio.getTempPath();

    var result = {
        path: path,
        type: "temporary"
    };

    // Set result using MCPStudio bridge
    return shared.setSuccessResult(result, {
        path: path,
        operation: "getTempPath"
    });
}

// ............................
// Available module entry points
module.exports = {
    analyzeDirectory,
    createDirectory,
    listDirectory,
    deleteFile,
    fileExists,
    openFile,
    readFile,
    saveFile,
    mkdir,
    previewFile,
    getDocumentsPath,
    getTempPath
};
