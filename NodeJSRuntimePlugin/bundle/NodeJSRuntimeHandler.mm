// ===================================================================
//  NodeJSRuntimeHandler.mm
//  MCPStudio ToolSDK - NodeJS Runtime Plugin
// ===================================================================

#import <Foundation/Foundation.h>
#include <signal.h>

#import "NodeJSRuntimeHandler.h"
#import "ToolJSONBridge.h"

static const NSUInteger NodeJSRuntimeMaxOutputBytes = 10 * 1024 * 1024;
static const NSTimeInterval NodeJSRuntimeTerminationGraceSeconds = 2.0;

@implementation NodeJSRuntimeHandler

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
{
    NSString *normalizedSID = sid ?: @"";
    NSString *normalizedToolName = toolName ?: @"";
    NSDictionary *args = [self normalizedArgumentsFromParams:params ?: @{}];

    if (normalizedSID.length == 0) {
        return [NodeJSRuntimeHandler errorEnvelope:@"Missing SID" metadata:nil];
    }
    if (normalizedToolName.length == 0) {
        return [NodeJSRuntimeHandler errorEnvelope:@"Missing tool name" metadata:nil];
    }

    NSString *inlineScript = [self stringValue:args[@"inlineScript"]];
    NSString *scriptPath = [self stringValue:args[@"scriptPath"]];
    if (inlineScript.length == 0 && scriptPath.length == 0) {
        return [NodeJSRuntimeHandler errorEnvelope:@"Either scriptPath or inlineScript is required"
                                          metadata:@{ @"required": @[@"scriptPath", @"inlineScript"] }];
    }

    NSString *nodeExecutable = [self resolvedNodeExecutable:[self stringValue:args[@"nodeExecutable"]]];
    if (nodeExecutable.length == 0) {
        return [NodeJSRuntimeHandler errorEnvelope:@"Could not resolve Node.js executable"
                                          metadata:@{ @"nodeExecutable": [self stringValue:args[@"nodeExecutable"]] ?: @"" }];
    }

    NSString *workingDirectory = [self resolvedWorkingDirectory:[self stringValue:args[@"workingDirectory"]]
                                                     scriptPath:scriptPath];
    if (workingDirectory.length == 0) {
        return [NodeJSRuntimeHandler errorEnvelope:@"workingDirectory must be an existing absolute directory"
                                          metadata:@{ @"workingDirectory": [self stringValue:args[@"workingDirectory"]] ?: @"" }];
    }

    NSMutableArray<NSString *> *processArguments = [NSMutableArray array];

    if (inlineScript.length > 0) {
        [processArguments addObject:@"-e"];
        [processArguments addObject:inlineScript];
    } else {
        NSString *validatedScript = [self validatedAbsoluteFilePath:scriptPath label:@"scriptPath"];
        if (validatedScript.length == 0) {
            return [NodeJSRuntimeHandler errorEnvelope:@"scriptPath must be an existing absolute file path"
                                              metadata:@{ @"scriptPath": scriptPath ?: @"" }];
        }
        [processArguments addObject:validatedScript];
    }

    for (id item in [self arrayValue:args[@"scriptArguments"]]) {
        NSString *value = [self stringValue:item];
        if (value.length > 0) {
            [processArguments addObject:value];
        }
    }
    for (id item in [self arrayValue:args[@"arguments"]]) {
        NSString *value = [self stringValue:item];
        if (value.length > 0) {
            [processArguments addObject:value];
        }
    }

    NSString *stdinText = [self stdinTextFromArguments:args];
    NSTimeInterval timeout = [self timeoutFromValue:args[@"timeoutSeconds"]];
    NSDictionary *environment = [self environmentFromValue:args[@"environment"]];

    NSDictionary *run = [self runExecutable:nodeExecutable
                                  arguments:processArguments
                           workingDirectory:workingDirectory
                                      stdin:stdinText
                                environment:environment
                             timeoutSeconds:timeout];

    NSString *resultMode = [[self stringValue:args[@"resultMode"]] lowercaseString];
    if ([resultMode isEqualToString:@"toolresultjson"] || [resultMode isEqualToString:@"tool_result_json"]) {
        if (![run[@"success"] boolValue]) {
            return [NodeJSRuntimeHandler errorEnvelope:@"Node.js process failed before producing a successful tool result"
                                             metadata:run];
        }
        NSDictionary *parsed = [self parseToolResultFromStdout:[self stringValue:run[@"stdout"]]];
        if (parsed) {
            return parsed;
        }
        return [NodeJSRuntimeHandler errorEnvelope:@"resultMode=toolResultJSON but stdout did not contain a valid tool result JSON object"
                                          metadata:run];
    }

    return [self envelopeForRunResult:run
                       nodeExecutable:nodeExecutable
                           scriptPath:scriptPath
                     workingDirectory:workingDirectory
                           resultMode:resultMode.length > 0 ? resultMode : @"capture"];
}

