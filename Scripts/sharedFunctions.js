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
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            target[key] = source[key];
        }
    }

    return target;
}

function setToolResultPayload(text, metadata, succeeded) {
    var payload = {
        text: String(text === undefined || text === null ? "" : text),
        metadata: metadata || {}
    };

    if (typeof succeeded === "boolean") {
        payload.success = succeeded;
    }

    MCPStudio.setToolResult(JSON.stringify(payload));

    return null;
}

function setSuccessResult(data, metadata) {
    var resultMetadata = copyMetadata(metadata);
    var serialized = serializeResultData(data, resultMetadata);
    resultMetadata.success = true;

    return setToolResultPayload(serialized, resultMetadata, true);
}

function setErrorResult(errorMessage, metadata) {
    var resultMetadata = copyMetadata(metadata);
    errorMessage = String(errorMessage === undefined || errorMessage === null ? "Unknown error" : errorMessage);
    resultMetadata.error = errorMessage;
    resultMetadata.success = false;

    return setToolResultPayload(errorMessage, resultMetadata, false);
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
    var resultMetadata = copyMetadata(metadata);
    var result = {
        text: serializeResultData(data, resultMetadata),
        success: true,
        metadata: resultMetadata
    };

    var json = JSON.stringify(result);
    console.log("[Script] Success result created");

    return json;
}

/**
 * Creates an error result with the given message
 * @param {string} message - The error message to include in the result (required)
 * @returns {string} JSON string representing an error result
 */
function createErrorResult(errorMessage) {
    errorMessage = String(errorMessage === undefined || errorMessage === null ? "Unknown error" : errorMessage);
    var result = {
        text: errorMessage,
        success: false,
        metadata: { error: errorMessage }
    };

    var json = JSON.stringify(result);
    console.log("[Script] Error result created");

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
    return "'" + String(value === undefined || value === null ? "" : value)
        .replace(/'/g, "'\"'\"'") + "'";
}

function validateShellFragment(value, parameterName) {
    var label = parameterName || "value";

    if (value === undefined || value === null || value === "") {
        return { ok: true, value: "" };
    }
    if (typeof value !== "string") {
        return { ok: false, message: label + " must be a string" };
    }
    if (/[\0\r\n]/.test(value)) {
        return { ok: false, message: label + " must not contain control characters" };
    }
    if (/[`$;&|<>\\(){}\[\]*?!#'\"]/.test(value)) {
        return { ok: false, message: label + " contains unsupported shell metacharacters" };
    }

    return { ok: true, value: value.trim() };
}

function validateExecutable(value, parameterName) {
    var label = parameterName || "executable";
    var executable;
    var pathValidation;

    if (typeof value !== "string" || value.trim().length === 0) {
        return { ok: false, message: label + " must be a non-empty string" };
    }

    executable = value.trim();
    if (executable.indexOf("/") >= 0) {
        pathValidation = validateFilePath(executable, label);
        if (!pathValidation.ok) {
            return pathValidation;
        }
        return { ok: true, value: pathValidation.value };
    }

    if (!/^[A-Za-z0-9_.+-]+$/.test(executable)) {
        return { ok: false, message: label + " contains unsupported characters" };
    }

    return { ok: true, value: executable };
}

function appendStandardOutput(message) {
    var output = getStandardOutput();

    console.log(message);
    if (output && typeof output.push === "function") {
        output.push(String(message));
    }
}

function limitOutput(lines, maxCharacters) {
    var values = Array.isArray(lines) ? lines : [];
    var limit = maxCharacters || 12000;
    var joined = values.join("\n");

    if (joined.length <= limit) {
        return values.slice();
    }

    return ["[Earlier output omitted; showing the last " + limit + " characters]"]
        .concat(joined.substring(joined.length - limit).split("\n"));
}

function limitText(value, maxCharacters) {
    var text = String(value === undefined || value === null ? "" : value);
    var limit = maxCharacters || 50000;

    return {
        text: text.length > limit ? text.substring(0, limit) : text,
        originalLength: text.length,
        truncated: text.length > limit
    };
}

function serializeResultData(data, metadata) {
    metadata = metadata || {};
    var serialized = JSON.stringify(data, null, 2);
    var limited = limitText(serialized, 50000);

    if (!limited.truncated) {
        return limited.text;
    }

    metadata.resultTruncated = true;
    metadata.resultOriginalLength = limited.originalLength;
    return limited.text + "\n\n[Result truncated; original length: " +
        limited.originalLength + " characters]";
}

function formatProcessOutput(successMessage, errorMessage, succeeded, output, errors) {
    output = output || limitOutput(getStandardOutput());
    errors = errors || limitOutput(getErrorOutput());
    var text = succeeded ? successMessage : errorMessage;

    if (output.length > 0) {
        text += "\n" + output.join("\n");
    }
    if (errors.length > 0) {
        text += "\nErrors and warnings:\n" + errors.join("\n");
    }

    return text;
}

function setProcessResult(succeeded, successMessage, errorMessage, metadata) {
    var resultMetadata = copyMetadata(metadata);
    var output = limitOutput(getStandardOutput());
    var errors = limitOutput(getErrorOutput());

    resultMetadata.stdout = output;
    resultMetadata.stderr = errors;
    resultMetadata.success = succeeded;

    return setToolResultPayload(
        formatProcessOutput(successMessage, errorMessage, succeeded, output, errors),
        resultMetadata,
        succeeded
    );
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
    if (typeof stdOut !== "undefined" && Array.isArray(stdOut)) {
        return stdOut;
    }

    return [];
}

/**
 * Return process stdErr after shell() or process() call
 * @returns {Array<string>} Array of stderr messages
 */
function getErrorOutput() {
    if (typeof stdErr !== "undefined" && Array.isArray(stdErr)) {
        return stdErr;
    }

    return [];
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
    validateShellFragment,
    validateExecutable,
    appendStandardOutput,
    limitOutput,
    limitText,
    serializeResultData,
    formatProcessOutput,
    setProcessResult,
    getOutput,
    getStandardOutput,
    getErrorOutput,
};
