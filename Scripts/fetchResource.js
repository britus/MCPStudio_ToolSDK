// ===================================================================
// Handler Function: fetchResource
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function fetchResource(params) {
    var resourceName = params.resourceName || "MCP resource name required";

    var json = MCPStudio.resourceConfig(resourceName);
    if (!json) {
    	let msg = "Failed to load resource: " + resourceName;
    	MCPStudio.setToolResult(JSON.stringify({
	        text: msg,
	        metadata: {
	        	error: msg,
	            operation: "fetchResource",
	            success: false,
		        mimeType: "plain/text",
	            uri: "",
	            name: "",
	        }
	    }));
    	return null;
    }
    
    var resource = JSON.parse(json);
    if (!resource) {
    	let msg = "Failed to parse resource: " + resourceName;
        MCPStudio.setToolResult(JSON.stringify({
	        text: msg,
	        metadata: {
	        	error: msg,
	            operation: "fetchResource",
	            success: false,
		        mimeType: "plain/text",
	            uri: "",
	            name: "",
	        }
	    }));
    	return null;
    }
     
    MCPStudio.setToolResult(JSON.stringify({
        text: resource.name + ": take a look following link:\n" + resource.uri,
        metadata: {
            operation: "fetchResource",
            success: true,
	        mimeType: resource.mimeType,
            uri: resource.uri,
            name: resource.name,
        }
    }));

    return null;
}

module.exports = {
	fetchResource
};
