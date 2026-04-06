// ===================================================================
// Data Processing Pipeline Script
// Demonstrates advanced file processing, JSON manipulation
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

/**
 * Entry point for all script tool calls
 * @param {string} handlerName - Method/handler name to execute (required)
 * @param {Object} params - Parameters object containing operation-specific parameters
 * @returns {string} JSON result or plain text
 */
function testPipeline(handlerName, params) {
    try {
        switch(handlerName) {
            case "processPipeline":
                return processPipeline(params);
            
            case "extractData":
                return extractData(params);
            
            case "transformData":
                return transformData(params);
            
            case "aggregateData":
                return aggregateData(params);
            
            case "generateReport":
                return generateReport(params);
            
            default:
                return error("Unknown handler: " + handlerName);
        }
        
    } catch(e) {
        console.error("[Script] Pipeline error: " + e.toString());
        return error(e.toString());
    }
}

// ===================================================================
// Main Pipeline Function
// ===================================================================

/**
 * Processes a complete data pipeline through multiple stages
 * @param {Object} params - Command parameters
 * @param {string} [params.inputDir] - Path to input directory (optional, defaults to documents/input)
 * @param {string} [params.outputDir] - Path to output directory (optional, defaults to documents/output)
 * @param {string} [params.reportPath] - Path for pipeline report (optional, defaults to output/pipeline_report.txt)
 * @param {Object} [params.transformRules] - Transformation rules for data processing stage (optional)
 * @returns {string} JSON result with pipeline execution summary or error message
 */
function processPipeline(params) {
    console.log("[Script] === Starting Data Processing Pipeline ===");
    
    var inputDir = params.inputDir || MCPStudio.getDocumentsPath() + "/input";
    var outputDir = params.outputDir || MCPStudio.getDocumentsPath() + "/output";
    var reportPath = params.reportPath || outputDir + "/pipeline_report.txt";
    
    // Ensure directories exist
    ensureDirectory(outputDir);
    
    var pipeline = {
        startTime: new Date().toISOString(),
        stages: [],
        errors: []
    };
    
    // Stage 1: Extract data from input files
    console.log("[Script] --- Stage 1: Extract Data ---");
    var extractResult = extractStage(inputDir, outputDir + "/extracted");
    pipeline.stages.push({
        stage: "extract",
        result: extractResult
    });
    
    if (extractResult.error) {
        return error("Extraction failed: " + extractResult.error);
    }
    
    // Stage 2: Transform extracted data
    console.log("[Script] --- Stage 2: Transform Data ---");
    var transformResult = transformStage(
        outputDir + "/extracted",
        outputDir + "/transformed",
        params.transformRules || {}
    );
    pipeline.stages.push({
        stage: "transform",
        result: transformResult
    });
    
    // Stage 3: Aggregate results
    console.log("[Script] --- Stage 3: Aggregate Data ---");
    var aggregateResult = aggregateStage(
        outputDir + "/transformed",
        outputDir + "/aggregated.json"
    );
    pipeline.stages.push({
        stage: "aggregate",
        result: aggregateResult
    });
    
    // Stage 4: Generate report
    console.log("[Script] --- Stage 4: Generate Report ---");
    pipeline.endTime = new Date().toISOString();
    
    var report = generatePipelineReport(pipeline, reportPath);
    
    console.log("[Script] === Pipeline Complete ===");
    console.log("[Script] Report saved to: " + reportPath);
    
    return success({
        message: "Pipeline completed successfully",
        reportPath: reportPath,
        stages: pipeline.stages.length,
        outputDir: outputDir
    }, { operation: "processPipeline" });
}

// ===================================================================
// Stage Functions
// ===================================================================

/**
 * Extracts and processes data from input files
 * @param {string} inputDir - Path to input directory (required)
 * @param {string} outputDir - Path to output directory for extracted files (required)
 * @returns {Object} Result object with extraction status or error message
 */
