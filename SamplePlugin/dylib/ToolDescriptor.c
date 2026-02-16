// ===================================================================
//  ToolDescriptor.c
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#ifdef TOOL_DYLIB

#include "CustomToolExports.h"
#include "ToolABI.h"

static ToolPluginDescriptor desc = {
    .abiVersion       = TOOL_ABI_VERSION,
    .toolVersion      = 1,
    .name             = "SampleTool_C_Handler",
    .version          = "1.0.1",
    .author           = "EoF Software Labs",
    .description      = "Sample Plugin written in C as dylib",
    .toolEntryPoint   = "toolEntry",
    .toolIdentifier   = "org.eof.tools.MCStudio.SamplePlugin.C",
    .capabilitiesJSON = "{}",
};

TOOL_API const ToolPluginDescriptor *toolDescribe(void) {
    return &desc;
}

#endif
