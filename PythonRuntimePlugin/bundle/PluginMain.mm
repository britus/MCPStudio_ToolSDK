// ===================================================================
//  PluginMain.mm
//  MCPStudio ToolSDK - Python Runtime Plugin
// ===================================================================

#ifdef TOOL_BUNDLE

#import <Foundation/Foundation.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>

#include "CustomToolExports.h"
#include "ToolABI.h"
#include "ToolJSONBridge.h"
#include "RuntimeHostServices.h"
#import "PythonRuntimeHandler.h"

static pthread_mutex_t PythonHostServicesLock = PTHREAD_MUTEX_INITIALIZER;
static ToolHostServicesV1 PythonHostServices = {};

TOOL_API void toolSetHostServices(const ToolHostServicesV1 *services)
{
    pthread_mutex_lock(&PythonHostServicesLock);
    memset(&PythonHostServices, 0, sizeof(PythonHostServices));
    if (services &&
        services->version == TOOL_HOST_SERVICES_VERSION &&
        services->structSize >= sizeof(ToolHostServicesV1)) {
        PythonHostServices = *services;
    }
    pthread_mutex_unlock(&PythonHostServicesLock);
}

NSDictionary *MCPStudioExecuteHostProcessRequest(NSDictionary *request, NSError **error)
{
    ToolHostServicesV1 services = {};
    pthread_mutex_lock(&PythonHostServicesLock);
    services = PythonHostServices;
    pthread_mutex_unlock(&PythonHostServicesLock);

    if (!services.executeProcess) {
        if (error) {
            *error = [NSError errorWithDomain:@"PythonRuntimeHostServices"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey:
                                         @"Operation not permitted: the host process service is unavailable."}];
        }
        return nil;
    }

    NSData *requestData = [NSJSONSerialization dataWithJSONObject:request options:0 error:error];
    if (!requestData) {
        return nil;
    }
    NSString *requestJSON = [[NSString alloc] initWithData:requestData encoding:NSUTF8StringEncoding];
    char *responseJSON = NULL;
    size_t responseSize = 0;
    int32_t status = services.executeProcess(
        services.context,
        requestJSON.UTF8String,
        &responseJSON,
        &responseSize
    );
    if (status != 0 || !responseJSON || responseSize == 0) {
        if (responseJSON) {
            free(responseJSON);
        }
        if (error) {
            *error = [NSError errorWithDomain:@"PythonRuntimeHostServices"
                                         code:status ?: 2
                                     userInfo:@{NSLocalizedDescriptionKey:
                                         @"The host process service did not return a valid response."}];
        }
        return nil;
    }

    size_t jsonLength = responseJSON[responseSize - 1] == '\0' ? responseSize - 1 : responseSize;
    NSData *responseData = [NSData dataWithBytes:responseJSON length:jsonLength];
    free(responseJSON);
    id response = [NSJSONSerialization JSONObjectWithData:responseData options:0 error:error];
    if (![response isKindOfClass:[NSDictionary class]]) {
        if (error && !*error) {
            *error = [NSError errorWithDomain:@"PythonRuntimeHostServices"
                                         code:3
                                     userInfo:@{NSLocalizedDescriptionKey:
                                         @"The host process response is not a JSON object."}];
        }
        return nil;
    }
    return response;
}

// On success, resultJson is allocated with malloc. The caller owns the buffer
// and must release it with free(), including when the JSON is an error envelope.
TOOL_API void toolEntry(const char *sid,
                        const char *toolName,
                        const char *params,
                        char **resultJson,
                        size_t *resultSize)
{
    @autoreleasepool {
        if (!resultJson || !resultSize) {
            fprintf(stderr, "[PythonRuntime.bundle] Invalid parameters.\n");
            return;
        }
        *resultJson = NULL;
        *resultSize = 0;

        NSString *sidString = sid ? [NSString stringWithUTF8String:sid] : nil;
        NSString *toolNameString = toolName ? [NSString stringWithUTF8String:toolName] : nil;
        NSDictionary *result = nil;

        if (sid && !sidString) {
            result = [PythonRuntimeHandler errorEnvelope:@"SID must be valid UTF-8" metadata:nil];
        } else if (toolName && !toolNameString) {
            result = [PythonRuntimeHandler errorEnvelope:@"Tool name must be valid UTF-8" metadata:nil];
        }

        NSError *error = nil;
        NSDictionary *parsedParams = nil;
        if (!result) {
            if (!params) {
                result = [PythonRuntimeHandler errorEnvelope:@"Missing params JSON" metadata:nil];
            } else {
                NSData *paramsData = [NSData dataWithBytes:params length:strlen(params)];
                id parsedObject = [NSJSONSerialization JSONObjectWithData:paramsData options:0 error:&error];
                if (error || ![parsedObject isKindOfClass:[NSDictionary class]]) {
                    NSString *message = error.localizedDescription ?: @"params must be a JSON object";
                    result = [PythonRuntimeHandler errorEnvelope:@"Invalid params JSON"
                                                        metadata:@{ @"parseError": message }];
                } else {
                    parsedParams = (NSDictionary *)parsedObject;
                }
            }
        }

        if (!result) {
            PythonRuntimeHandler *handler = [[PythonRuntimeHandler alloc] init];
            result = [handler handleToolEntryWithSID:sidString ?: @""
                                            toolName:toolNameString ?: @""
                                              params:parsedParams ?: @{}];
        }

        error = nil;
        NSString *json = [ToolJSONBridge jsonStringFromDictionary:result error:&error];
        if (!json || error) {
            json = @"{\"structuredContent\":{\"success\":false,\"text\":\"JSON serialization failed\",\"metadata\":{\"error\":\"JSON serialization failed\"}},\"content\":[{\"type\":\"text\",\"text\":\"JSON serialization failed\"}],\"isError\":true}";
        }

        NSData *jsonData = [json dataUsingEncoding:NSUTF8StringEncoding];
        *resultSize = [jsonData length] + 1;
        *resultJson = (char *)malloc(*resultSize);

        if (!*resultJson) {
            fprintf(stderr, "[PythonRuntime.bundle] Failed to allocate result buffer.\n");
            *resultSize = 0;
            return;
        }

        memcpy(*resultJson, [jsonData bytes], [jsonData length]);
        (*resultJson)[[jsonData length]] = '\0';
    }
}

#endif
