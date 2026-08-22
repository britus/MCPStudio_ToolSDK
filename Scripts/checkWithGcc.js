// ===================================================================
// Handler Function: checkWithGcc
// Direct process-based GCC toolchain and capability inspection.
// ===================================================================

const shared = require('sharedFunctions');

function filterOutput(run, pattern, fallback) {
    var lines;
    if (!run || !Array.isArray(run.stdout)) {
        return run;
    }
    lines = run.stdout.filter(function (line) { return pattern.test(line); });
    run.stdout = lines.length > 0 ? lines : [fallback];
    return run;
}

function appendFlagProbe(output, executable, label, language, flag) {
    var run = shared.executeProcess(executable, [
        flag,
        "-fsyntax-only",
        "-x", language,
        "/dev/null"
    ]);
    run.stdout.unshift(flag + (run.success ? " supported" : " not available"));
    shared.appendProcessRun(output, label, run);
}

function checkWithGcc(params) {
    params = params || {};

    var arch = params.arch || "";
    var compilerPath = params.compilerPath || "";
    var verbose = params.verbose === true;
    var pathValidation;
    var gccRequest = "gcc";
    var gxxRequest = "g++";
    var arRequest = "ar";
    var gccValidation;
    var gxxValidation;
    var arValidation;
    var output = shared.createProcessOutput();
    var versionRun;
    var run;

    if (typeof arch !== "string" || /[\0\r\n]/.test(arch)) {
        return shared.setErrorResult("arch must be a single-line string", {
            operation: "checkWithGcc"
        });
    }
    if (compilerPath) {
        pathValidation = shared.validateDirectoryPath(
            compilerPath,
            "compilerPath",
            { absolute: true }
        );
        if (!pathValidation.ok) {
            return shared.setErrorResult(pathValidation.message, { operation: "checkWithGcc" });
        }
        compilerPath = pathValidation.value;
        if (!MCPStudio.fileExists(compilerPath)) {
            return shared.setErrorResult("Compiler path not found: " + compilerPath, {
                operation: "checkWithGcc",
                path: compilerPath
            });
        }
        gccRequest = shared.joinPath(compilerPath, "gcc");
        gxxRequest = shared.joinPath(compilerPath, "g++");
        arRequest = shared.joinPath(compilerPath, "ar");
    }

    /* NOTE!: Security Gate: Allow only following path's */
    gccValidation = shared.resolveTool(gccRequest, "gcc", ["/usr/bin/gcc"]);
    if (!gccValidation.ok) {
        return shared.setErrorResult(gccValidation.message, {
            operation: "checkWithGcc",
            path: compilerPath || "PATH"
        });
    }
    gxxValidation = shared.resolveTool(gxxRequest, "g++", ["/usr/bin/g++"]);
    arValidation = shared.resolveTool(arRequest, "ar", ["/usr/bin/ar"]);

    output.stdout.push("=== Compiler Location ===", gccValidation.value);
    versionRun = shared.executeProcess(gccValidation.value, ["--version"]);
    shared.appendProcessRun(output, "GCC Version Information", versionRun);
    if (!versionRun.success) {
        return shared.setProcessResult(false, "", "GCC detection failed.", {
            path: compilerPath || gccValidation.value,
            arch: arch,
            operation: "checkWithGcc"
        }, output.stdout, output.stderr);
    }

    if (gxxValidation.ok) {
        run = shared.executeProcess(gxxValidation.value, ["--version"]);
        shared.appendProcessRun(output, "G++ Version Information", run);
    } else {
        output.stdout.push("=== G++ Version Information ===", gxxValidation.message);
    }
    if (arValidation.ok) {
        run = shared.executeProcess(arValidation.value, ["--version"]);
        shared.appendProcessRun(output, "Archive Utility", run);
    } else {
        output.stdout.push("=== Archive Utility ===", arValidation.message);
    }

    run = shared.executeProcess(gccValidation.value, ["-dM", "-E", "-x", "c", "/dev/null"]);
    filterOutput(run, /_GNU_SOURCE|__STDC_VERSION__/i, "C language macros not detected");
    shared.appendProcessRun(output, "C Compiler Language Detection", run);

    if (gxxValidation.ok) {
        run = shared.executeProcess(gxxValidation.value, ["-dM", "-E", "-x", "c++", "/dev/null"]);
        filterOutput(run, /_GLIBCXX|__cplusplus/i, "C++ language macros not detected");
        shared.appendProcessRun(output, "C++ Compiler Language Detection", run);
    }

    if (arch.length > 0) {
        run = shared.executeProcess(gccValidation.value, ["-print-multi-lib"]);
        shared.appendProcessRun(output, "Cross-Compilation Support for " + arch, run);
    }
    run = shared.executeProcess(gccValidation.value, ["-dumpmachine"]);
    shared.appendProcessRun(output, "Target Architecture", run);
    run = shared.executeProcess(gccValidation.value, ["-print-file-name=include"]);
    shared.appendProcessRun(output, "Include Path", run);
    run = shared.executeProcess(gccValidation.value, ["-print-search-dirs"]);
    shared.appendProcessRun(output, "Library Search Paths", run);
    run = shared.executeProcess(gccValidation.value, ["-Wl,--version"]);
    if (run.stdout.length > 5) {
        run.stdout = run.stdout.slice(0, 5);
    }
    shared.appendProcessRun(output, "Linker Information", run);

    appendFlagProbe(output, gccValidation.value, "LTO Support", "c", "-flto");
    appendFlagProbe(output, gccValidation.value, "PIE Support", "c", "-fPIE");
    appendFlagProbe(output, gccValidation.value, "Stack Protector", "c", "-fstack-protector-strong");
    appendFlagProbe(output, gccValidation.value, "ASLR Compatibility", "c", "-fstack-protector-all");

    run = shared.executeProcess(gccValidation.value, ["-dumpversion"]);
    shared.appendProcessRun(output, "Compiler Version", run);
    run = shared.executeProcess(gccValidation.value, ["--target-help"]);
    if (run.stdout.length > 20) {
        run.stdout = run.stdout.slice(0, 20);
    }
    shared.appendProcessRun(output, "Native Target Options", run);

    output.stdout.push("=== GCC Detection Summary ===");
    output.stdout.push("Compiler: " + gccValidation.value);
    output.stdout.push("Version: " + (versionRun.stdout[0] || "unknown"));
    output.stdout.push("C++ Compiler: " + (gxxValidation.ok ? gxxValidation.value : "not found"));
    if (verbose) {
        output.stdout.push("Execution mode: direct MCPStudio.process argument arrays");
    }

    return shared.setProcessResult(
        true,
        "GCC detection completed successfully.",
        "GCC detection failed.",
        {
            path: compilerPath || gccValidation.value,
            arch: arch,
            gccExecutable: gccValidation.value,
            gxxExecutable: gxxValidation.ok ? gxxValidation.value : "",
            verbose: verbose,
            operation: "checkWithGcc"
        },
        output.stdout,
        output.stderr
    );
}

module.exports = {
    checkWithGcc
};
