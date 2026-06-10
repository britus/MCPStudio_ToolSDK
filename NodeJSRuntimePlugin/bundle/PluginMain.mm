// ===================================================================
//  PluginMain.mm
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================

#ifdef TOOL_BUNDLE

#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>

#include "CustomToolExports.h"
#include "ToolABI.h"
#include "ToolJSONBridge.h"
#import "NodeJSRuntimeHandler.h"

TOOL_API void toolEntry(const char *sid,
                        const char *toolName,
                        const char *params,
                        char **resultJson,
                        size_t *resultSize)
{
    @autoreleasepool {
        if (!sid || !toolName || !params || !resultJson || !resultSize) {
            fprintf(stderr, "[NodeJSRuntime.bundle] Invalid parameters.\n");
            return;
        }

        NSError *error = nil;
        NSDictionary *parsedParams = [ToolJSONBridge parseJSON:params error:&error];
        if (!parsedParams && error) {
            parsedParams = @{};
        }

        NodeJSRuntimeHandler *handler = [[NodeJSRuntimeHandler alloc] init];
        NSDictionary *result = [handler handleToolEntryWithSID:[NSString stringWithUTF8String:sid]
                                                      toolName:[NSString stringWithUTF8String:toolName]
                                                        params:parsedParams ?: @{}
                                                         error:&error];

        if (!result) {
            NSString *message = error.localizedDescription ?: @"NodeJS runtime plugin execution failed";
            result = [NodeJSRuntimeHandler errorEnvelope:message
                                                metadata:@{ @"error": message ?: @"" }];
        }

        NSString *json = [ToolJSONBridge jsonStringFromDictionary:result error:&error];
        if (!json || error) {
            json = @"{\"structuredContent\":{\"success\":false,\"text\":\"JSON serialization failed\",\"metadata\":{\"error\":\"JSON serialization failed\"}},\"content\":[{\"type\":\"text\",\"text\":\"JSON serialization failed\"}],\"isError\":true}";
        }

        NSData *jsonData = [json dataUsingEncoding:NSUTF8StringEncoding];
        *resultSize = [jsonData length] + 1;
        *resultJson = (char *)malloc(*resultSize);

        if (!*resultJson) {
            *resultSize = 0;
            fprintf(stderr, "[NodeJSRuntime.bundle] Failed to allocate result buffer.\n");
            return;
        }

        memcpy(*resultJson, [jsonData bytes], [jsonData length]);
        (*resultJson)[[jsonData length]] = '\0';
    }
}

#endif
