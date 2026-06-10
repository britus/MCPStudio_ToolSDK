// ===================================================================
// skill_execute.js
// Executes shell script snippets supplied by MCP Studio skills.
// ===================================================================

const shared = require('sharedFunctions');

function taskLog(message) {
    console.log(message);
    stdOut.push(message);
}

function skillExecute(params) {
    params = params || {};

    var content = params.content || params.script || params.shellScript || "";
    var operation = params.operation || "skillExecute";

    if (!content || String(content).trim().length === 0) {
        return shared.setErrorResult("Missing required parameter: content", {
            operation: operation,
            stdout: stdOut,
            stderr: stdErr
        });
    }

    var shellScript = String(content);
    
    console.log("[Script] execute: " + shellScript);
    
    var success = MCPStudio.shell(shellScript);
    
    if (stdOut && stdOut.length > 0) {
        console.log("[Script] stdout:\n" + stdOut.join("\n"));
    }
    if (stdErr && stdErr.length > 0) {
        console.log("[Script] stderr:\n" + stdErr.join("\n"));
    }

    if (success) {
        taskLog("[Script] Command successful!");
    }
    
    MCPStudio.setToolResult(JSON.stringify({
        text: (success 
                ? "[Script] Skill script executed successfully.\n\n" 
                : "[Script] Skill script failed.\n\n") +
            (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +
            (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
        metadata: {
            operation: operation,
            success: success,
            stdout: stdOut,
            stderr: stdErr
        }
    }));

    return null;
}

module.exports = {
    skillExecute
};
