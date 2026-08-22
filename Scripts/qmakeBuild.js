// ===================================================================
// qmakeBuild.js - Direct process-based QMake configure and build.
// ===================================================================

const shared = require('sharedFunctions');

function qmakeBuild(params) {
    params = params || {};

    var projectTarget = params.projectTarget || "app";
    var projectValidation;
    var fileValidation;
    var qmakeArgsValidation;
    var makeArgsValidation;
    var projectDir;
    var projectFile;
    var projectFilePath;
    var buildType = params.buildType || "Debug";
    var buildPath;
    var makeFilePath;
    var qmakeValidation;
    var makeValidation;
    var qmakeArgs;
    var makeArgs;
    var qmakeRun;
    var makeRun;
    var output = shared.createProcessOutput();

    if (!params.projectDir) {
        return shared.setErrorResult("QMake project directory parameter required", {
            operation: "qmakeBuild"
        });
    }
    if (typeof projectTarget !== "string" || projectTarget.trim().length === 0) {
        return shared.setErrorResult("projectTarget must be a non-empty string", {
            operation: "qmakeBuild"
        });
    }
    projectTarget = projectTarget.trim();

    projectValidation = shared.validateDirectoryPath(params.projectDir, "projectDir");
    if (!projectValidation.ok) {
        return shared.setErrorResult(projectValidation.message, { operation: "qmakeBuild" });
    }
    projectDir = projectValidation.value;
    fileValidation = shared.validatePath(
        params.projectFile || projectTarget + ".pro",
        "projectFile",
        { relative: true }
    );
    if (!fileValidation.ok) {
        return shared.setErrorResult(fileValidation.message, {
            operation: "qmakeBuild",
            path: projectDir
        });
    }
    projectFile = fileValidation.value;

    if (typeof buildType !== "string" || ["debug", "release"].indexOf(buildType.toLowerCase()) < 0) {
        return shared.setErrorResult("Unsupported buildType: " + buildType, {
            operation: "qmakeBuild",
            path: projectDir
        });
    }
    buildType = buildType.toLowerCase() === "release" ? "Release" : "Debug";

    qmakeArgsValidation = shared.splitArgumentString(params.qmakeArgs, "qmakeArgs");
    makeArgsValidation = shared.splitArgumentString(params.makeArgs, "makeArgs");
    if (!qmakeArgsValidation.ok || !makeArgsValidation.ok) {
        return shared.setErrorResult(
            !qmakeArgsValidation.ok ? qmakeArgsValidation.message : makeArgsValidation.message,
            { operation: "qmakeBuild", path: projectDir }
        );
    }
    if (!MCPStudio.fileExists(projectDir)) {
        return shared.setErrorResult("QMake project directory not found: " + projectDir, {
            operation: "qmakeBuild",
            path: projectDir
        });
    }
    projectFilePath = shared.joinPath(projectDir, projectFile);
    if (!MCPStudio.fileExists(projectFilePath)) {
        return shared.setErrorResult("QMake project file not found: " + projectFilePath, {
            operation: "qmakeBuild",
            path: projectFilePath
        });
    }

    buildPath = shared.joinPath(projectDir, "build");
    if (!MCPStudio.fileExists(buildPath) && !MCPStudio.createDirectory(buildPath)) {
        return shared.setErrorResult("Failed to create build directory: " + buildPath, {
            operation: "qmakeBuild",
            path: buildPath
        });
    }
    makeFilePath = shared.joinPath(buildPath, "Makefile");

    /* NOTE!: Security Gate: Allow only following path's */
    qmakeValidation = shared.resolveTool("qmake", "qmake", [
        "/opt/homebrew/bin/qmake",
        "/usr/local/bin/qmake",
        "/usr/bin/qmake"
    ]);
    makeValidation = shared.resolveTool("make", "make", ["/usr/bin/make"]);
    if (!qmakeValidation.ok || !makeValidation.ok) {
        return shared.setErrorResult(
            !qmakeValidation.ok ? qmakeValidation.message : makeValidation.message,
            { operation: "qmakeBuild", path: projectDir }
        );
    }

    qmakeArgs = [
        "-o", makeFilePath,
        projectFilePath,
        buildType === "Release" ? "CONFIG+=release" : "CONFIG+=debug"
    ].concat(qmakeArgsValidation.value);
    qmakeRun = shared.executeProcess(qmakeValidation.value, qmakeArgs);
    shared.appendProcessRun(output, "QMake", qmakeRun);
    if (!qmakeRun.success) {
        return shared.setProcessResult(false, "", "QMake configuration failed.", {
            operation: "qmakeBuild",
            path: projectDir,
            projectFile: projectFile,
            buildType: buildType,
            executable: qmakeValidation.value
        }, output.stdout, output.stderr);
    }

    makeArgs = ["-C", buildPath, "-j8"].concat(makeArgsValidation.value);
    makeRun = shared.executeProcess(makeValidation.value, makeArgs);
    shared.appendProcessRun(output, "Make", makeRun);

    return shared.setProcessResult(
        makeRun.success,
        "QMake build succeeded.",
        "QMake build failed.",
        {
            operation: "qmakeBuild",
            path: projectDir,
            projectFile: projectFile,
            buildType: buildType,
            qmakeExecutable: qmakeValidation.value,
            makeExecutable: makeValidation.value
        },
        output.stdout,
        output.stderr
    );
}

module.exports = { qmakeBuild };
