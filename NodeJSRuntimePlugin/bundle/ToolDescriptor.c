// ===================================================================
//  ToolDescriptor.c
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================

#ifdef TOOL_BUNDLE

#include "CustomToolExports.h"
#include "ToolABI.h"

#ifndef NODEJS_RUNTIME_VERSION
#define NODEJS_RUNTIME_VERSION "1.0.0"
#endif

static ToolPluginDescriptor desc = {
    .abiVersion       = TOOL_ABI_VERSION_LATEST,
    .toolVersion      = 1,
    .name             = "NodeJSRuntimeTool",
    .version          = NODEJS_RUNTIME_VERSION,
    .author           = "EoF Software Lab",
    .description      = "Runs JavaScript tools with a Node.js executable and returns stdout/stderr as MCP tool results",
    .toolEntryPoint   = "toolEntry",
    .toolIdentifier   = "org.eof.tools.MCPStudio.NodeJSRuntimeTool",
    .capabilitiesJSON = "{\"runtime\":\"nodejs\",\"hostProcessServices\":1,\"outputs\":[\"stdout\",\"stderr\",\"exitCode\"]}",
};

TOOL_API const ToolPluginDescriptor *toolDescribe(void) {
    return &desc;
}

#endif
