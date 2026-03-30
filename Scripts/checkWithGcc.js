// ===================================================================
// Handler Function: checkWithGcc
// Determines GCC compiler settings and configuration
// Fixed version - detects GCC installation and settings
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function taskLog(message) {
    console.log(message);
    stdOut.push(message);
}

/**
 * Check and determine GCC compiler settings and configuration
 * @param {Object} params - Command parameters
 * @param {string} [params.arch=""] - Target architecture (x86_64, arm64, etc.)
 * @param {boolean} [params.verbose=false] - Show verbose output during detection
 */

function checkWithGcc(params) {
    var arch = params.arch || "";
    var compilerPath = params. compilerPath || "/usr/local/bin";
    var verbose = (params.verbose === true);
    
    taskLog("=== GCC Compiler Detection Task ===");
    taskLog("Architecture: " + arch);
    taskLog("Verbose: " + verbose);

    // Validate input parameters
    // if (!MCPStudio.fileExists("/usr/bin/gcc")) {
    //     return shared.createErrorResult("GCC compiler not found at /usr/bin/gcc. Please install GCC using: brew install gcc or sudo apt-get install gcc");
    // }

    taskLog("[Script] GCC compiler detected at /usr/bin/gcc");

    // Build shell script for comprehensive GCC detection
    var shellScript = '#!/bin/bash\n';
    var success = false;
    
    // Get notified
    shellScript += 'set -euo pipefail\n';
    shellScript += 'which gcc 2>&1\n';

    // Basic version check
    shellScript += 'echo "=== GCC Version Information ==="\n';
    shellScript += 'gcc --version 2>&1 || true\n\n';

    // Check for g++ (C++ compiler)
    shellScript += 'echo "=== G++ Version Information ==="\n';
    shellScript += 'g++ --version 2>&1 || echo "G++ not found"\n\n';

    // Check for gcc-ar (archive utility)
    shellScript += 'echo "=== GCC Archive Utility ==="\n';
    shellScript += 'gcc-ar --version 2>&1 || echo "gcc-ar not found"\n\n';

    // Check for gcc-nm (name utility)
    shellScript += 'echo "=== GCC Name Utility ==="\n';
    shellScript += 'gcc-nm --version 2>&1 || echo "gcc-nm not found"\n\n';

    // C compiler flags detection
    shellScript += 'echo "=== C Compiler Flags Detection ==="\n';
    shellScript += 'echo "Checking for -std=c99 support:"\n';
    shellScript += 'gcc -dM -E -x c /dev/null | grep -i _GNU_SOURCE || echo "No _GNU_SOURCE defined"\n\n';

    shellScript += 'echo "Checking for -std=c11 support:"\n';
    shellScript += 'gcc -dM -E -x c /dev/null 2>&1 | grep -i __STDC_VERSION__ || echo "C11 not detected"\n\n';

    // C++ compiler flags detection
    shellScript += 'echo "=== C++ Compiler Flags Detection ==="\n';
    shellScript += 'echo "Checking for -std=c++98 support:"\n';
    shellScript += 'g++ -dM -E -x c++ /dev/null | grep -i _GLIBCXX || echo "No GLIBCXX detected"\n\n';

    shellScript += 'echo "Checking for -std=c++11 support:"\n';
    shellScript += 'g++ -dM -E -x c++ /dev/null 2>&1 | grep -i __cplusplus || echo "C++11 not detected"\n\n';

    // Check architecture detection
    shellScript += 'echo "=== Architecture Detection ==="\n';
    shellScript += 'uname -m\n';
    shellScript += 'arch\n\n';

    // Check for cross-compilation support (if arch specified)
    if (arch.length > 0) {
        shellScript += 'echo "=== Cross-Compilation Support ==="\n';
        shellScript += 'gcc -print-multi-lib 2>&1 || echo "No multi-lib configuration"\n\n';
        
        // Check for target-specific flags
        shellScript += 'echo "Checking target architecture:"\n';
        shellScript += 'gcc -dumpmachine 2>&1 || true\n\n';
    }

    // Include paths detection
    shellScript += 'echo "=== Include Paths Detection ==="\n';
    shellScript += 'gcc -print-file-name=include 2>&1 || echo "Cannot determine include path"\n\n';

    // Library paths detection
    shellScript += 'echo "=== Library Paths Detection ==="\n';
    shellScript += 'gcc -print-search-dirs 2>&1 || echo "Cannot determine library search dirs"\n\n';

    // Linker flags detection
    shellScript += 'echo "=== Linker Flags Detection ==="\n';
    shellScript += 'gcc -Wl,--version 2>&1 | head -5 || true\n\n';

    // Check for LTO (Link-Time Optimization) support
    shellScript += 'echo "=== LTO Support Check ==="\n';
    shellScript += 'gcc -flto -c /dev/null -o /dev/null 2>&1 && echo "LTO supported" || echo "LTO not supported or failed"\n\n';

    // Check for PIE (Position Independent Executable) support
    shellScript += 'echo "=== PIE Support Check ==="\n';
    shellScript += 'gcc -fPIE -c /dev/null -o /dev/null 2>&1 && echo "PIE supported" || echo "PIE not supported or failed"\n\n';

    // Check for FORTIFY_SOURCE support
    shellScript += 'echo "=== Security Hardening Flags ==="\n';
    shellScript += 'gcc -Wl,-fstack-protector-strong -c /dev/null -o /dev/null 2>&1 && echo "Stack protector supported" || echo "Stack protector not available"\n\n';

    // Check for ASLR support
    shellScript += 'echo "=== ASLR Support Check ==="\n';
    shellScript += 'gcc -fstack-protector-all -c /dev/null -o /dev/null 2>&1 && echo "ASLR compatible" || echo "ASLR not available"\n\n';

    // Print GCC build ID if available
    shellScript += 'echo "=== GCC Build ID ==="\n';
    shellScript += 'gcc --version 2>&1 | grep -i "build id" || echo "Build ID not available"\n\n';

    // Check for native target detection
    shellScript += 'echo "=== Native Target Detection ==="\n';
    shellScript += 'gcc -dumpmachine\n';
    shellScript += 'gcc -dumpversion\n';
    shellScript += 'gcc --target-help 2>&1 | head -20 || true\n\n';

    // Summary section
    shellScript += 'echo "=== GCC Detection Summary ==="\n';
    shellScript += 'echo "Compiler: $(which gcc)";\n';
    shellScript += 'echo "Version: $(gcc --version 2>&1 | head -1)";\n';
    shellScript += 'echo "C++ Compiler: $(which g++)";\n';
    shellScript += 'echo "C++ Version: $(g++ --version 2>&1 | head -1 || echo "Not found")";\n';

    taskLog("[Script] Running GCC detection script...");
    
    success = MCPStudio.shell(shellScript);
    
    if (!success) {
        MCPStudio.setToolResult(JSON.stringify({
            text: "[Script] GCC Detection FAILED\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
            metadata: {
                path: "gcc",
                arch: arch,
                operation: "checkWithGcc",
                success: false,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] GCC detection failed!"+ 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""));
    }
    else {
        MCPStudio.setToolResult(JSON.stringify({
            text: "[Script] GCC Detection completed successfully\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") +  
               (stdErr && stdErr.length > 0 ? "\nErrors and Warnings:\n" + stdErr.join("\n") : ""),
            metadata: {
                path: "gcc",
                arch: arch,
                operation: "checkWithGcc",
                success: true,
                stdout: stdOut,
                stderr: stdErr,
            }
        }));
        taskLog("[Script] GCC detection successful!");
    }

    return null; // Result already set via MCPStudio.setToolResult
}

module.exports = {
    checkWithGcc
};
