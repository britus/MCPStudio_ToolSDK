// ===================================================================
// skill_execute.js
// Executes shell script snippets supplied by MCP Studio skills.
// ===================================================================

const shared = require('sharedFunctions');

function taskLog(message) {
    shared.appendStandardOutput(message);
}

function skillExecute(params) {
    params = params || {};

    var content = params.content || params.script || params.shellScript || "";
    var operation = params.operation || "skillExecute";

    if (!content || String(content).trim().length === 0) {
        return shared.setErrorResult("Missing required parameter: content", {
            operation: operation
        });
    }

    var shellScript = String(content);
    
    var success = MCPStudio.shell(shellScript);

    if (success) {
        taskLog("[Script] Command successful!");
    }
    
    return shared.setProcessResult(
        success,
        "Skill script executed successfully.",
        "Skill script failed.",
        { operation: operation }
    );
}

module.exports = {
    skillExecute
};
