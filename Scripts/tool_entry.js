// ===================================================================
// Tool entry main script - FIXED VERSION
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Toolchain
const analyzedir = require('analyzeDirectory');
const httpTools = require('httpTools');
const fetchPrompt = require('fetchPrompt');
const fetchResource = require('fetchResource');
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
    analyzeDirectory: (params) => analyzedir.analyzeDirectory(params),
    mkdir: (params) => mkdir.mkdir(params),
    checkWithXcode: (params) => checkWithXcode.checkWithXcode(params),
    clangCheckSyntax: (params) => clangTools.clangCheckSyntax(params),
    clangCompile: (params) => clangTools.clangCompile(params),
    clangMake: (params) => clangTools.clangMake(params),
    shellCall: (params) => shellCall.shellCall(params),
    skillExecute: (params) => skillExecute.skillExecute(params),
    cmakeBuild: (params) => cmakeBuild.cmakeBuild(params),
    qmakeBuild: (params) => qmakeBuild.qmakeBuild(params),
    checkWithGcc: (params) => checkWithGcc.checkWithGcc(params),
    gccSettings: (params) => gccSettings.gccSettings(params),
    getGccInfo: (params) => getGccInfo.getGccInfo(params),
    fileExists: (params) => fileExists.fileExists(params),
    readFile: (params) => readFile.readFile(params),
    saveFile: (params) => saveFile.saveFile(params),
    writeFile: (params) => saveFile.saveFile(params),
    openFile: (params) => openFile.openFile(params),
    deleteFile: (params) => deleteFile.deleteFile(params),
    listDirectory: (params) => listDirectory.listDirectory(params),
    createDirectory: (params) => createDirectory.createDirectory(params),
    getDocumentsPath: (params) => getDocumentsPath.getDocumentsPath(params),
    getTempPath: (params) => getTempPath.getTempPath(params),

    // Retrieve MCP Prompt, Resource for processing
    fetchPrompt: (params) => fetchPrompt.fetchPrompt(params),
    fetchResource: (params) => fetchResource.fetchResource(params),

    // HTTP Toolchain
    fetchData: (params) => httpTools.httpTools("fetchData", params),
    postData: (params) => httpTools.httpTools("postData", params),
    fetchJSON: (params) => httpTools.httpTools("fetchJSON", params),
    downloadFile: (params) => httpTools.httpTools("downloadFile", params),
    scrapeWebpage: (params) => httpTools.httpTools("scrapeWebpage", params),
    apiRequest: (params) => httpTools.httpTools("apiRequest", params),
    checkStatus: (params) => httpTools.httpTools("checkStatus", params),
    webhookCall: (params) => httpTools.httpTools("webhookCall", params)
};

const VALID_HANDLERS = Object.keys(HANDLERS);

function getHandler(handlerName) {
    if (!VALID_HANDLERS.includes(handlerName)) {
        return null;
    }

    return HANDLERS[handlerName];
}

function parseParams(jsonParams) {
    if (!jsonParams) {
        throw new Error("Missing jsonParams parameter");
    }

    try {
        return JSON.parse(jsonParams);
    } catch (e) {
        throw new Error(`Invalid JSON: ${e.message || e}`);
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
    console.log(`[toolEntry]: sid=${sid || 'sid.unknown'} handler=${handlerName || 'Unknown'}`);

    try {   
        const handler = getHandler(handlerName);

        if (!handler) {
            return shared.error(`Unknown handler: ${handlerName}.`);
        }

        const params = parseParams(jsonParams);
        return handler(params);
    
    } catch(e) {
        console.error(`[toolEntry] ${e.message || e}`);
        return shared.error(e.message || e.toString());
    }
}

module.exports = { toolEntry };
