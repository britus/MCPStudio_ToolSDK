// ===================================================================
//  NodeJSRuntimeHandler.h
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface NodeJSRuntimeHandler : NSObject

/**
 Builds a typed Node.js execution request for the host-provided process service
 and always returns an MCP tool-result envelope. The plugin never launches a
 process directly.

 `params` accepts either the tool arguments directly or a host envelope whose
 `arguments` value is a dictionary. Supported arguments include `scriptPath`
 or `inlineScript`, `scriptArguments`, `workingDirectory`, `stdin`,
 `stdinJSON`, `environment`, `timeoutSeconds` (maximum 600 seconds), and
 `resultMode`.
 */
- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params;

/** Returns a non-nil MCP error envelope with optional structured metadata. */
+ (NSDictionary *)errorEnvelope:(NSString *)message
                       metadata:(nullable NSDictionary *)metadata;

@end

NS_ASSUME_NONNULL_END
