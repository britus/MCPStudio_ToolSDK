// ===================================================================
// Tool entry main script - FIXED VERSION
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Toolchain
const httpTools = require('httpTools');
const checkWithXcode = require('checkWithXcode');
const clangTools = require('clangTools');
const shellCall = require('shellCall');
const skillExecute = require('skill_execute');
const cmakeBuild = require('cmakeBuild');
const qmakeBuild = require('qmakeBuild');
const checkWithGcc = require('checkWithGcc');
const gccSettings = require('gccSettings');
const getGccInfo = require('getGccInfo');

// File system operation handlers
const fsTools = require('fsTools');

const HANDLERS = {
    // File based Toolchain
    analyzeDirectory: fsTools.analyzeDirectory,
    mkdir: fsTools.mkdir,
    checkWithXcode: checkWithXcode.checkWithXcode,
    clangCheckSyntax: clangTools.clangCheckSyntax,
    clangCompile: clangTools.clangCompile,
    clangMake: clangTools.clangMake,
    shellCall: shellCall.shellCall,
    skillExecute: skillExecute.skillExecute,
    cmakeBuild: cmakeBuild.cmakeBuild,
    qmakeBuild: qmakeBuild.qmakeBuild,
    checkWithGcc: checkWithGcc.checkWithGcc,
    gccSettings: gccSettings.gccSettings,
    getGccInfo: getGccInfo.getGccInfo,
    fileExists: fsTools.fileExists,
    readFile: fsTools.readFile,
    saveFile: fsTools.saveFile,
    writeFile: fsTools.saveFile,
    openFile: fsTools.openFile,
    deleteFile: fsTools.deleteFile,
    listDirectory: fsTools.listDirectory,
    createDirectory: fsTools.createDirectory,
    getDocumentsPath: fsTools.getDocumentsPath,
    getTempPath: fsTools.getTempPath,

    // HTTP Toolchain
    fetchData: function (params) { return httpTools.httpTools("fetchData", params); },
    postData: function (params) { return httpTools.httpTools("postData", params); },
    fetchJSON: function (params) { return httpTools.httpTools("fetchJSON", params); },
    downloadFile: function (params) { return httpTools.httpTools("downloadFile", params); },
    scrapeWebpage: function (params) { return httpTools.httpTools("scrapeWebpage", params); },
    apiRequest: function (params) { return httpTools.httpTools("apiRequest", params); },
    checkStatus: function (params) { return httpTools.httpTools("checkStatus", params); },
    webhookCall: function (params) { return httpTools.httpTools("webhookCall", params); }
};

function getHandler(handlerName) {
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, handlerName)) {
        return null;
    }

    return HANDLERS[handlerName];
}

function parseParams(jsonParams) {
    if (!jsonParams) {
        throw new Error("Missing jsonParams parameter");
    }

    try {
        var params = JSON.parse(jsonParams);

        if (!params || typeof params !== "object" || Array.isArray(params)) {
            throw new Error("Tool parameters must be a JSON object");
        }

        return params;
    } catch (e) {
        if (e && e.message === "Tool parameters must be a JSON object") {
            throw e;
        }
        throw new Error("Invalid JSON: " + (e.message || e));
    }
}

/**
 * Entry point for all MCP script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[toolEntry]: handler=" + (handlerName || "Unknown"));
    try {
        var handler = getHandler(handlerName);

        if (!handler) {
            return shared.error("Unknown handler: " + handlerName + ".");
        }

        var params = parseParams(jsonParams);
        return handler(params);

    } catch(e) {
        console.error("[toolEntry] " + (e.message || e));
        return shared.error(e.message || e.toString());
    }
}

module.exports = { toolEntry };