function extractStage(inputDir, outputDir) {
    console.log("[Script] Extracting from: " + inputDir);
    
    if (!MCPStudio.fileExists(inputDir)) {
        return { error: "Input directory not found: " + inputDir };
    }
    
    ensureDirectory(outputDir);
    
    var files = MCPStudio.listDirectory(inputDir);
    var extracted = [];
    
    files.forEach(function(filename) {
        var inputPath = inputDir + "/" + filename;
        
        if (MCPStudio.fileExists(inputPath)) {
            var content = MCPStudio.readFile(inputPath);
            
            if (content) {
                // Extract key data from file
                var data = {
                    filename: filename,
                    size: content.length,
                    lines: content.split('\n').length,
                    extractedAt: new Date().toISOString()
                };
                
                // Try to extract structured data if JSON
                if (filename.endsWith('.json')) {
                    try {
                        var jsonData = JSON.parse(content);
                        data.jsonData = jsonData;
                    } catch(e) {
                        data.parseError = e.toString();
                    }
                } else {
                    // For text files, extract basic stats
                    data.wordCount = countWords(content);
                    data.preview = content.substring(0, 100);
                }
                
                extracted.push(data);
                
                // Save extracted data
                var outputPath = outputDir + "/" + filename + ".extracted.json";
                MCPStudio.saveFile(outputPath, JSON.stringify(data, null, 2));
            }
        }
    });
    
    console.log("[Script] Extracted " + extracted.length + " files");
    
    return {
        filesProcessed: extracted.length,
        outputDir: outputDir,
        files: extracted.map(function(e) { return e.filename; })
    };
}

/**
 * Transforms data in input files based on transformation rules
 * @param {string} inputDir - Path to input directory (required)
 * @param {string} outputDir - Path to output directory for transformed files (required)
 * @param {Object} [rules] - Transformation rules to apply (optional)
 * @returns {Object} Result object with transformation status or error message
 */
function transformStage(inputDir, outputDir, rules) {
    console.log("[Script] Transforming data from: " + inputDir);
    
    if (!MCPStudio.fileExists(inputDir)) {
        return { error: "Input directory not found" };
    }
    
    ensureDirectory(outputDir);
    
    var files = MCPStudio.listDirectory(inputDir);
    var transformed = [];
    
    files.forEach(function(filename) {
        if (filename.endsWith('.json')) {
            var inputPath = inputDir + "/" + filename;
            var content = MCPStudio.readFile(inputPath);
            
            if (content) {
                try {
                    var data = JSON.parse(content);
                    
                    // Apply transformation rules
                    var result = applyTransformRules(data, rules);
                    
                    // Save transformed data
                    var outputPath = outputDir + "/" + 
                        filename.replace('.extracted.json', '.transformed.json');
                    MCPStudio.saveFile(outputPath, JSON.stringify(result, null, 2));
                    
                    transformed.push({
                        filename: filename,
                        status: "success"
                    });
                } catch(e) {
                    transformed.push({
                        filename: filename,
                        status: "error",
                        error: e.toString()
                    });
                }
            }
        }
    });
    
    console.log("[Script] Transformed " + transformed.length + " files");
    
    return {
        filesProcessed: transformed.length,
        outputDir: outputDir,
        results: transformed
    };
}

/**
 * Aggregates data from input files and computes statistics
 * @param {string} inputDir - Path to input directory (required)
 * @param {string} outputPath - Path for aggregated output file (required)
 * @returns {Object} Result object with aggregation status or error message
 */
function aggregateStage(inputDir, outputPath) {
    console.log("[Script] Aggregating data from: " + inputDir);
    
    if (!MCPStudio.fileExists(inputDir)) {
        return { error: "Input directory not found" };
    }
    
    var files = MCPStudio.listDirectory(inputDir);
    var aggregated = {
        generatedAt: new Date().toISOString(),
        totalFiles: 0,
        totalSize: 0,
        totalLines: 0,
        totalWords: 0,
        fileTypes: {},
        data: []
    };
    
    files.forEach(function(filename) {
        if (filename.endsWith('.json')) {
            var filePath = inputDir + "/" + filename;
            var content = MCPStudio.readFile(filePath);
            
            if (content) {
                try {
                    var data = JSON.parse(content);
                    
                    aggregated.totalFiles++;
                    aggregated.totalSize += (data.size || 0);
                    aggregated.totalLines += (data.lines || 0);
                    aggregated.totalWords += (data.wordCount || 0);
                    
                    // Track file types
                    var ext = data.filename ? 
                        data.filename.split('.').pop() : 'unknown';
                    aggregated.fileTypes[ext] = 
                        (aggregated.fileTypes[ext] || 0) + 1;
                    
                    aggregated.data.push(data);
                } catch(e) {
                    console.warn("Failed to parse: " + filename);
                }
            }
        }
    });
    
    // Calculate averages
    if (aggregated.totalFiles > 0) {
        aggregated.averageSize = Math.round(
            aggregated.totalSize / aggregated.totalFiles
        );
        aggregated.averageLines = Math.round(
            aggregated.totalLines / aggregated.totalFiles
        );
        aggregated.averageWords = Math.round(
            aggregated.totalWords / aggregated.totalFiles
        );
    }
    
    // Save aggregated data
    MCPStudio.saveFile(outputPath, JSON.stringify(aggregated, null, 2));
    
    console.log("[Script] Aggregated " + aggregated.totalFiles + " files");
    
    return {
        outputPath: outputPath,
        totalFiles: aggregated.totalFiles,
        totalSize: aggregated.totalSize
    };
}

