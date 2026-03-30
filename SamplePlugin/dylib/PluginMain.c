// ===================================================================
//  PluginMain.c
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================

#ifdef TOOL_DYLIB

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stddef.h>

#include "CustomToolExports.h"
#include "ToolABI.h"

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
    
    const char* JSON_RESULT = "{\n"
        "\"structuredContent\" : {\n"
            "\"data\": \"Hello world from custom tool plugin!\",\n"
            "\"success\": true,\n"
            "\"error\": \"\"\n"
        "},\n"
        "\"content\": [{\n"
            "\"type\": \"text\",\n"
            "\"text\": \"Hello world from custom tool plugin!\"\n"
        "}]\n"
    "}\n";

    (*resultSize) = strlen(JSON_RESULT) + 1;
    (*resultJson) = (char*) malloc(*resultSize);
    
    strncpy((*resultJson), JSON_RESULT, (*resultSize));
}

#endif /* TOOL_DYLIB */
