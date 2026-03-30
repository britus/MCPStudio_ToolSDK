#import <Foundation/Foundation.h>
#include "ToolJSONBridge.h"

@interface ToolEntryHandler : NSObject

@property (nonatomic, retain) NSString *sid;
@property (nonatomic, retain) NSString *toolName;
@property (nonatomic, retain) NSDictionary *params;
@property (nonatomic, retain) NSError *error;

@end

@implementation ToolEntryHandler

- (instancetype)init {
    self = [super init];
    if (self) {
        error = nil;
    }
    return self;
}

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                        toolName:(NSString *)toolName
                           params:(NSDictionary *)params
                            error:(NSError * _Nullable __autoreleasing *_Nonnull)_error {
    
    self.sid = sid;
    self.toolName = toolName;
    self.params = params;
    
    if (self.sid == nil) {
        self.error = [NSError errorWithDomain:@"ToolSDK" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Missing SID"}];
        return nil;
    }
    
    if (self.toolName == nil) {
        self.error = [NSError errorWithDomain:@"ToolSDK" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Missing tool name"}];
        return nil;
    }
    
    NSLog(@"ToolEntryHandler: Handling tool request for %@", self.toolName);
    
    // Process the tool entry
    NSString *content = [self stringForKey:@"content"];
    if (content) {
        NSLog(@"Content: %@", content);
    }
    
    return nil;
}

- (NSString *)stringForKey:(NSString *)key {
    NSString *value = self.params[key];
    return value;
}

@end