// ===================================================================
// Individual Handler Functions
// ===================================================================

/**
 * Extracts data from a single input file
 * @param {Object} params - Command parameters
 * @param {string} params.inputPath - Path to input file (required)
 * @param {string} [params.outputPath] - Path for extracted output file (optional)
 * @returns {string} JSON result with extraction status or error message
 */
function extractData(params) {
    var inputPath = params.inputPath;
    var outputPath = params.outputPath;
    
    if (!inputPath || !MCPStudio.fileExists(inputPath)) {
        return error("Input file not found: " + inputPath);
    }
    
    var content = MCPStudio.readFile(inputPath);
    if (!content) {
        return error("Failed to read file");
    }
    
    var extracted = {
        filename: inputPath.split('/').pop(),
        size: content.length,
        lines: content.split('\n').length,
        wordCount: countWords(content),
        extractedAt: new Date().toISOString()
    };
    
    if (outputPath) {
        MCPStudio.saveFile(outputPath, JSON.stringify(extracted, null, 2));
    }
    
    return success(extracted, { operation: "extractData" });
}

/**
 * Transforms data from a single input file based on rules
 * @param {Object} params - Command parameters
 * @param {string} params.inputPath - Path to input file (required)
 * @param {string} [params.outputPath] - Path for transformed output file (optional)
 * @param {Object} [params.rules] - Transformation rules to apply (optional)
 * @returns {string} JSON result with transformation status or error message
 */
function transformData(params) {
    var inputPath = params.inputPath;
    var outputPath = params.outputPath;
    var rules = params.rules || {};
    
    var content = MCPStudio.readFile(inputPath);
    if (!content) {
        return error("Failed to read input file");
    }
    
    try {
        var data = JSON.parse(content);
        var transformed = applyTransformRules(data, rules);
        
        if (outputPath) {
            MCPStudio.saveFile(outputPath, JSON.stringify(transformed, null, 2));
        }
        
        return success(transformed, { operation: "transformData" });
    } catch(e) {
        return error("Transform failed: " + e.toString());
    }
}

/**
 * Aggregates data from multiple input files
 * @param {Object} params - Command parameters
 * @param {Array<string>} params.inputPaths - Array of input file paths (required)
 * @param {string} [params.outputPath] - Path for aggregated output file (optional)
 * @returns {string} JSON result with aggregation status or error message
 */
function aggregateData(params) {
    var inputPaths = params.inputPaths || [];
    var outputPath = params.outputPath;
    
    var aggregated = {
        sources: inputPaths.length,
        data: [],
        aggregatedAt: new Date().toISOString()
    };
    
    inputPaths.forEach(function(path) {
        var content = MCPStudio.readFile(path);
        if (content) {
            try {
                aggregated.data.push(JSON.parse(content));
            } catch(e) {
                console.warn("Failed to parse: " + path);
            }
        }
    });
    
    if (outputPath) {
        MCPStudio.saveFile(outputPath, JSON.stringify(aggregated, null, 2));
    }
    
    return success(aggregated, { operation: "aggregateData" });
}

/**
 * Generates a report from data in a file
 * @param {Object} params - Command parameters
 * @param {string} params.dataPath - Path to data file (required)
 * @param {string} params.reportPath - Path for generated report (required)
 * @param {string} [params.format='text'] - Report format (text or json) (optional, default text)
 * @returns {string} JSON result with report generation status or error message
 */
