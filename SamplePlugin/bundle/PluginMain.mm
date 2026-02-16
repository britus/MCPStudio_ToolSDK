// ===================================================================
//  PluginMain.mm
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================

#ifdef TOOL_BUNDLE

#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <stdio.h>
#include <stddef.h>
#include <string.h>

#include "CustomToolExports.h"
#include "ToolABI.h"

#import "ToolJSONBridge.h"
#import "ToolEntryHandler.h"

// MARK: Custom Tool Entry Point

#ifdef __cplusplus
extern "C" {
#endif

//clang: __attribute__((visibility("default")))
TOOL_API void toolEntry(const char* sid,            // AI client session ID
                        const char* toolName,       // Tooling name
                        const char* params,         // Tooling parameters
                        char** resultJson,          // Generated result as JSON
                        size_t* resultSize)         // Size of generated result
{
    if (!sid || !toolName || !params || !resultJson || !resultSize) {
        fprintf(stderr, "[SamplePlugin] Invalid parameters, abort!\n");
        return;
    }
    
    fprintf(stdout,
        "[SamplePlugin] Enter toolEntry function\nsid: %s\ntoolName: %s\nparams: %s",
        sid, toolName, params);
    
    // Initialize ToolEntryHandler
    ToolEntryHandler* manager = [[ToolEntryHandler alloc] init];
    
    // Execute tool using ToolEntryManager
    NSError* error = NULL;
    NSString* nssid = [NSString stringWithUTF8String:sid];
    NSString* nstoolName = [NSString stringWithUTF8String:toolName];
    NSString* nsparams = [NSString stringWithUTF8String:params];
    NSDictionary* result = [manager handleToolEntryWithSID:nssid toolName:nstoolName params:nsparams error:&error];
    
    if (result) {
        // Convert NSString to const char*
        NSString* resultstr = [ToolJSONBridge jsonStringFromDictionary:result error:&error];
        const char* cResult = [resultstr UTF8String];
        
        // Set result size and allocate memory for resultJson
        (*resultSize) = strlen(cResult) + 1;
        (*resultJson) = (char*) malloc(*resultSize);
        
        // Copy result to resultJson
        strncpy((*resultJson), cResult, (*resultSize));
    }

    // Clean up not need ARC
    //[manager release];
}

#ifdef __cplusplus
}
#endif

#endif /* TOOL_BUNDLE */

