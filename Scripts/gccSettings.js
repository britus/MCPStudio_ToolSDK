// ===================================================================
// Handler Function: gccSettings
// Gets GCC compiler settings and configuration details
// Returns structured data about compiler capabilities
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    shared.appendStandardOutput(message);
}

/**
 * Get detailed GCC compiler settings and configuration
 * @param {Object} params - Command parameters
 * @param {string} [params.compiler="gcc"] - Compiler to check (gcc, g++, ar, nm)
 * @param {boolean} [params.verbose=false] - Show verbose output during detection
 */

function gccSettings(params) {
    params = params || {};
    var compiler = params.compiler || "gcc";
    var verbose = (params.verbose === true);
    var compilerValidation = shared.validateExecutable(compiler, "compiler");

    if (!compilerValidation.ok) {
        return shared.setErrorResult(compilerValidation.message, {
            operation: "gccSettings"
        });
    }
    compiler = compilerValidation.value;
    
    taskLog("=== GCC Settings Detection Task ===");
    taskLog("Compiler: " + compiler);
    taskLog("Verbose: " + verbose);

    // Validate input parameters
    var compilerPath = compiler;
    var compilerName = compilerPath.substring(compilerPath.lastIndexOf("/") + 1);
    var isCppCompiler = /^g\+\+(-[0-9.]+)?$/.test(compilerName);
    
    if (compilerPath.indexOf("/") >= 0 && !MCPStudio.fileExists(compilerPath)) {
        return shared.setErrorResult(
            "GCC compiler not found at " + compilerPath + ". Please install GCC using: brew install gcc or sudo apt-get install gcc",
            {
                operation: "gccSettings",
                path: compilerPath
            }
        );
    }

    taskLog("[Script] GCC compiler detected at " + compilerPath);

    // Build shell script for comprehensive GCC settings detection
    var shellScript = '#!/bin/bash\n';
    var success = false;
    
    // Get notified
    shellScript += 'set -euo pipefail\n';
    if (verbose) {
        shellScript += 'set -x\n';
    }
    shellScript += 'COMPILER=' + shared.quoteShellArgument(compiler) + '\n';
    shellScript += 'if ! command -v "${COMPILER}" >/dev/null 2>&1; then echo "Compiler not found: ${COMPILER}" >&2; exit 1; fi\n';
    compiler = '"${COMPILER}"';

    // Basic version information
    shellScript += 'echo "=== Version Information ==="\n';
    shellScript += compiler + ' --version 2>&1 || echo "Version info not available"\n\n';

    // Compiler flags detection
    shellScript += 'echo "=== Compiler Flags Detection ==="\n';
    
    // Check for -std= flag support
    shellScript += 'echo "Checking standard C/C++ versions:"\n';
    shellScript += compiler + ' -dM -E -x c /dev/null 2>&1 | grep -i __STDC_VERSION__ || echo "Standard version not detected"\n\n';

    // Check for optimization flags
    shellScript += 'echo "Checking optimization support:"\n';
    shellScript += compiler + ' -O3 -c /dev/null -o /dev/null 2>&1 && echo "-O3 optimization supported" || echo "-O3 optimization not available"\n\n';

    // Check for debug flags
    shellScript += 'echo "Checking debug support:"\n';
    shellScript += compiler + ' -g -c /dev/null -o /dev/null 2>&1 && echo "-g debug symbols supported" || echo "-g debug symbols not available"\n\n';

    // Check for position independent code
    shellScript += 'echo "Checking PIC support:"\n';
    shellScript += compiler + ' -fPIC -c /dev/null -o /dev/null 2>&1 && echo "-fPIC position independent code supported" || echo "-fPIC not available"\n\n';

    // Check for PIE (Position Independent Executable) support
    shellScript += 'echo "Checking PIE support:"\n';
    shellScript += compiler + '  -fPIE -c /dev/null -o /dev/null 2>&1 && echo "-fPIE position independent executable supported" || echo "-fPIE not available"\n\n';

    // Check for LTO (Link-Time Optimization) support
    shellScript += 'echo "Checking LTO support:"\n';
    shellScript += compiler + ' -flto=thin -c /dev/null -o /dev/null 2>&1 && echo "-flto thin LTO supported" || echo "-flto not available"\n\n';

    // Check for stack protection
    shellScript += 'echo "Checking security hardening:"\n';
    shellScript += compiler + ' -fstack-protector-strong -c /dev/null -o /dev/null 2>&1 && echo "-fstack-protector-strong supported" || echo "-fstack-protector-strong not available"\n\n';

    // Include paths detection
    shellScript += 'echo "=== Include Paths Detection ==="\n';
    shellScript += compiler + ' -print-search-dirs 2>&1 | grep include || true\n\n';

    // Library paths detection
    shellScript += 'echo "=== Library Paths Detection ==="\n';
    shellScript += compiler + ' -print-search-dirs 2>&1 | grep lib || true\n\n';

    // Linker flags detection
    shellScript += 'echo "=== Linker Flags Detection ==="\n';
    shellScript += compiler + ' -Wl,--version 2>&1 | head -5 || true\n\n';

    // Check for native target detection
    shellScript += 'echo "=== Target Architecture Detection ==="\n';
    shellScript += compiler + ' -dumpmachine || true\n';
    shellScript += compiler + ' -dumpversion || true\n\n';

    // If C++ compiler, check additional settings
    if (isCppCompiler) {
        shellScript += 'echo "=== C++ Specific Settings ==="\n';
        shellScript += 'echo "Checking C++ standard support:"\n';
        shellScript += compiler + ' -dM -E -x c++ /dev/null 2>&1 | grep -i __cplusplus || echo "C++ standard version not detected"\n\n';
        
        shellScript += 'echo "Checking C++ ABI support:"\n';
        shellScript += compiler + ' -dM -E -x c++ /dev/null 2>&1 | grep -i _GLIBCXX || echo "C++ ABI not detected"\n\n';
        
        shellScript += 'echo "Checking C++ exceptions:"\n';
        shellScript += compiler + ' -fexceptions -c /dev/null -o /dev/null 2>&1 && echo "-fexceptions supported" || echo "-fexceptions not available"\n\n';
        
        shellScript += 'echo "Checking RTTI support:"\n';
        shellScript += compiler + ' -frtti -c /dev/null -o /dev/null 2>&1 && echo "-frtti supported" || echo "-frtti not available"\n\n';
    }

    // Summary section
    shellScript += 'echo "=== Compiler Settings Summary ==="\n';
    shellScript += compiler + ' --version 2>&1 | head -1\n';
    shellScript += compiler + ' -dumpmachine || true\n';
    shellScript += compiler + ' -dumpversion || true\n';

    taskLog("[Script] Running GCC settings detection script...");
    
    success = MCPStudio.shell(shellScript);
    
    return shared.setProcessResult(
        success,
        "GCC settings detection completed successfully.",
        "GCC settings detection failed.",
        {
            path: compilerPath,
            compiler: compilerPath,
            operation: "gccSettings"
        }
    );
}

module.exports = {
    gccSettings
};
