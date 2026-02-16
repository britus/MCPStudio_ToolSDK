// ===================================================================
//  ToolJSONBridge.h
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ToolJSONBridge : NSObject

+ (NSDictionary *)parseJSON:(const char *)jsonCString
                      error:(NSError **)error;

+ (NSString *)jsonStringFromDictionary:(NSDictionary *)dictionary
                                 error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
