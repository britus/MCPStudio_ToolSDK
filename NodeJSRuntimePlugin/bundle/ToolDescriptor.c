// ===================================================================
//  ToolDescriptor.c
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================

#ifdef TOOL_BUNDLE

#include "CustomToolExports.h"
#include "ToolABI.h"

static ToolPluginDescriptor desc = {
    .abiVersion       = TOOL_ABI_VERSION,
    .toolVersion      = 1,
    .name             = "NodeJSRuntimeTool",
    .version          = "1.0.0",
    .author           = "EoF Software Lab",
    .description      = "Runs JavaScript tools with a Node.js executable and returns stdout/stderr as MCP tool results",
    .toolEntryPoint   = "toolEntry",
    .toolIdentifier   = "org.eof.tools.MCPStudio.NodeJSRuntimeTool",
    .capabilitiesJSON = "{\"runtime\":\"nodejs\",\"outputs\":[\"stdout\",\"stderr\",\"exitCode\"]}",
};

TOOL_API const ToolPluginDescriptor *toolDescribe(void) {
    return &desc;
}

#endif
