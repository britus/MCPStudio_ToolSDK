// ===================================================================
//  ToolDescriptor.c
//  MCPStudio ToolSDK - Python Runtime Plugin
// ===================================================================

#ifdef TOOL_BUNDLE

#include "CustomToolExports.h"
#include "ToolABI.h"

static ToolPluginDescriptor desc = {
    .abiVersion       = TOOL_ABI_VERSION,
    .toolVersion      = 1,
    .name             = "PythonRuntimeTool",
    .version          = "1.0.0",
    .author           = "EoF Software Lab",
    .description      = "Runs Python tools with a Python executable and returns stdout/stderr as MCP tool results",
    .toolEntryPoint   = "toolEntry",
    .toolIdentifier   = "org.eof.tools.MCPStudio.PythonRuntimeTool",
    .capabilitiesJSON = "{\"runtime\":\"python\",\"outputs\":[\"stdout\",\"stderr\",\"exitCode\"]}",
};

TOOL_API const ToolPluginDescriptor *toolDescribe(void) {
    return &desc;
}

#endif
