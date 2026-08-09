// ===================================================================
// qmakeBuild.js - JavaScript wrapper for QMake build script
// Uses shellCall to execute shell commands (real execution)
// Follows MCP Studio tool entry pattern
// ===================================================================
const shared = require('sharedFunctions');

/** 
 * Builds a Qt project using QMake with flexible parameters.
 *
 * @param {Object} params - Build parameters
 * @param {string} params.projectDir - Path to the project directory (required)
 * @param {string} [params.projectFile='project.pro'] - The main QMake project file (.pro) name relative to projectDir.
 * @param {string} [params.buildType='Debug'] - Build type ('Debug' or 'Release').
 * @param {string} [params.qmakeArgs=''] - Additional QMake arguments (e.g., 'CONFIG+=qtquickcompiler').
 * @param {string} [params.makeArgs=''] - Additional Make arguments (e.g., '-j4').
 * @param {boolean} [params.verbose=false] - Whether to show verbose output. (Not directly used in shell script, but for consistency)
 * @returns {string} JSON result (success: boolean, message: string)
 */
function qmakeBuild(params) {
  var projectDirValidation;
  var projectFileValidation;
  var qmakeArgsValidation;
  var makeArgsValidation;

  // Validate required parameters
  if (!params || !params.projectDir) {
    return shared.setErrorResult("[Script] QMake project directory parameter required.\n", {
      operation: "qmakeBuild"
    });
  }

  var projectTarget = params.projectTarget || 'app';
  if (typeof projectTarget !== "string" || projectTarget.trim().length === 0) {
    return shared.setErrorResult("projectTarget must be a non-empty string", {
      operation: "qmakeBuild"
    });
  }
  projectTarget = projectTarget.trim();
  projectDirValidation = shared.validateDirectoryPath(params.projectDir, "projectDir");
  if (!projectDirValidation.ok) {
    return shared.setErrorResult(projectDirValidation.message, {
      operation: "qmakeBuild"
    });
  }

  var projectDir = projectDirValidation.value;
  projectFileValidation = shared.validatePath(params.projectFile || projectTarget + '.pro', "projectFile", { relative: true });
  if (!projectFileValidation.ok) {
    return shared.setErrorResult(projectFileValidation.message, {
      operation: "qmakeBuild",
      path: projectDir
    });
  }

  var projectFile = projectFileValidation.value;
  var buildType = params.buildType || 'Debug';
  var verbose = params.verbose === true;

  if (typeof buildType !== "string" || ["debug", "release"].indexOf(buildType.toLowerCase()) < 0) {
    return shared.setErrorResult("Unsupported buildType: " + buildType, {
      operation: "qmakeBuild",
      path: projectDir
    });
  }
  buildType = buildType.toLowerCase() === "release" ? "Release" : "Debug";

  qmakeArgsValidation = shared.validateShellFragment(params.qmakeArgs, "qmakeArgs");
  makeArgsValidation = shared.validateShellFragment(params.makeArgs, "makeArgs");
  if (!qmakeArgsValidation.ok || !makeArgsValidation.ok) {
    return shared.setErrorResult(
      !qmakeArgsValidation.ok ? qmakeArgsValidation.message : makeArgsValidation.message,
      { operation: "qmakeBuild", path: projectDir }
    );
  }

  var qmakeArgs = qmakeArgsValidation.value;
  var makeArgs = makeArgsValidation.value;

  // Validate directory exists using MCPStudio API
  if (!MCPStudio.fileExists(projectDir)) {
    return shared.setErrorResult("QMake project directory '" + projectDir + "' not found.", {
      operation: "qmakeBuild",
      path: projectDir
    });
  }

  // Ensure build directory exists
  var buildPath = projectDir + '/build';
  if (!MCPStudio.fileExists(buildPath)) {
    if (!MCPStudio.createDirectory(buildPath)) {
      return shared.setErrorResult("Failed to create build directory: " + buildPath, {
        operation: "qmakeBuild",
        path: buildPath
      });
    }
  }

  // Construct QMake CONFIG arguments based on buildType
  var configArgsForQMake = '';
  if (buildType.toLowerCase() === 'release') {
    configArgsForQMake = 'CONFIG+=release';
  } else { // Default to Debug
    configArgsForQMake = 'CONFIG+=debug';
  }

  // Build command (as shell script)
  var qmakeCommand = "qmake " + shared.quoteShellArgument("../" + projectFile) +
    " " + configArgsForQMake;
  var makeCommand = "make -j8";
  if (qmakeArgs) {
    qmakeCommand += " " + qmakeArgs;
  }
  if (makeArgs) {
    makeCommand += " " + makeArgs;
  }

  var shellScript = [
    "#!/bin/bash",
    "set -euo pipefail",
    "export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH",
    "if [ -n \"${QTDIR:-}\" ] && [ -d \"${QTDIR}\" ]; then",
    "  export PATH=\"${QTDIR}/bin:${PATH}\"",
    "fi",
    "if ! command -v qmake >/dev/null 2>&1; then",
    "  echo 'qmake was not found in PATH or QTDIR.' >&2",
    "  exit 1",
    "fi",
    "cd " + shared.quoteShellArgument(projectDir),
    (verbose ? "echo 'Ensuring build directory...'" : ""),
    "mkdir -p build",
    "cd build",
    "echo 'Running QMake...'",
    qmakeCommand,
    "echo 'Building...'",
    makeCommand,
    "echo 'Build completed successfully.'"
  ].join('\n');

  var success = MCPStudio.shell(shellScript);

  return shared.setProcessResult(
    success,
    "QMake build succeeded.",
    "QMake build failed.",
    {
      operation: "qmakeBuild",
      path: projectDir,
      projectFile: projectFile,
      buildType: buildType
    }
  );
}

// Example usage:
// qmakeBuild({
//   projectDir: '/path/to/qt_project',
//   projectFile: 'myproject.pro', // Optional, defaults to 'project.pro'
//   buildType: 'Release',          // Optional, defaults to 'Debug'
//   qmakeArgs: 'CONFIG+=qtquickcompiler', // Optional additional qmake flags
//   makeArgs: '-j4',               // Optional additional make flags
//   verbose: true                  // Optional
// });

module.exports = { qmakeBuild };
