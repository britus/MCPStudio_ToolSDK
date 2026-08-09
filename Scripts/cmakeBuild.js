// ===================================================================
// cmakeBuild.js - JavaScript wrapper for CMake build script
// Uses shellCall to execute shell commands (real execution)
// Follows MCP Studio tool entry pattern
// ===================================================================

const shared = require('sharedFunctions');

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
  var projectDirValidation;
  var cmakeFlagsValidation;
  var cmakeArgsValidation;

  // Validate required parameters
  if (!params || !params.projectDir) {
    return shared.setErrorResult("[Script] cmake Project directory parameter required.\n", {
      operation: "cmakeBuild"
    });
  }

  projectDirValidation = shared.validateDirectoryPath(params.projectDir, "projectDir");
  if (!projectDirValidation.ok) {
    return shared.setErrorResult(projectDirValidation.message, {
      operation: "cmakeBuild"
    });
  }

  var projectDir = projectDirValidation.value;
  var projectTarget = params.projectTarget || 'app';
  var buildType = params.buildType || 'Debug';
  var verbose = params.verbose === true;

  var buildTypes = {
    debug: "Debug",
    release: "Release",
    relwithdebinfo: "RelWithDebInfo",
    minsizerel: "MinSizeRel"
  };
  if (typeof projectTarget !== "string" || projectTarget.trim().length === 0) {
    return shared.setErrorResult("projectTarget must be a non-empty string", {
      operation: "cmakeBuild",
      path: projectDir
    });
  }
  projectTarget = projectTarget.trim();

  if (typeof buildType !== "string" ||
      !Object.prototype.hasOwnProperty.call(buildTypes, buildType.toLowerCase())) {
    return shared.setErrorResult("Unsupported buildType: " + buildType, {
      operation: "cmakeBuild",
      path: projectDir
    });
  }
  buildType = buildTypes[buildType.toLowerCase()];

  cmakeFlagsValidation = shared.validateShellFragment(params.cmakeFlags, "cmakeFlags");
  cmakeArgsValidation = shared.validateShellFragment(params.cmakeArgs, "cmakeArgs");
  if (!cmakeFlagsValidation.ok || !cmakeArgsValidation.ok) {
    return shared.setErrorResult(
      !cmakeFlagsValidation.ok ? cmakeFlagsValidation.message : cmakeArgsValidation.message,
      { operation: "cmakeBuild", path: projectDir }
    );
  }

  var cmakeFlags = cmakeFlagsValidation.value;
  var cmakeArgs = cmakeArgsValidation.value;

  // Validate directory exists using MCPStudio API
  if (!MCPStudio.fileExists(projectDir)) {
    return shared.setErrorResult("cmake Project directory '" + projectDir + "' not found.", {
      operation: "cmakeBuild",
      path: projectDir
    });
  }

  // Ensure build directory exists
  var buildPath = projectDir + '/build';
  if (!MCPStudio.fileExists(buildPath)) {
    if (!MCPStudio.createDirectory(buildPath)) {
      return shared.setErrorResult("Failed to create build directory: " + buildPath, {
        operation: "cmakeBuild",
        path: buildPath
      });
    }
  }

  // Build command (as shell script)
  var configureCommand = "cmake -S . -B build -DCMAKE_BUILD_TYPE=" + shared.quoteShellArgument(buildType);
  var buildCommand = "cmake --build build --config " + shared.quoteShellArgument(buildType) +
    " --target " + shared.quoteShellArgument(projectTarget);
  if (cmakeFlags) {
    configureCommand += " " + cmakeFlags;
  }
  if (cmakeArgs) {
    configureCommand += " " + cmakeArgs;
  }
  if (verbose) {
    buildCommand += " --verbose";
  }

  var shellScript = [
    "#!/bin/bash",
    "set -euo pipefail",
    "export PATH=/opt/homebrew/bin:/usr/local/bin:/bin:/usr/bin:$PATH",
    "cd " + shared.quoteShellArgument(projectDir),
    "echo 'Configuring CMake project...'",
    configureCommand,
    "echo 'Building CMake target...'",
    buildCommand,
    "echo 'Build completed successfully.'"
  ].join('\n');

  var success = MCPStudio.shell(shellScript);

  return shared.setProcessResult(success, "CMake build succeeded.", "CMake build failed.", {
    operation: "cmakeBuild",
    path: projectDir,
    target: projectTarget,
    buildType: buildType
  });
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
