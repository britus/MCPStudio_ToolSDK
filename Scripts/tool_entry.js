// ===================================================================
// Data Processing Pipeline Script
// Demonstrates advanced file processing, JSON manipulation
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

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[toolEntry]: sid=" + (sid || "sid.unknwon")
            + " handler=" + (handlerName || "Unkown") );
    console.log("[toolEntry]: ctx=" + JSON.stringify(this));

    try {
        var params = JSON.parse(jsonParams);

        //PATCH-BEGIN: Handler injection
        //  injected testHandler name
        let testHandler = params.testHandler || "";
        if (testHandler != "") {
            console.log("[toolEntry]: Handler injection=" + testHandler);
            handlerName = testHandler;
         }
         //PATCH END

         switch(handlerName) {
            // Toolchain
            case "analyzeDirectory":
                return analyzedir.analyzeDirectory(params);
            case "mkdir":
                return mkdir.mkdir(params);
            case "checkWithXcode":
                return checkWithXcode.checkWithXcode(params);
            case "clangCheckSyntax":
                return clangTools.clangCheckSyntax(params);
            case "clangCompile":
                return clangTools.clangCompile(params);
            case "clangMake":
                return clangTools.clangMake(params);
            case "shellCall":
            	return shellCall.shellCall(params);

            // MCP Prompt, Resource
            case "fetchPrompt":
                return fetchPrompt.fetchPrompt(params);

            case "fetchResource":
                return fetchResource.fetchResource(params);

            // HTTP Toolchain
            case "fetchData":
                return httpTools.httpTools("fetchData", params);
            case "postData":
                return httpTools.httpTools("postData", params);
            case "fetchJSON":
                return httpTools.httpTools("fetchJSON", params);
            case "downloadFile":
                return httpTools.httpTools("downloadFile", params);
            case "scrapeWebpage":
                return httpTools.httpTools("scrapeWebpage", params);
            case "apiRequest":
                return httpTools.httpTools("apiRequest", params);
            case "checkStatus":
                return httpTools.httpTools("checkStatus", params);
            case "webhookCall":
                return httpTools.httpTools("webhookCall", params);

            // File operations
            case "fileExists":
                return fileExists.fileExists(params);
            case "readFile":
                return readFile.readFile(params);
            case "saveFile":
                return saveFile.saveFile(params);
            case "openFile":
                return openFile.openFile(params);
            case "deleteFile":
                return deleteFile.deleteFile(params);
            case "listDirectory":
                return listDirectory.listDirectory(params);
            case "createDirectory":
                return createDirectory.createDirectory(params);
            case "getDocumentsPath":
                return getDocumentsPath.getDocumentsPath(params);
            case "getTempPath":
                return getTempPath.getTempPath(params);
            case "logMessage":
                return logMessage.logMessage(params);
            case "setToolResult":
                return setToolResult.setToolResult(params);

            default:
                return shared.error("Unknown handler: " + handlerName);
        }

    } catch(e) {
        console.log("[toolEntry] " + e);
        return shared.error(e.toString());
    }
}

console.log("Tool handler script loaded");
