#pragma once
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

// Executes a typed V1 process request through the host-provided ABI service.
// The returned dictionary is the host-service response envelope.
FOUNDATION_EXPORT NSDictionary * _Nullable MCPStudioExecuteHostProcessRequest(
    NSDictionary *request,
    NSError **error
);

NS_ASSUME_NONNULL_END
