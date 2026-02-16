// ===================================================================
//  ToolEntryHandler.mm
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#import "ToolEntryHandler.h"
#import "ToolJSONBridge.h"

@implementation ToolEntryHandler

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                 toolName:(NSString *)toolName
                                  params:(NSString *)params
                                 error:(NSError **)error
{
    // Validate input parameters
    if (!sid || !toolName || !params) {
        if (error) {
            *error = [NSError errorWithDomain:@"ToolEntryHandlerErrorDomain"
                                         code:1001
                                     userInfo:@{NSLocalizedDescriptionKey: @"Invalid parameters provided to handleToolEntry"}];
        }
        return nil;
    }
    
    // Parse JSON parameters using ToolJSONBridge
    const char* jcstr = [params UTF8String];
    NSDictionary *parsedParams = [ToolJSONBridge parseJSON:jcstr error:error];
    
    if (!parsedParams) {
        return nil;
    }
    
    // Create a structured response dictionary
    NSMutableDictionary *resultDict = [NSMutableDictionary dictionary];
    
    // Add structured content
    NSMutableDictionary *structuredContent = [NSMutableDictionary dictionary];
    [structuredContent setValue:params forKey:@"parameters"];
    [structuredContent setValue:@(YES) forKey:@"success"];
    [structuredContent setValue:@"" forKey:@"error"];
    
    // Add the parsed parameters to structured content
    [structuredContent setValue:parsedParams forKey:@"metadata"];
    
    // Add the structured content to result
    [resultDict setValue:structuredContent forKey:@"structuredContent"];
    
    // Add content array with text
    NSMutableArray *contentArray = [NSMutableArray array];
    NSDictionary *contentItem = @{
        @"type": @"text",
        @"text": params
    };
    [contentArray addObject:contentItem];
    
    [resultDict setValue:contentArray forKey:@"content"];
    
    return [resultDict copy];
}

@end
