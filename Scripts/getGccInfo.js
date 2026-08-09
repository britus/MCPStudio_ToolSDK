// ===================================================================
// Handler Function: getGccInfo
// Gets basic GCC compiler information and version
// Simple tool for quick GCC checks
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    shared.appendStandardOutput(message);
}

/**
 * Get basic GCC compiler information
 * @param {Object} params - Command parameters
 * @param {string} [params.compiler="gcc"] - Compiler to check (gcc, g++, ar, nm)
 */

function getGccInfo(params) {
    params = params || {};
    var compiler = params.compiler || "gcc";
    var compilerValidation = shared.validateExecutable(compiler, "compiler");

    if (!compilerValidation.ok) {
        return shared.setErrorResult(compilerValidation.message, {
            operation: "getGccInfo"
        });
    }
    compiler = compilerValidation.value;
    
    taskLog("=== Basic GCC Info Task ===");
    taskLog("Compiler: " + compiler);

    // Validate input parameters
    var compilerPath = compiler;
    
    if (compilerPath.indexOf("/") >= 0 && !MCPStudio.fileExists(compilerPath)) {
        return shared.setErrorResult(
            "GCC compiler not found at " + compilerPath + ". Please install GCC using: brew install gcc or sudo apt-get install gcc",
            {
                operation: "getGccInfo",
                path: compilerPath
            }
        );
    }

    taskLog("[Script] GCC compiler detected at " + compilerPath);

    // Build shell script for basic GCC info
    var shellScript = '#!/bin/bash\n';
    var success = false;
    
    // Get notified
    shellScript += 'set -euo pipefail\n';
    shellScript += 'COMPILER=' + shared.quoteShellArgument(compiler) + '\n';
    shellScript += 'if ! command -v "${COMPILER}" >/dev/null 2>&1; then echo "Compiler not found: ${COMPILER}" >&2; exit 1; fi\n';
    compiler = '"${COMPILER}"';

    // Basic version information
    shellScript += 'echo "=== Basic Version Information ==="\n';
    shellScript += compiler + ' --version 2>&1 || echo "Version info not available"\n\n';

    // Compiler location
    shellScript += 'echo "=== Compiler Location ==="\n';
    shellScript += 'which ' + compiler + ' || echo "Not found in PATH"\n\n';

    // Target architecture
    shellScript += 'echo "=== Target Architecture ==="\n';
    shellScript += compiler + ' -dumpmachine 2>&1 || true\n\n';

    // Compiler version
    shellScript += 'echo "=== Compiler Version ==="\n';
    shellScript += compiler + ' -dumpversion 2>&1 || true\n\n';

    taskLog("[Script] Running basic GCC info script...");
    
    success = MCPStudio.shell(shellScript);
    
    return shared.setProcessResult(
        success,
        "Basic GCC information collected successfully.",
        "Failed to collect basic GCC information.",
        {
            path: compilerPath,
            compiler: compilerPath,
            operation: "getGccInfo"
        }
    );
}

module.exports = {
    getGccInfo
};
