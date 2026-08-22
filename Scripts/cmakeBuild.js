// ===================================================================
// cmakeBuild.js - Direct process-based CMake configure and build.
// ===================================================================

const shared = require('sharedFunctions');

function cmakeBuild(params) {
    params = params || {};

    var projectValidation;
    var flagsValidation;
    var extraValidation;
    var projectDir;
    var projectTarget = params.projectTarget || "app";
    var buildType = params.buildType || "Debug";
    var verbose = params.verbose === true;
    var buildTypes = {
        debug: "Debug",
        release: "Release",
        relwithdebinfo: "RelWithDebInfo",
        minsizerel: "MinSizeRel"
    };
    var buildPath;
    var executableValidation;
    var configureArgs;
    var buildArgs;
    var configureRun;
    var buildRun;
    var output = shared.createProcessOutput();

    if (!params.projectDir) {
        return shared.setErrorResult("cmake project directory parameter required", {
            operation: "cmakeBuild"
        });
    }
    projectValidation = shared.validateDirectoryPath(params.projectDir, "projectDir");
    if (!projectValidation.ok) {
        return shared.setErrorResult(projectValidation.message, { operation: "cmakeBuild" });
    }
    projectDir = projectValidation.value;

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

    flagsValidation = shared.splitArgumentString(params.cmakeFlags, "cmakeFlags");
    extraValidation = shared.splitArgumentString(params.cmakeArgs, "cmakeArgs");
    if (!flagsValidation.ok || !extraValidation.ok) {
        return shared.setErrorResult(
            !flagsValidation.ok ? flagsValidation.message : extraValidation.message,
            { operation: "cmakeBuild", path: projectDir }
        );
    }
    if (!MCPStudio.fileExists(projectDir)) {
        return shared.setErrorResult("CMake project directory not found: " + projectDir, {
            operation: "cmakeBuild",
            path: projectDir
        });
    }

    buildPath = shared.joinPath(projectDir, "build");
    if (!MCPStudio.fileExists(buildPath) && !MCPStudio.createDirectory(buildPath)) {
        return shared.setErrorResult("Failed to create build directory: " + buildPath, {
            operation: "cmakeBuild",
            path: buildPath
        });
    }

    /* NOTE!: Security Gate: Allow only following path's */
    executableValidation = shared.resolveTool("cmake", "cmake", [
        "/opt/homebrew/bin/cmake",
        "/usr/local/bin/cmake",
        "/usr/bin/cmake"
    ]);
    if (!executableValidation.ok) {
        return shared.setErrorResult(executableValidation.message, {
            operation: "cmakeBuild",
            path: projectDir
        });
    }

    configureArgs = [
        "-S", projectDir,
        "-B", buildPath,
        "-DCMAKE_BUILD_TYPE=" + buildType
    ].concat(flagsValidation.value, extraValidation.value);
    configureRun = shared.executeProcess(executableValidation.value, configureArgs);
    shared.appendProcessRun(output, "Configure", configureRun);
    if (!configureRun.success) {
        return shared.setProcessResult(false, "", "CMake configuration failed.", {
            operation: "cmakeBuild",
            path: projectDir,
            target: projectTarget,
            buildType: buildType,
            executable: executableValidation.value
        }, output.stdout, output.stderr);
    }

    buildArgs = [
        "--build", buildPath,
        "--config", buildType,
        "--target", projectTarget
    ];
    if (verbose) {
        buildArgs.push("--verbose");
    }
    buildRun = shared.executeProcess(executableValidation.value, buildArgs);
    shared.appendProcessRun(output, "Build", buildRun);

    return shared.setProcessResult(
        buildRun.success,
        "CMake build succeeded.",
        "CMake build failed.",
        {
            operation: "cmakeBuild",
            path: projectDir,
            target: projectTarget,
            buildType: buildType,
            executable: executableValidation.value
        },
        output.stdout,
        output.stderr
    );
}

module.exports = { cmakeBuild };
