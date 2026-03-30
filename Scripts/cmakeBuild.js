// ===================================================================
// cmakeBuild.js - JavaScript wrapper for CMake build script
// Uses shellCall to execute shell commands (real execution)
// Follows MCP Studio tool entry pattern
// ===================================================================

const shared = require('sharedFunctions');
const shellCall = require('shellCall').shellCall;

/** 
 * Builds a CMake project with flexible parameters.
 *
 * @param {Object} params - Build parameters
 * @param {string} params.projectDir - Path to the project directory (required)
 * @param {string} params.projectTarget - Target name (default: 'app')
 * @param {string} params.buildType - Build type (default: 'Debug')
 * @param {string} params.cmakeFlags - Additional CMake flags (e.g., -DCMAKE_BUILD_TYPE=Release)
 * @param {string} params.cmakeArgs - Additional CMake arguments (e.g., -DCMAKE_CXX_STANDARD=17)
 * @param {boolean} params.verbose - Whether to show verbose output (default: false)
 * @returns {string} JSON result (success: boolean, message: string)
 */

function cmakeBuild(params) {
  // Validate required parameters
  if (!params || !params.projectDir) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] cmake Project directory parameter required.\n",
        metadata: {
            operation: "cmakeBuild",
            success: false,
            stdout: stdOut,
            stderr: stdErr,
        }
    }));
    return;
  }

  const projectDir = params.projectDir;
  const projectTarget = params.projectTarget || 'app';
  const buildType = params.buildType || 'Debug';
  const cmakeFlags = params.cmakeFlags || '';
  const cmakeArgs = params.cmakeArgs || '';
  const verbose = params.verbose !== undefined ? params.verbose : false;

  // Validate directory exists using MCPStudio API
  if (!MCPStudio.fileExists(projectDir)) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "cmake Project directory '"+ projectDir+"' not found.",
        metadata: {
            operation: "cmakeBuild",
            success: false,
            stdout: stdOut,
            stderr: stdErr,
        }
    }));
    return;
  }

  // Ensure build directory exists
  const buildPath = projectDir + '/build';
  if (!MCPStudio.fileExists(buildPath)) {
    MCPStudio.createDirectory(buildPath);
  }

  // Set default CMAKE_FLAGS if empty
  let finalCmakeFlags = cmakeFlags;
  if (!finalCmakeFlags) {
    finalCmakeFlags = `-DCMAKE_BUILD_TYPE=${buildType}`;
  }

  // Build command (as shell script)
  const shellScript = [
    `#!/bin/bash`,
    `set -euo pipefail`,
    `export PATH=/usr/local/bin:/bin:/usr/bin:$PATH`,
    `cd ${projectDir} || { echo 'Failed to change to project directory: ${projectDir}'; exit 1; }`,
    `echo 'Running CMake...';`,
    `cmake -S . -B build -DCMAKE_BUILD_TYPE=${buildType} ${finalCmakeFlags} ${cmakeArgs} || { echo 'CMake failed.'; exit 1; }`,
    `echo 'Building...';`,
    //`cmake --build build --config ${buildType} --target ${projectTarget} || { echo 'Build failed.'; exit 1; }`,
    `cd build || exit 1`,
    `make -j8 || exit 1`,
    `echo 'Build completed successfully.'`
  ].join('\n');

  var success = MCPStudio.shell(shellScript);

  // Return result as JSON (success/failure)
  if (success) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] cmake successfully\n" + 
                (stdOut && stdOut.length > 0 ? stdOut.join("\n") : ""),
        metadata: {
            operation: "cmakeBuild",
            shellScript: shellScript,
            success: true,
            sstdout: stdOut,
            stderr: stdErr,
        }
    }));
  } else {    
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] cmake failed.\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") + "\n--- Stderr ---\n" + 
               (stdErr && stdErr.length > 0 ? stdErr.join("\n") : ""),
        metadata: {
            operation: "cmakeBuild",
            shellScript: shellScript,
            success: false,
            stdout: stdOut,
            stderr: stdErr,
        }
    }));
  }
  return null; // result already set (setToolResult)
}

// Example usage:
// cmakeBuild({
//   projectDir: '/path/to/project',
//   projectTarget: 'app',
//   buildType: 'Release',
//   cmakeFlags: '-DCMAKE_CXX_STANDARD=17',
//   verbose: true
// });

module.exports = { cmakeBuild };

// Note: This script is designed to be used in the MCP Studio environment with shell integration.
// In production, it will execute the shell command via shellCall and return actual output.
