// ===================================================================
// Handler Function: testDownload
// ===================================================================

// Import shared functions
const shared = require('sharedFunctions');

function testDownload(params) {
    console.log("--- Testing File Download ---");
    
    // Use a small text file for testing
    var testUrl = params.downloadUrl || "https://httpbin.org/robots.txt";
    var tempPath = Swift.getTempPath();
    var destination = tempPath + "/http_test_download.txt";
    
    console.log("Downloading file from: " + testUrl);
    console.log("Destination: " + destination);
    
    try {
        // Clean up any existing file
        if (Swift.fileExists(destination)) {
            Swift.deleteFile(destination);
        }
        
        var success = Swift.downloadFile(testUrl, destination);
        
        if (!success) {
            return JSON.stringify({
                error: "Download failed",
                url: testUrl,
                destination: destination
            });
        }
        
        console.log("Download completed");
        
        // Verify file exists
        var exists = Swift.fileExists(destination);
        console.log("File exists: " + exists);
        
        if (!exists) {
            return JSON.stringify({
                error: "Downloaded file does not exist",
                destination: destination
            });
        }
        
        // Read file content
        var content = Swift.readFile(destination);
        var fileSize = content ? content.length : 0;
        
        console.log("File size: " + fileSize + " bytes");
        
        // Clean up
        Swift.deleteFile(destination);
        
        return JSON.stringify({
            text: JSON.stringify({
                passed: true,
                downloaded: success,
                fileExists: exists,
                fileSize: fileSize,
                contentPreview: content ? content.substring(0, 100) : ""
            }, null, 2),
            metadata: { test: "downloadFile" }
        });
    } catch(e) {
        return JSON.stringify({
            error: "Exception during download test: " + e.toString()
        });
    }
}

module.exports = {
	testDownload
};
