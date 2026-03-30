// ===================================================================
// Handler Function: fetchPrompt
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function fetchPrompt(params) {
    var promptName = params.promptName;
    
    if (!promptName) {
        return shared.createErrorResult("Prompt name requiered");
    }
    
    var json = MCPStudio.promptConfig(promptName);
    if (!json) {
    	return shared.createErrorResult("Failed to get prompt " + promptName);
    }
    
    var prompt = JSON.parse(json);
    if (!prompt) {
    	return shared.createErrorResult("Failed to parse prompt " + promptName);
    }
   
    var data = {
    	operation: "fetchPrompt",
        message: prompt.name + ": " + prompt.template,
        prompt: prompt.template,
        name: prompt.name,
        arguments: prompt.arguments
    };
    
    return shared.createSuccessResult(data, data);
}

module.exports = {
	fetchPrompt
};
