// ===================================================================
//  NodeJSRuntimeHandler.h
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface NodeJSRuntimeHandler : NSObject

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
                                   error:(NSError **)error;

+ (NSDictionary *)errorEnvelope:(NSString *)message
                       metadata:(nullable NSDictionary *)metadata;

@end

NS_ASSUME_NONNULL_END
