// ===================================================================
// Data Processing Pipeline Script
// Demonstrates advanced file processing, JSON manipulation
// ===================================================================

/**
 * Entry point for all script tool calls
 * @param {string} sid - Session identifier
 * @param {string} handlerName - Method/handler name to execute
 * @param {string} jsonParams - JSON string with parameters
 * @returns {string} JSON result or plain text
 */
function toolEntry(sid, handlerName, jsonParams) {
    console.log("[Script] Data Pipeline - Handler: " + handlerName);
    
    try {
        var params = JSON.parse(jsonParams);
        
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

function processPipeline(params) {
    console.log("[Script] === Starting Data Processing Pipeline ===");
    
    var inputDir = params.inputDir || Swift.getDocumentsPath() + "/input";
    var outputDir = params.outputDir || Swift.getDocumentsPath() + "/output";
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

function extractStage(inputDir, outputDir) {
    console.log("[Script] Extracting from: " + inputDir);
    
    if (!Swift.fileExists(inputDir)) {
        return { error: "Input directory not found: " + inputDir };
    }
    
    ensureDirectory(outputDir);
    
    var files = Swift.listDirectory(inputDir);
    var extracted = [];
    
    files.forEach(function(filename) {
        var inputPath = inputDir + "/" + filename;
        
        if (Swift.fileExists(inputPath)) {
            var content = Swift.readFile(inputPath);
            
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
                Swift.saveFile(outputPath, JSON.stringify(data, null, 2));
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

function transformStage(inputDir, outputDir, rules) {
    console.log("[Script] Transforming data from: " + inputDir);
    
    if (!Swift.fileExists(inputDir)) {
        return { error: "Input directory not found" };
    }
    
    ensureDirectory(outputDir);
    
    var files = Swift.listDirectory(inputDir);
    var transformed = [];
    
    files.forEach(function(filename) {
        if (filename.endsWith('.json')) {
            var inputPath = inputDir + "/" + filename;
            var content = Swift.readFile(inputPath);
            
            if (content) {
                try {
                    var data = JSON.parse(content);
                    
                    // Apply transformation rules
                    var result = applyTransformRules(data, rules);
                    
                    // Save transformed data
                    var outputPath = outputDir + "/" + 
                        filename.replace('.extracted.json', '.transformed.json');
                    Swift.saveFile(outputPath, JSON.stringify(result, null, 2));
                    
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

function aggregateStage(inputDir, outputPath) {
    console.log("[Script] Aggregating data from: " + inputDir);
    
    if (!Swift.fileExists(inputDir)) {
        return { error: "Input directory not found" };
    }
    
    var files = Swift.listDirectory(inputDir);
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
            var content = Swift.readFile(filePath);
            
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
    Swift.saveFile(outputPath, JSON.stringify(aggregated, null, 2));
    
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

function extractData(params) {
    var inputPath = params.inputPath;
    var outputPath = params.outputPath;
    
    if (!inputPath || !Swift.fileExists(inputPath)) {
        return error("Input file not found: " + inputPath);
    }
    
    var content = Swift.readFile(inputPath);
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
        Swift.saveFile(outputPath, JSON.stringify(extracted, null, 2));
    }
    
    return success(extracted, { operation: "extractData" });
}

function transformData(params) {
    var inputPath = params.inputPath;
    var outputPath = params.outputPath;
    var rules = params.rules || {};
    
    var content = Swift.readFile(inputPath);
    if (!content) {
        return error("Failed to read input file");
    }
    
    try {
        var data = JSON.parse(content);
        var transformed = applyTransformRules(data, rules);
        
        if (outputPath) {
            Swift.saveFile(outputPath, JSON.stringify(transformed, null, 2));
        }
        
        return success(transformed, { operation: "transformData" });
    } catch(e) {
        return error("Transform failed: " + e.toString());
    }
}

function aggregateData(params) {
    var inputPaths = params.inputPaths || [];
    var outputPath = params.outputPath;
    
    var aggregated = {
        sources: inputPaths.length,
        data: [],
        aggregatedAt: new Date().toISOString()
    };
    
    inputPaths.forEach(function(path) {
        var content = Swift.readFile(path);
        if (content) {
            try {
                aggregated.data.push(JSON.parse(content));
            } catch(e) {
                console.warn("Failed to parse: " + path);
            }
        }
    });
    
    if (outputPath) {
        Swift.saveFile(outputPath, JSON.stringify(aggregated, null, 2));
    }
    
    return success(aggregated, { operation: "aggregateData" });
}

function generateReport(params) {
    var dataPath = params.dataPath;
    var reportPath = params.reportPath;
    var format = params.format || "text";
    
    var content = Swift.readFile(dataPath);
    if (!content) {
        return error("Failed to read data file");
    }
    
    try {
        var data = JSON.parse(content);
        var report = createReport(data, format);
        
        Swift.saveFile(reportPath, report);
        
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

function countWords(text) {
    return text.split(/\s+/).filter(function(w) {
        return w.length > 0;
    }).length;
}

function ensureDirectory(path) {
    if (!Swift.fileExists(path)) {
        Swift.createDirectory(path);
    }
}

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
    
    Swift.saveFile(reportPath, report);
    
    return report;
}

function success(data, metadata) {
    return JSON.stringify({
        text: JSON.stringify(data, null, 2),
        metadata: metadata || {}
    });
}

function error(message) {
    return JSON.stringify({
        error: message
    });
}

console.log("[Script] Data Processing Pipeline script loaded");