function generateReport(params) {
    var dataPath = params.dataPath;
    var reportPath = params.reportPath;
    var format = params.format || "text";
    
    var content = MCPStudio.readFile(dataPath);
    if (!content) {
        return error("Failed to read data file");
    }
    
    try {
        var data = JSON.parse(content);
        var report = createReport(data, format);
        
        MCPStudio.saveFile(reportPath, report);
        
        return success({
            reportPath: reportPath,
            format: format,
            size: report.length
        }, { operation: "generateReport" });
    } catch(e) {
        return error("Report generation failed: " + e.toString());
    }
}

// ===================================================================
// Utility Functions
// ===================================================================

/**
 * Applies transformation rules to data object
 * @param {Object} data - Source data object (required)
 * @param {Object} rules - Transformation rules to apply (optional)
 * @returns {Object} Transformed data object or original if no rules provided
 */
function applyTransformRules(data, rules) {
    var result = {};
    
    // If no rules, return data as-is
    if (Object.keys(rules).length === 0) {
        return data;
    }
    
    for (var key in rules) {
        var rule = rules[key];
        
        if (rule.source && data[rule.source] !== undefined) {
            var value = data[rule.source];
            
            // Apply transformation
            if (rule.transform) {
                switch(rule.transform) {
                    case "uppercase":
                        value = String(value).toUpperCase();
                        break;
                    case "lowercase":
                        value = String(value).toLowerCase();
                        break;
                    case "multiply":
                        value = Number(value) * (rule.factor || 1);
                        break;
                    case "round":
                        value = Math.round(Number(value));
                        break;
                }
            }
            
            result[key] = value;
        } else if (rule.default !== undefined) {
            result[key] = rule.default;
        }
    }
    
    return result;
}

/**
 * Counts the number of words in a text string
 * @param {string} text - Text to analyze (required)
 * @returns {number} Word count
 */
function countWords(text) {
    return text.split(/\s+/).filter(function(w) {
        return w.length > 0;
    }).length;
}

/**
 * Ensures that a directory exists, creating it if necessary
 * @param {string} path - The path to check or create (required)
 */
function ensureDirectory(path) {
    if (!MCPStudio.fileExists(path)) {
        MCPStudio.createDirectory(path);
    }
}

/**
 * Creates a text or JSON report from data object
 * @param {Object} data - Data to include in report (required)
 * @param {string} format - Report format: 'text' or 'json' (optional, default 'text')
 * @returns {string} Formatted report string
 */
function createReport(data, format) {
    if (format === "json") {
        return JSON.stringify(data, null, 2);
    }
    
    // Text format
    var report = "";
    report += "========================================\n";
    report += "Data Processing Report\n";
    report += "========================================\n";
    report += "Generated: " + new Date().toISOString() + "\n\n";
    
    for (var key in data) {
        if (typeof data[key] === 'object' && !Array.isArray(data[key])) {
            report += "\n" + key + ":\n";
            for (var subkey in data[key]) {
                report += "  " + subkey + ": " + data[key][subkey] + "\n";
            }
        } else {
            report += key + ": " + JSON.stringify(data[key]) + "\n";
        }
    }
    
    report += "\n========================================\n";
    
    return report;
}

/**
 * Generates a pipeline execution report and saves it to file
 * @param {Object} pipeline - Pipeline execution data with stages (required)
 * @param {string} reportPath - Path to save the report file (required)
 * @returns {string} Report content string
 */
function generatePipelineReport(pipeline, reportPath) {
    var report = "";
    report += "========================================\n";
    report += "Pipeline Execution Report\n";
    report += "========================================\n";
    report += "Start Time: " + pipeline.startTime + "\n";
    report += "End Time: " + pipeline.endTime + "\n";
    report += "Total Stages: " + pipeline.stages.length + "\n\n";
    
    pipeline.stages.forEach(function(stage, index) {
        report += "--- Stage " + (index + 1) + ": " + stage.stage + " ---\n";
        report += JSON.stringify(stage.result, null, 2) + "\n\n";
    });
    
    if (pipeline.errors.length > 0) {
        report += "--- Errors ---\n";
        pipeline.errors.forEach(function(err) {
            report += "- " + err + "\n";
        });
        report += "\n";
    }
    
    report += "========================================\n";
    
    MCPStudio.saveFile(reportPath, report);
    
    return report;
}

function success(data, metadata) {
    return shared.createSuccessResult(data, metadata);
}

function error(message) {
    return shared.createErrorResult(message);
}


module.exports = {
	testPipeline
};