#pragma mark - Result envelopes

+ (NSDictionary *)errorEnvelope:(NSString *)message metadata:(NSDictionary *)metadata
{
    NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:metadata ?: @{}];
    if (message) {
        merged[@"error"] = message;
    }

    return @{
        @"structuredContent": @{
            @"success": @NO,
            @"text": message ?: @"",
            @"metadata": merged
        },
        @"content": @[
            @{ @"type": @"text", @"text": message ?: @"" }
        ],
        @"isError": @YES
    };
}

- (NSDictionary *)envelopeForRunResult:(NSDictionary *)run
                        nodeExecutable:(NSString *)nodeExecutable
                            scriptPath:(NSString *)scriptPath
                      workingDirectory:(NSString *)workingDirectory
                            resultMode:(NSString *)resultMode
{
    NSString *stdoutText = [self stringValue:run[@"stdout"]];
    NSString *stderrText = [self stringValue:run[@"stderr"]];
    NSNumber *exitCode = [run[@"exitCode"] isKindOfClass:[NSNumber class]] ? run[@"exitCode"] : @(-1);
    BOOL timedOut = [run[@"timedOut"] boolValue];
    BOOL outputLimitExceeded = [run[@"outputLimitExceeded"] boolValue];
    NSNumber *maxOutputBytes = [run[@"maxOutputBytes"] isKindOfClass:[NSNumber class]]
        ? run[@"maxOutputBytes"]
        : @(NodeJSRuntimeMaxOutputBytes);
    BOOL success = ([exitCode integerValue] == 0 && !timedOut && !outputLimitExceeded);

    NSMutableArray *content = [NSMutableArray array];
    if (stdoutText.length > 0) {
        [content addObject:@{ @"type": @"text", @"text": stdoutText }];
    }
    if (stderrText.length > 0) {
        [content addObject:@{ @"type": @"text", @"text": stderrText }];
    }
    if (content.count == 0) {
        NSString *emptyText = success ? @"Node.js script completed without output" : @"Node.js script failed without output";
        [content addObject:@{ @"type": @"text", @"text": emptyText }];
    }

    NSMutableDictionary *structured = [NSMutableDictionary dictionaryWithDictionary:@{
        @"success": @(success),
        @"exitCode": exitCode,
        @"stdout": stdoutText ?: @"",
        @"stderr": stderrText ?: @"",
        @"timedOut": @(timedOut),
        @"outputLimitExceeded": @(outputLimitExceeded),
        @"maxOutputBytes": maxOutputBytes,
        @"nodeExecutable": nodeExecutable ?: @"",
        @"scriptPath": scriptPath ?: @"",
        @"workingDirectory": workingDirectory ?: @"",
        @"resultMode": resultMode ?: @"capture"
    }];

    if (run[@"launchError"]) {
        structured[@"launchError"] = run[@"launchError"];
    }

    return @{
        @"structuredContent": structured,
        @"content": content,
        @"isError": @(!success)
    };
}

- (NSDictionary *)parseToolResultFromStdout:(NSString *)stdoutText
{
    if (stdoutText.length == 0) {
        return nil;
    }
    NSError *error = nil;
    NSDictionary *parsed = [ToolJSONBridge parseJSON:[stdoutText UTF8String] error:&error];
    if (!parsed || error) {
        return nil;
    }
    if (![parsed[@"content"] isKindOfClass:[NSArray class]] ||
        ![parsed[@"structuredContent"] isKindOfClass:[NSDictionary class]]) {
        return nil;
    }
    return parsed;
}

