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

/**
 * Ensures that a directory exists, creating it if necessary
 * @param {string} path - The path to check or create
 */
function ensureDirectory(path) {
    if (!Swift.fileExists(path)) {
        Swift.createDirectory(path);
    }
}

/**
 * Counts the number of words in a string
 * @param {string} text - The text to analyze
 * @returns {number} Word count
 */
function countWords(text) {
    return text.split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

/**
 * Creates a success result with the given data and metadata
 * @param {Object} data - The main data to include in the result
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
 * @param {string} message - The error message to include in the result
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

// .............................
// Available module entry points
module.exports = {
	success, 
	error, 
	ensureDirectory,
	countWords,
	createSuccessResult,
	createErrorResult,
};
