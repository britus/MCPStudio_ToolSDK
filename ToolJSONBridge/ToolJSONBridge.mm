// ===================================================================
//  ToolJSONBridge.mm
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#import <Foundation/Foundation.h>
#import "ToolJSONBridge.h"

@implementation ToolJSONBridge

+ (NSDictionary *)parseJSON:(const char *)jsonCString
                      error:(NSError **)error
{
    if (!jsonCString) {
        return @{};
    }

    NSData *data = [NSData dataWithBytes:jsonCString
                                  length:strlen(jsonCString)];

    id obj = [NSJSONSerialization JSONObjectWithData:data
                                              options:0
                                                error:error];

    if (![obj isKindOfClass:[NSDictionary class]]) {
        return @{};
    }
    return obj;
}

+ (NSString *)jsonStringFromDictionary:(NSDictionary *)dictionary
                                 error:(NSError **)error
{
    if (!dictionary) {
        return @"";
    }

    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dictionary
                                                       options:0
                                                         error:error];
    if (!jsonData) {
        return @"";
    }

    return [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
}

@end