#pragma mark - Process execution

- (NSDictionary *)runExecutable:(NSString *)executable
                      arguments:(NSArray<NSString *> *)arguments
               workingDirectory:(NSString *)workingDirectory
                          stdin:(NSString *)stdinText
                    environment:(NSDictionary<NSString *, NSString *> *)environment
                 timeoutSeconds:(NSTimeInterval)timeout
{
    NSTask *task = [[NSTask alloc] init];
    NSPipe *stdoutPipe = [NSPipe pipe];
    NSPipe *stderrPipe = [NSPipe pipe];
    NSPipe *stdinPipe = [NSPipe pipe];
    NSMutableData *stdoutData = [NSMutableData data];
    NSMutableData *stderrData = [NSMutableData data];
    NSObject *outputLock = [[NSObject alloc] init];
    __block BOOL outputLimitExceeded = NO;

    task.launchPath = executable;
    task.arguments = arguments ?: @[];
    task.currentDirectoryPath = workingDirectory;
    task.standardOutput = stdoutPipe;
    task.standardError = stderrPipe;
    task.standardInput = stdinPipe;

    NSMutableDictionary *mergedEnvironment = [NSMutableDictionary dictionaryWithDictionary:[[NSProcessInfo processInfo] environment]];
    [mergedEnvironment addEntriesFromDictionary:environment ?: @{}];
    if (!mergedEnvironment[@"PATH"]) {
        mergedEnvironment[@"PATH"] = @"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";
    }
    task.environment = mergedEnvironment;

    NSFileHandle *stdoutHandle = [stdoutPipe fileHandleForReading];
    NSFileHandle *stderrHandle = [stderrPipe fileHandleForReading];

    void (^appendOutput)(NSData *, NSMutableData *) = ^(NSData *data, NSMutableData *target) {
        if (data.length == 0) {
            return;
        }

        BOOL shouldKill = NO;
        @synchronized (outputLock) {
            if (outputLimitExceeded) {
                return;
            }

            NSUInteger capturedBytes = stdoutData.length + stderrData.length;
            NSUInteger remainingBytes = capturedBytes < NodeJSRuntimeMaxOutputBytes
                ? NodeJSRuntimeMaxOutputBytes - capturedBytes
                : 0;
            NSUInteger bytesToAppend = MIN(data.length, remainingBytes);
            if (bytesToAppend > 0) {
                [target appendBytes:data.bytes length:bytesToAppend];
            }
            if (bytesToAppend < data.length) {
                outputLimitExceeded = YES;
                shouldKill = YES;
            }
        }

        if (shouldKill && task.isRunning) {
            kill(task.processIdentifier, SIGKILL);
        }
    };

    stdoutHandle.readabilityHandler = ^(NSFileHandle *handle) {
        appendOutput([handle availableData], stdoutData);
    };
    stderrHandle.readabilityHandler = ^(NSFileHandle *handle) {
        appendOutput([handle availableData], stderrData);
    };

    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    task.terminationHandler = ^(NSTask *finishedTask) {
        dispatch_semaphore_signal(done);
    };

    @try {
        [task launch];
    } @catch (NSException *exception) {
        stdoutHandle.readabilityHandler = nil;
        stderrHandle.readabilityHandler = nil;
        return @{
            @"success": @NO,
            @"exitCode": @(-1),
            @"stdout": @"",
            @"stderr": exception.reason ?: @"Failed to launch Node.js executable",
            @"timedOut": @NO,
            @"launchError": exception.reason ?: @"Failed to launch Node.js executable"
        };
    }

    NSFileHandle *stdinHandle = [stdinPipe fileHandleForWriting];
    NSData *stdinData = [stdinText dataUsingEncoding:NSUTF8StringEncoding];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        @try {
            if (stdinData.length > 0) {
                [stdinHandle writeData:stdinData];
            }
        } @catch (__unused NSException *exception) {
            // The child may exit or be terminated before consuming all input.
        }
        [stdinHandle closeFile];
    });

    long waitResult = dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)));
    BOOL timedOut = (waitResult != 0);
    if (timedOut && task.isRunning) {
        [task terminate];
        long terminationResult = dispatch_semaphore_wait(
            done,
            dispatch_time(DISPATCH_TIME_NOW, (int64_t)(NodeJSRuntimeTerminationGraceSeconds * NSEC_PER_SEC)));
        if (terminationResult != 0 && task.isRunning) {
            kill(task.processIdentifier, SIGKILL);
            dispatch_semaphore_wait(
                done,
                dispatch_time(DISPATCH_TIME_NOW, (int64_t)(NodeJSRuntimeTerminationGraceSeconds * NSEC_PER_SEC)));
        }
    }

    stdoutHandle.readabilityHandler = nil;
    stderrHandle.readabilityHandler = nil;

    NSData *remainingStdout = [stdoutHandle readDataToEndOfFile];
    NSData *remainingStderr = [stderrHandle readDataToEndOfFile];
    appendOutput(remainingStdout, stdoutData);
    appendOutput(remainingStderr, stderrData);

    BOOL didExceedOutputLimit = NO;
    @synchronized (outputLock) {
        didExceedOutputLimit = outputLimitExceeded;
    }

    NSString *stdoutText = [self textFromOutputData:stdoutData streamName:@"stdout"];
    NSString *stderrText = [self textFromOutputData:stderrData streamName:@"stderr"];
    if (didExceedOutputLimit) {
        NSString *diagnostic = [NSString stringWithFormat:
            @"Node.js process exceeded the %lu-byte combined stdout/stderr limit",
            (unsigned long)NodeJSRuntimeMaxOutputBytes];
        stderrText = stderrText.length > 0
            ? [stderrText stringByAppendingFormat:@"\n%@", diagnostic]
            : diagnostic;
    }
    int exitCode = timedOut ? -1 : task.terminationStatus;

    return @{
        @"success": @(!timedOut && !didExceedOutputLimit && exitCode == 0),
        @"exitCode": @(exitCode),
        @"stdout": stdoutText,
        @"stderr": stderrText,
        @"timedOut": @(timedOut),
        @"outputLimitExceeded": @(didExceedOutputLimit),
        @"maxOutputBytes": @(NodeJSRuntimeMaxOutputBytes)
    };
}

