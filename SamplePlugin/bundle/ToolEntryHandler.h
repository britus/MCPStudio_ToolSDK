// ===================================================================
//  ToolEntryHandler.h
//  MCPStudio - Custom Tool SDK - SamplePlugin
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface ToolEntryHandler : NSObject

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
                                   error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
