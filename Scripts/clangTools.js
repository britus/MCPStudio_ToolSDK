// ===================================================================
// Handler Function: clangTools
// Direct process-based Clang and Make helpers.
// ===================================================================

const shared = require('sharedFunctions');

function resolveTool(name, operation) {
    /* NOTE!: Security Gate: Allow only following path's */
    var resolved = shared.resolveDeveloperTool(name, name, ["/usr/bin/" + name]);
    if (!resolved.ok) {
        shared.setErrorResult(resolved.message, { operation: operation });
        return null;
    }
    return resolved.value;
}

function directoryName(path) {
    var index = path.lastIndexOf("/");
    return index >= 0 ? (path.substring(0, index) || "/") : ".";
}

function baseName(path) {
    return path.substring(path.lastIndexOf("/") + 1);
}

function clangCheckSyntax(params) {
    params = params || {};
    var validation = shared.validateFilePath(params.sourceFile || "", "sourceFile");
    var sourceFile;
    var executable;
    var run;

    if (!validation.ok) {
        return shared.setErrorResult(validation.message, { operation: "clangCheckSyntax" });
    }
    sourceFile = validation.value;
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.setErrorResult("File not found: " + sourceFile, {
            operation: "clangCheckSyntax",
            fileName: sourceFile
        });
    }

    executable = resolveTool("clang", "clangCheckSyntax");
    if (!executable) {
        return null;
    }
    run = shared.executeProcess(executable, ["-fsyntax-only", sourceFile]);

    return shared.setProcessResult(
        run.success,
        "Syntax check succeeded.",
        "Syntax check failed.",
        {
            fileName: sourceFile,
            executable: executable,
            operation: "clangCheckSyntax"
        },
        run.stdout,
        run.stderr
    );
}

function clangCompile(params) {
    params = params || {};
    var validation = shared.validateFilePath(params.sourceFile || "", "sourceFile");
    var sourceFile;
    var fileName;
    var extensionIndex;
    var outputName;
    var outputFile;
    var executable;
    var run;

    if (!validation.ok) {
        return shared.setErrorResult(validation.message, { operation: "clangCompile" });
    }
    sourceFile = validation.value;
    if (!MCPStudio.fileExists(sourceFile)) {
        return shared.setErrorResult("File not found: " + sourceFile, {
            operation: "clangCompile",
            fileName: sourceFile
        });
    }

    fileName = baseName(sourceFile);
    extensionIndex = fileName.lastIndexOf(".");
    outputName = (extensionIndex > 0 ? fileName.substring(0, extensionIndex) : fileName) + ".o";
    outputFile = shared.joinPath(directoryName(sourceFile), outputName);
    executable = resolveTool("clang", "clangCompile");
    if (!executable) {
        return null;
    }
    run = shared.executeProcess(executable, ["-c", sourceFile, "-o", outputFile]);

    return shared.setProcessResult(
        run.success,
        "Compilation succeeded.",
        "Compilation failed.",
        {
            fileName: sourceFile,
            outputFile: outputFile,
            executable: executable,
            operation: "clangCompile"
        },
        run.stdout,
        run.stderr
    );
}

function clangMake(params) {
    params = params || {};
    var validation = shared.validateFilePath(params.makeFile || "", "makeFile");
    var makeFile;
    var executable;
    var run;

    if (!validation.ok) {
        return shared.setErrorResult(validation.message, { operation: "clangMake" });
    }
    makeFile = validation.value;
    if (!MCPStudio.fileExists(makeFile)) {
        return shared.setErrorResult("File not found: " + makeFile, {
            operation: "clangMake",
            fileName: makeFile
        });
    }

    executable = resolveTool("make", "clangMake");
    if (!executable) {
        return null;
    }
    run = shared.executeProcess(executable, [
        "-C", directoryName(makeFile),
        "-j8",
        "-f", baseName(makeFile)
    ]);

    return shared.setProcessResult(
        run.success,
        "Build succeeded.",
        "Build failed.",
        {
            fileName: makeFile,
            executable: executable,
            operation: "clangMake"
        },
        run.stdout,
        run.stderr
    );
}

module.exports = {
    clangCheckSyntax,
    clangCompile,
    clangMake,
};