#pragma mark - Argument helpers

- (NSDictionary *)normalizedArgumentsFromParams:(NSDictionary *)params
{
    id arguments = params[@"arguments"];
    if ([arguments isKindOfClass:[NSDictionary class]]) {
        NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:(NSDictionary *)arguments];
        for (NSString *key in @[@"execHandler", @"execMethod", @"name", @"pluginName"]) {
            if (params[key] && !merged[key]) {
                merged[key] = params[key];
            }
        }
        return merged;
    }
    return params ?: @{};
}

- (NSString *)resolvedNodeExecutable:(NSString *)candidate
{
    NSString *trimmed = [candidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (trimmed.length > 0) {
        if (![trimmed isEqualToString:@"node"]) {
            if (![trimmed isAbsolutePath]) {
                return @"";
            }
            NSString *standard = [trimmed stringByStandardizingPath];
            return [[NSFileManager defaultManager] isExecutableFileAtPath:standard] ? standard : @"";
        }
    }

    NSMutableArray<NSString *> *candidates = [NSMutableArray arrayWithArray:@[
        @"/opt/homebrew/bin/node",
        @"/usr/local/bin/node",
        @"/usr/bin/node"
    ]];
    NSString *processPath = [[[NSProcessInfo processInfo] environment] objectForKey:@"PATH"];
    for (NSString *directory in [processPath componentsSeparatedByString:@":"]) {
        if (directory.length > 0 && directory.isAbsolutePath) {
            [candidates addObject:[directory stringByAppendingPathComponent:@"node"]];
        }
    }

    for (NSString *path in candidates) {
        NSString *standard = [path stringByStandardizingPath];
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:standard]) {
            return standard;
        }
    }
    return @"";
}

