// ===================================================================
//  ToolLogging.h
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#pragma once
#include "CustomToolExports.h"

typedef enum {
    TOOL_LOG_DEBUG,
    TOOL_LOG_INFO,
    TOOL_LOG_WARN,
    TOOL_LOG_ERROR
} ToolLogLevel;

typedef struct {
    ToolLogLevel level;
    const char *category;
    const char *message;
    const char *jsonContext;
} ToolLogRecord;

TOOL_API void toolLog(const ToolLogRecord *record);
