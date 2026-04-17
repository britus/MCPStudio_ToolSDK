// ===================================================================
// Handler Function: fetchPrompt
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Fetches a prompt configuration by name from MCPStudio
 * @param {Object} params - Command parameters
 * @param {string} params.promptName - Name of the prompt to fetch (required)
 * @returns {string} JSON result with prompt data or error message
 */
function fetchPrompt(params) {
    var promptName = params.promptName;
    var json;
    var prompt;
    var data;
    
    if (!promptName) {
        return shared.setErrorResult("Prompt name required", {
            operation: "fetchPrompt"
        });
    }
    
    json = MCPStudio.promptConfig(promptName);
    if (!json) {
        return shared.setErrorResult("Failed to get prompt " + promptName, {
            operation: "fetchPrompt",
            promptName: promptName
        });
    }
    
    prompt = JSON.parse(json);
    if (!prompt) {
        return shared.setErrorResult("Failed to parse prompt " + promptName, {
            operation: "fetchPrompt",
            promptName: promptName
        });
    }
    
    data = {
        operation: "fetchPrompt",
        message: prompt.name + ": " + prompt.template,
        prompt: prompt.template,
        name: prompt.name,
        arguments: prompt.arguments
    };
    
    return shared.setSuccessResult(data, data);
}

module.exports = {
	fetchPrompt
};
