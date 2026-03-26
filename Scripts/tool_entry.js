// ===================================================================
// Data Processing Pipeline Script
// Demonstrates advanced file processing, JSON manipulation
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

// Import toolchain
const testPipeline = require('testPipeline');
const testPaths = require('testPaths');
const testLogging = require('testLogging');
const testFileOps = require('testFileOps');
const testHttpAll = require('testHttpAll');

// Toolchain
const mkdir = require('mkdir');
const analyzedir = require('analyzeDirectory');
const httpTools = require('httpTools');
const fetchPrompt = require('fetchPrompt');
const fetchResource = require('fetchResource');
const checkWithXcode = require('checkWithXcode');
const clangTools = require('clangTools');

/** 
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[toolEntry]: sid=" + sid + " handler=" + handlerName);
    console.log("[toolEntry]: ctx=" + JSON.stringify(this));
    
    try {
        var params = JSON.parse(jsonParams);
        
        switch(handlerName) {
        	// -- Tests...
            case "testLogging":
                return testLogging.testLogging(params);
            case "testFileOps":
                return testFileOps.testFileOps(params);
            case "testPaths":
                return testPaths.testPaths(params);
            case "testHttpAll":
                return testHttpAll.testHttpAll(params);
            case "processPipeline":
                return testPipeline.testPipeline("processPipeline", params);
            case "extractData":
            	params.inputPath = "test_file.txt";
            	Swift.saveFile(params.inputPath, "Test content");
                return testPipeline.testPipeline("extractData", params);
            case "transformData":
            	params.inputPath = "test_file.txt";
            	Swift.saveFile(params.inputPath, "Test content");
                return testPipeline.testPipeline("transformData", params);
            case "aggregateData":
                return testPipeline.testPipeline("aggregateData", params);
            case "generateReport":
            	params.dataPath = "test_data_file.txt";
            	params.reportPath = "test_report_file.txt";
            	Swift.saveFile(params.dataPath, "{}");
                return testPipeline.testPipeline("generateReport", params);
                
			// --
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
                
            default:
                return shared.error("Unknown handler: " + handlerName);
        }
        
    } catch(e) {
    	console.log("[toolEntry] " + e);
        return shared.error(e.toString());
    }
}

console.log("Tool handler script loaded");