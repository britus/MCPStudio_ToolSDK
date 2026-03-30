// ===================================================================
// Handler Function: getGccInfo
// Gets basic GCC compiler information and version
// Simple tool for quick GCC checks
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    console.log(message);
    stdOut.push(message);
}

/**
 * Get basic GCC compiler information
 * @param {Object} params - Command parameters
 * @param {string} [params.compiler="gcc"] - Compiler to check (gcc, g++, ar, nm)
 */

function getGccInfo(params) {
    var compiler = params.compiler || "gcc";
    
    taskLog("=== Basic GCC Info Task ===");
    taskLog("Compiler: " + compiler);

    // Validate input parameters
    var compilerPath = "/usr/bin/" + compiler;
    
    if (!MCPStudio.fileExists(compilerPath)) {
        return shared.createErrorResult("GCC compiler not found at " + compilerPath + ". Please install GCC using: brew install gcc or sudo apt-get install gcc");
    }

    taskLog("[Script] GCC compiler detected at " + compilerPath);

    // Build shell script for basic GCC info
    var shellScript = '#!/bin/bash\n';
    var success = false;
    
    // Get notified
    shellScript += 'set -euo pipefail\n';

    // Basic version information
    shellScript += 'echo "=== Basic Version Information ==="\n';
    shellScript += '"'"' + compiler + "'"' --version 2>&1 || echo "Version info not available"\n\n';

    // Compiler location
    shellScript += 'echo "=== Compiler Location ==="\n';
    shellScript += '"'"'which '"'"' + compiler + "'"' || echo "Not found in PATH"\n\n';

    // Target architecture
    shellScript += 'echo "=== Target Architecture ==="\n';
    shellScript += '"'"' + compiler + "'"' -dumpmachine 2>&1 || true\n\n';

    // Compiler version
    shellScript += 'echo "=== Compiler Version ==="\n';
    shellScript += '"'"' + compiler + "'"' -dumpversion 2>&1 || true\n\n';

    taskLog("[Script] Running basic GCC info script...");
    
    success = MCPStudio.shell(shellScript);
    
    if (!success) {
        MCPStudio.setToolResult(JSON.stringify({
            text: "[Script] Basic GCC Info FAILED\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
            metadata: {
                path: compilerPath,
                compiler: compiler,
                operation: "getGccInfo",
                success: false,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] Basic GCC info failed!");
    }
    else {
        MCPStudio.setToolResult(JSON.stringify({
            text: "[Script] Basic GCC Info completed successfully\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
            metadata: {
                path: compilerPath,
                compiler: compiler,
                operation: "getGccInfo",
                success: true,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] Basic GCC info successful!");
    }

    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
    getGccInfo
};
