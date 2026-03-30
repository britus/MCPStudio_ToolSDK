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
  // Validate required parameters
  if (!params || !params.projectDir) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] QMake project directory parameter required.\n",
        metadata: {
            operation: "qmakeBuild",
            success: false,
            stdout: stdOut,
            stderr: stdErr,
        }
    }));
    return;
  }

  const qtPlatformDir = "/Users/eofmc/Qt/6.11.0/macos";

  const projectDir = params.projectDir;
  const projectTarget = params.projectTarget || 'QMAKE project target name missing';
  const projectFile = params.projectFile || projectTarget + '.pro';
  const buildType = params.buildType || 'Debug'; // 'Debug' or 'Release'
  const qmakeArgs = params.qmakeArgs || '';
  const makeArgs = params.makeArgs || '';
  const verbose = params.verbose !== undefined ? params.verbose : false;

  // Validate directory exists using MCPStudio API
  if (!MCPStudio.fileExists(projectDir)) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "QMake project directory '" + projectDir + "' not found.",
        metadata: {
            operation: "qmakeBuild",
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

  // Construct QMake CONFIG arguments based on buildType
  let configArgsForQMake = '';
  if (buildType.toLowerCase() === 'release') {
    configArgsForQMake = 'CONFIG+=release';
  } else { // Default to Debug
    configArgsForQMake = 'CONFIG+=debug';
  }

  // Build command (as shell script)
  const shellScript = [
    `#!/bin/bash`,
    `set -euo pipefail`,
    // Ensure qmake and make are in PATH. Common Qt6 path added.
    // User might need to adjust /opt/Qt/6.x.x/gcc_64/bin depending on their Qt installation path.
    `export QTDIR=${qtPlatformDir}`,
    `export PATH=$QTDIR/bin:/usr/local/qt6/bin:/usr/local/bin:/bin:/usr/bin:$PATH`,
    `cd "${projectDir}" || { echo 'Failed to change to project directory: ${projectDir}'; exit 1; }`,
    (verbose ? `echo 'Ensuring build directory...'` : ''),
    `mkdir -p build || { echo 'Failed to create build directory.'; exit 1; }`,
    `cd build || { echo 'Failed to change to build directory.'; exit 1; }`,
    `echo 'Running QMake...'`,
    // Run qmake from the build directory, pointing to the .pro file in the parent project directory
    `qmake ../"${projectFile}" ${configArgsForQMake} ${qmakeArgs} || { echo 'QMake failed.'; exit 1; }`,
    `echo 'Building...'`,
    `make -j8 ${makeArgs} || { echo 'Build failed.'; exit 1; }`,
    `echo 'Build completed successfully.'`
  ].join('\n');

  var success = MCPStudio.shell(shellScript);

  // Return result as JSON (success/failure)
  if (success) {
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] QMake project built successfully.\n\n" + 
                (stdOut && stdOut.length > 0 ? stdOut.join("\n") : ""),
        metadata: {
            operation: "qmakeBuild",
            shellScript: shellScript,
            success: true,
            stdout: stdOut,
            stderr: stdErr,
        }
    }));
  } else {    
    MCPStudio.setToolResult(JSON.stringify({
        text: "[Script] QMake project build failed.\n\n" + 
               (stdOut && stdOut.length > 0 ? stdOut.join("\n") : "") + "\n--- Stderr ---\n" + 
               (stdErr && stdErr.length > 0 ? stdErr.join("\n") : ""),
        metadata: {
            operation: "qmakeBuild",
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
// qmakeBuild({
//   projectDir: '/path/to/qt_project',
//   projectFile: 'myproject.pro', // Optional, defaults to 'project.pro'
//   buildType: 'Release',          // Optional, defaults to 'Debug'
//   qmakeArgs: 'CONFIG+=qtquickcompiler', // Optional additional qmake flags
//   makeArgs: '-j4',               // Optional additional make flags
//   verbose: true                  // Optional
// });

module.exports = { qmakeBuild };
