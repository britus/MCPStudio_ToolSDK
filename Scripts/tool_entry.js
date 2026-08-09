// ===================================================================
// Tool entry main script - FIXED VERSION
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Toolchain
const analyzedir = require('analyzeDirectory');
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

// File operation handlers
const mkdir = require('mkdir');
const fileExists = require('fileExists');
const readFile = require('fileRead');
const saveFile = require('fileSave');
const openFile = require('fileOpen');
const deleteFile = require('fileDelete');
const listDirectory = require('directoryList');
const createDirectory = require('directoryCreate');
const getDocumentsPath = require('getPathDocuments');
const getTempPath = require('getPathTemp');

const HANDLERS = {
    // File based Toolchain
    analyzeDirectory: analyzedir.analyzeDirectory,
    mkdir: mkdir.mkdir,
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
    fileExists: fileExists.fileExists,
    readFile: readFile.readFile,
    saveFile: saveFile.saveFile,
    writeFile: saveFile.saveFile,
    openFile: openFile.openFile,
    deleteFile: deleteFile.deleteFile,
    listDirectory: listDirectory.listDirectory,
    createDirectory: createDirectory.createDirectory,
    getDocumentsPath: getDocumentsPath.getDocumentsPath,
    getTempPath: getTempPath.getTempPath,

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
