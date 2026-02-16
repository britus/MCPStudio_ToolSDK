// ===================================================================
//  ToolABI.h
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#pragma once
#include <stdint.h>
#include <stddef.h>

#include "CustomToolExports.h"

#define TOOL_ABI_VERSION 3

// Tool descriptor structure
typedef struct {
    uint32_t abiVersion;
    uint32_t toolVersion;
    const char* name;
    const char* version;
    const char* author;
    const char* description;
    const char* toolEntryPoint;
    const char* toolIdentifier;
    const char* capabilitiesJSON;
} ToolPluginDescriptor;

TOOL_API const ToolPluginDescriptor *toolDescribe(void);

TOOL_API void toolEntry(const char* sid,            // AI client session ID
                        const char* toolName,       // Tooling name
                        const char* params,         // Tooling parameters
                        char** resultJson,          // Generated result as JSON
                        size_t* resultSize);        // Size of generated result (caller freeing)
