// ===================================================================
// Shared Functions for Tool SDK Scripts
// This file contains common utility functions used across 
// multiple scripts
// ===================================================================

/**
 * Creates a success result with the given data and metadata
 * @param {Object} data - The main data to include in the result
 * @param {Object} [metadata] - Optional metadata about the operation
 * @returns {string} JSON string representing a successful result
 */
function success(data, metadata) {
    return createSuccessResult(data, metadata);
}

/**
 * Creates an error result with the given message
 * @param {string} message - The error message to include in the result
 * @returns {string} JSON string representing an error result
 */
function error(message) {
    return createErrorResult(message);
}

function copyMetadata(metadata) {
    var target = {};
    var source = metadata || {};
    var key;

    for (key in source) {
        if (source.hasOwnProperty(key)) {
            target[key] = source[key];
        }
    }

    return target;
}

function setToolResultPayload(text, metadata) {
    MCPStudio.setToolResult(JSON.stringify({
        text: text,
        metadata: metadata || {}
    }));

    return null;
}

function setSuccessResult(data, metadata) {
    var resultMetadata = copyMetadata(metadata);
    resultMetadata.success = true;

    return setToolResultPayload(JSON.stringify(data, null, 2), resultMetadata);
}

function setErrorResult(errorMessage, metadata) {
    var resultMetadata = copyMetadata(metadata);
    resultMetadata.error = errorMessage;
    resultMetadata.success = false;

    return setToolResultPayload(errorMessage, resultMetadata);
}

/**
 * Ensures that a directory exists, creating it if necessary
 * @param {string} path - The path to check or create (required)
 */
function ensureDirectory(path) {
    if (!MCPStudio.fileExists(path)) {
        MCPStudio.createDirectory(path);
    }
}

/**
 * Counts the number of words in a string
 * @param {string} text - The text to analyze (required)
 * @returns {number} Word count
 */
function countWords(text) {
    return text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

/**
 * Creates a success result with the given data and metadata
 * @param {Object} data - The main data to include in the result (required)
 * @param {Object} [metadata] - Optional metadata about the operation
 * @returns {string} JSON string representing a successful result
 */
function createSuccessResult(data, metadata) {
    var result = {
        text: JSON.stringify(data, null, 2),
        success: true,
        metadata: metadata || {}
    };

    var json = JSON.stringify(result);
    console.log("[Script] Result:\n" + json);

    return json;
}

/**
 * Creates an error result with the given message
 * @param {string} message - The error message to include in the result (required)
 * @returns {string} JSON string representing an error result
 */
function createErrorResult(errorMessage) {
    var result = {
        text: errorMessage,
        success: false,
        metadata: { error: errorMessage }
    };

    var json = JSON.stringify(result);
    console.log("[Script] Result:\n" + json);

    return json;
}

function normalizePath(path) {
    var value = String(path || "").replace(/\\/g, "/").trim();
    var isAbsolute = value.charAt(0) === "/";
    var parts = value.split("/");
    var normalized = [];
    var i;
    var part;

    for (i = 0; i < parts.length; i += 1) {
        part = parts[i];

        if (!part || part === ".") {
            continue;
        }

        if (part === "..") {
            return null;
        }

        normalized.push(part);
    }

    if (normalized.length === 0) {
        return isAbsolute ? "/" : "";
    }

    return (isAbsolute ? "/" : "") + normalized.join("/");
}

function validatePath(rawPath, parameterName, options) {
    var settings = options || {};
    var label = parameterName || "path";
    var value;
    var normalized;

    if (typeof rawPath !== "string") {
        return {
            ok: false,
            message: label + " must be a string"
        };
    }

    value = rawPath.trim();
    if (!value) {
        return {
            ok: false,
            message: label + " is required"
        };
    }

    if (/[\0\r\n]/.test(value)) {
        return {
            ok: false,
            message: label + " contains invalid characters"
        };
    }

    normalized = normalizePath(value);
    if (normalized === null) {
        return {
            ok: false,
            message: label + " must not contain parent directory traversal"
        };
    }

    if (settings.absolute === true && normalized.charAt(0) !== "/") {
        return {
            ok: false,
            message: label + " must be an absolute path"
        };
    }

    if (settings.relative === true && normalized.charAt(0) === "/") {
        return {
            ok: false,
            message: label + " must be a relative path"
        };
    }

    return {
        ok: true,
        value: normalized
    };
}

function validateFilePath(rawPath, parameterName, options) {
    return validatePath(rawPath, parameterName || "filePath", options);
}

function validateDirectoryPath(rawPath, parameterName, options) {
    return validatePath(rawPath, parameterName || "dirPath", options);
}

function joinPath(basePath, childName) {
    if (!basePath) {
        return String(childName || "");
    }

    if (!childName) {
        return String(basePath);
    }

    if (basePath.charAt(basePath.length - 1) === "/") {
        return basePath + childName;
    }

    return basePath + "/" + childName;
}

function quoteShellArgument(value) {
    return "'" + String(value || "").replace(/'/g, "'\"'\"'") + "'";
}

/**
 * Return process stdOut after shell() or process() call
 * @returns {Array<string>} Array of stdout messages
 */
function getOutput() {
    return getStandardOutput();
}

/**
 * Return process stdOut after shell() or process() call
 * @returns {Array<string>} Array of stdout messages
 */
function getStandardOutput() {
    return stdOut || [];
}

/**
 * Return process stdErr after shell() or process() call
 * @returns {Array<string>} Array of stderr messages
 */
function getErrorOutput() {
    return stdErr || [];
}

// .............................
// Available module entry points
module.exports = {
    success, 
    error, 
    copyMetadata,
    setToolResultPayload,
    setSuccessResult,
    setErrorResult,
    ensureDirectory,
    countWords,
    createSuccessResult,
    createErrorResult,
    normalizePath,
    validatePath,
    validateFilePath,
    validateDirectoryPath,
    joinPath,
    quoteShellArgument,
    getOutput,
    getStandardOutput,
    getErrorOutput,
};