- (NSString *)resolvedWorkingDirectory:(NSString *)candidate scriptPath:(NSString *)scriptPath
{
    NSString *trimmed = [candidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSString *path = trimmed.length > 0 ? trimmed : @"";
    if (path.length == 0 && scriptPath.length > 0) {
        path = [scriptPath stringByDeletingLastPathComponent];
    }
    if (path.length == 0) {
        path = [[NSFileManager defaultManager] currentDirectoryPath];
    }
    if (![path isAbsolutePath]) {
        return @"";
    }
    NSString *standard = [path stringByStandardizingPath];
    BOOL isDirectory = NO;
    if ([[NSFileManager defaultManager] fileExistsAtPath:standard isDirectory:&isDirectory] && isDirectory) {
        return standard;
    }
    return @"";
}

- (NSString *)validatedAbsoluteFilePath:(NSString *)path label:(NSString *)label
{
    NSString *rawPath = [self stringValue:path];
    if (![rawPath isAbsolutePath]) {
        return @"";
    }
    NSString *standard = [rawPath stringByStandardizingPath];
    BOOL isDirectory = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:standard isDirectory:&isDirectory] || isDirectory) {
        return @"";
    }
    return standard;
}

- (NSString *)textFromOutputData:(NSData *)data streamName:(NSString *)streamName
{
    if (data.length == 0) {
        return @"";
    }

    NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (text) {
        return text;
    }

    return [NSString stringWithFormat:@"<%@ contained %lu bytes of non-UTF-8 data>",
                                      streamName,
                                      (unsigned long)data.length];
}

- (NSString *)stdinTextFromArguments:(NSDictionary *)args
{
    NSString *stdinText = [self stringValue:args[@"stdin"]];
    if (stdinText.length > 0) {
        return stdinText;
    }

    id stdinJSON = args[@"stdinJSON"];
    if (stdinJSON && [NSJSONSerialization isValidJSONObject:stdinJSON]) {
        NSData *data = [NSJSONSerialization dataWithJSONObject:stdinJSON options:0 error:nil];
        return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
    }

    if ([self boolValue:args[@"passParamsToStdin"] defaultValue:NO] && [NSJSONSerialization isValidJSONObject:args]) {
        NSData *data = [NSJSONSerialization dataWithJSONObject:args options:0 error:nil];
        return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
    }

    return @"";
}

- (NSTimeInterval)timeoutFromValue:(id)value
{
    NSTimeInterval timeout = 60.0;
    if ([value respondsToSelector:@selector(doubleValue)]) {
        timeout = [value doubleValue];
    }
    if (timeout <= 0) {
        timeout = 60.0;
    }
    if (timeout > 600.0) {
        timeout = 600.0;
    }
    return timeout;
}

- (NSDictionary<NSString *, NSString *> *)environmentFromValue:(id)value
{
    if (![value isKindOfClass:[NSDictionary class]]) {
        return @{};
    }
    NSMutableDictionary *result = [NSMutableDictionary dictionary];
    [(NSDictionary *)value enumerateKeysAndObjectsUsingBlock:^(id key, id obj, BOOL *stop) {
        NSString *k = [self stringValue:key];
        NSString *v = [self stringValue:obj];
        if (k.length > 0) {
            result[k] = v ?: @"";
        }
    }];
    return result;
}

- (NSArray *)arrayValue:(id)value
{
    if ([value isKindOfClass:[NSArray class]]) {
        return (NSArray *)value;
    }
    return @[];
}

- (NSString *)stringValue:(id)value
{
    if ([value isKindOfClass:[NSString class]]) {
        return (NSString *)value;
    }
    if ([value respondsToSelector:@selector(stringValue)]) {
        return [value stringValue];
    }
    return @"";
}

- (BOOL)boolValue:(id)value defaultValue:(BOOL)defaultValue
{
    if ([value isKindOfClass:[NSNumber class]]) {
        return [value boolValue];
    }
    if ([value isKindOfClass:[NSString class]]) {
        NSString *lower = [(NSString *)value lowercaseString];
        if ([lower isEqualToString:@"true"] || [lower isEqualToString:@"yes"] || [lower isEqualToString:@"1"]) {
            return YES;
        }
        if ([lower isEqualToString:@"false"] || [lower isEqualToString:@"no"] || [lower isEqualToString:@"0"]) {
            return NO;
        }
    }
    return defaultValue;
}

@end
