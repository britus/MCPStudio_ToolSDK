// ===================================================================
//  ToolABI.h
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Lab on 2026.
//  Copyright © 2026 EoF Software Lab. All rights reserved.
// ===================================================================
#pragma once
#include <stdint.h>
#include <stddef.h>

#include "CustomToolExports.h"

#define TOOL_ABI_VERSION 3
#define TOOL_ABI_VERSION_LATEST 4
#define TOOL_ABI_MIN_SUPPORTED_VERSION 3
#define TOOL_HOST_SERVICES_VERSION 1

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

// Host-owned process services available only to explicitly negotiated ABI 4
// plugins. JSON buffers returned by the host are allocated with malloc and
// must be released by the plugin with free().
typedef struct {
    uint32_t structSize;
    uint32_t version;
    void* context;
    int32_t (*executeProcess)(void* context,
                              const char* requestJson,
                              char** responseJson,
                              size_t* responseSize);
    int32_t (*cancelProcess)(void* context,
                             const char* requestID,
                             char** responseJson,
                             size_t* responseSize);
} ToolHostServicesV1;

typedef void (*ToolSetHostServicesFunc)(const ToolHostServicesV1* services);

TOOL_API const ToolPluginDescriptor *toolDescribe(void);

// ABI 4 plugins export this symbol and copy the supplied service table.
TOOL_API void toolSetHostServices(const ToolHostServicesV1* services);

TOOL_API void toolEntry(const char* sid,            // AI client session ID
                        const char* toolName,       // Tooling name
                        const char* params,         // Tooling parameters
                        char** resultJson,          // malloc-allocated JSON; caller must free()
                        size_t* resultSize);        // Buffer size including the trailing NUL
