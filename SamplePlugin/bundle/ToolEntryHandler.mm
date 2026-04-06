#import <Foundation/Foundation.h>
#include "ToolJSONBridge.h"

@interface ToolEntryHandler : NSObject
@property (nonatomic, retain) NSString *sid;
@property (nonatomic, retain) NSString *toolName;
@property (nonatomic, retain) NSDictionary *params;
@property (nonatomic, retain) NSError *error;
@property (nonatomic, retain) NSString *info;
@end

@implementation ToolEntryHandler
- (instancetype)init {
    self = [super init];
    if (self) {
        _error = nil;
    }
    return self;
}

/**
 * Creates a success result with the given data and metadata
 * @param data - The main data to include in the result
 * @param metadata - Optional metadata about the operation
 * @returns JSON string representing a successful result
 */
- (NSString *)createSuccessResult:(NSDictionary *)data metadata:(NSDictionary *)metadata {
    // Create result dictionary with success structure using modern syntax
    NSDictionary *resultDict = @{
        @"text": [self jsonStringFromData:data],
        @"success": @true,
        @"metadata": metadata ?: @{}
    };
    
    // Fix: Use correct NSJSONSerialization methods
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:resultDict options:NSJSONWritingPrettyPrinted error:&error];
    if (error) {
        NSLog(@"[Script] JSON Serialization Error: %@", error.localizedDescription);
        return @"{}";
    }
    
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSLog(@"[Script] Result:\n%@", jsonString);
    return jsonString;
}

/**
 * Creates an error result with the given message
 * @param errorMessage - The error message to include in the result
 * @returns JSON string representing an error result
 */
- (NSString *)createErrorResult:(NSString *)errorMessage {
    // Create error metadata dictionary
    NSDictionary *errorMetadata = @{
        @"error": errorMessage
    };
    // Create result dictionary with error structure using modern syntax
    NSDictionary *resultDict = @{
        @"text": errorMessage,
        @"success": @false,
        @"metadata": errorMetadata
    };
    
    // Fix: Use correct NSJSONSerialization methods
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:resultDict options:NSJSONWritingPrettyPrinted error:&error];
    if (error) {
        NSLog(@"[Script] JSON Serialization Error: %@", error.localizedDescription);
        return @"{}";
    }
    
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    NSLog(@"[Script] Result:\n%@", jsonString);
    return jsonString;
}

- (NSString *)handleToolEntryWithSID:(NSString *)sid
                        toolName:(NSString *)toolName
                           params:(NSDictionary *)params
                            error:(NSError * _Nullable __autoreleasing *_Nonnull)_error {
    self.sid = sid;
    self.toolName = toolName;
    self.params = params;
    // Validate required parameters
    if (self.sid == nil) {
        self.error = [NSError errorWithDomain:@"ToolSDK" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Missing SID"}];
        return [self createErrorResult:@"Missing SID"];
    }
    if (self.toolName == nil) {
        self.error = [NSError errorWithDomain:@"ToolSDK" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Missing tool name"}];
        return [self createErrorResult:@"Missing tool name"];
    }
    NSLog(@"ToolEntryHandler: Handling tool request for %@", self.toolName);
    // Process the tool entry
    NSString *content = [self stringForKey:@"content"];
    NSString *info = [self stringForKey:@"info"];
    if (content) {
        NSLog(@"Content: %@", [content stringByAppendingString:self.info]);
    }
    // Create success result with processed data
    NSDictionary *processedData = @{
        @"toolName": self.toolName,
        @"sid": self.sid,
        @"content": content ?: @""
    };
    
    // Fix: Ensure proper type casting for metadata parameter
    NSDictionary *metadataDict = (info && [info isKindOfClass:[NSDictionary class]]) ? (NSDictionary *)info : @{};
    return [self createSuccessResult:processedData metadata:metadataDict];
}

- (NSString *)stringForKey:(NSString *)key {
    NSString *value = self.params[key];
    return value;
}

/**
 * Helper method to convert dictionary to JSON string
 */
- (NSString *)jsonStringFromData:(NSDictionary *)data {
    NSError *error = nil;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:NSJSONWritingPrettyPrinted error:&error];
    if (error) {
        NSLog(@"[Script] JSON Serialization Error: %@", error.localizedDescription);
        return @"{}";
    }
    
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
    return jsonString;
}
@end
