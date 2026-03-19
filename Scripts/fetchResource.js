// ===================================================================
// Handler Function: fetchResource
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function fetchResource(params) {
    var resourceName = params.resourceName;
    
    if (!resourceName) {
        return shared.createErrorResult("Resource name requiered");
    }
    
    var json = Swift.resourceConfig(resourceName);
    if (!json) {
    	return shared.createErrorResult("Failed to get resource " + promptName);
    }
    
    var resource = JSON.parse(json);
    if (!resource) {
    	return shared.createErrorResult("Failed to parse resource " + promptName);
    }
    
    var data = {
    	operation: "fetchResource",
        message: resource.name + " URL: " + resource.uri,
        name: resource.name,
        uri: resource.uri,
        mimeType: resource.mimeType
    };
    
    return shared.createSuccessResult(data, data);
}

module.exports = {
	fetchResource
};
