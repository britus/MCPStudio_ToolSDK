// ===================================================================
//  PythonRuntimeHandler.mm
//  MCPStudio ToolSDK - Python Runtime Plugin
// ===================================================================

#import <Foundation/Foundation.h>
#import "PythonRuntimeHandler.h"
#import "ToolJSONBridge.h"

@interface PythonRuntimeHandler ()
@property (nonatomic, copy) NSString *sid;
@property (nonatomic, copy) NSString *toolName;
@end

@implementation PythonRuntimeHandler

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
                                   error:(NSError **)error
{
    self.sid = sid ?: @"";
    self.toolName = toolName ?: @"";
    NSDictionary *args = [self normalizedArgumentsFromParams:params ?: @{}];

    if (self.sid.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Missing SID" metadata:nil];
    }
    if (self.toolName.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Missing tool name" metadata:nil];
    }

    NSString *inlineScript = [self stringValue:args[@"inlineScript"]];
    NSString *scriptPath = [self stringValue:args[@"scriptPath"]];
    if (inlineScript.length == 0 && scriptPath.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Either scriptPath or inlineScript is required"
                                          metadata:@{ @"required": @[@"scriptPath", @"inlineScript"] }];
    }

    NSString *pythonExecutable = [self resolvedPythonExecutable:[self stringValue:args[@"pythonExecutable"]]];
    if (pythonExecutable.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Could not resolve Python executable"
                                          metadata:@{ @"pythonExecutable": [self stringValue:args[@"pythonExecutable"]] ?: @"" }];
    }

    NSString *workingDirectory = [self resolvedWorkingDirectory:[self stringValue:args[@"workingDirectory"]]
                                                     scriptPath:scriptPath];
    if (workingDirectory.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Could not resolve working directory"
                                          metadata:@{ @"workingDirectory": [self stringValue:args[@"workingDirectory"]] ?: @"" }];
    }

    NSMutableArray<NSString *> *processArguments = [NSMutableArray array];
    if ([pythonExecutable isEqualToString:@"/usr/bin/env"]) {
        [processArguments addObject:@"python3"];
    }

    if (inlineScript.length > 0) {
        [processArguments addObject:@"-c"];
        [processArguments addObject:inlineScript];
    } else {
        NSString *validatedScript = [self validatedAbsoluteFilePath:scriptPath label:@"scriptPath"];
        if (validatedScript.length == 0) {
            return [PythonRuntimeHandler errorEnvelope:@"scriptPath must be an existing absolute file path"
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

    NSDictionary *run = [self runExecutable:pythonExecutable
                                  arguments:processArguments
                           workingDirectory:workingDirectory
                                      stdin:stdinText
                                environment:environment
                             timeoutSeconds:timeout];

    NSString *resultMode = [[self stringValue:args[@"resultMode"]] lowercaseString];
    if ([resultMode isEqualToString:@"toolresultjson"] || [resultMode isEqualToString:@"tool_result_json"]) {
        NSDictionary *parsed = [self parseToolResultFromStdout:[self stringValue:run[@"stdout"]]];
        if (parsed) {
            return parsed;
        }
        return [PythonRuntimeHandler errorEnvelope:@"resultMode=toolResultJSON but stdout did not contain a valid tool result JSON object"
                                          metadata:run];
    }

    return [self envelopeForRunResult:run
                     pythonExecutable:pythonExecutable
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
                      pythonExecutable:(NSString *)pythonExecutable
                            scriptPath:(NSString *)scriptPath
                      workingDirectory:(NSString *)workingDirectory
                            resultMode:(NSString *)resultMode
{
    NSString *stdoutText = [self stringValue:run[@"stdout"]];
    NSString *stderrText = [self stringValue:run[@"stderr"]];
    NSNumber *exitCode = [run[@"exitCode"] isKindOfClass:[NSNumber class]] ? run[@"exitCode"] : @(-1);
    BOOL timedOut = [run[@"timedOut"] boolValue];
    BOOL success = ([exitCode integerValue] == 0 && !timedOut);

    NSMutableArray *content = [NSMutableArray array];
    if (stdoutText.length > 0) {
        [content addObject:@{ @"type": @"text", @"text": stdoutText }];
    }
    if (stderrText.length > 0) {
        [content addObject:@{ @"type": @"text", @"text": stderrText }];
    }
    if (content.count == 0) {
        NSString *emptyText = success ? @"Python script completed without output" : @"Python script failed without output";
        [content addObject:@{ @"type": @"text", @"text": emptyText }];
    }

    NSMutableDictionary *structured = [NSMutableDictionary dictionaryWithDictionary:@{
        @"success": @(success),
        @"exitCode": exitCode,
        @"stdout": stdoutText ?: @"",
        @"stderr": stderrText ?: @"",
        @"timedOut": @(timedOut),
        @"pythonExecutable": pythonExecutable ?: @"",
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

    stdoutHandle.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length > 0) {
            @synchronized (stdoutData) {
                [stdoutData appendData:data];
            }
        }
    };
    stderrHandle.readabilityHandler = ^(NSFileHandle *handle) {
        NSData *data = [handle availableData];
        if (data.length > 0) {
            @synchronized (stderrData) {
                [stderrData appendData:data];
            }
        }
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
            @"stderr": exception.reason ?: @"Failed to launch Python executable",
            @"timedOut": @NO,
            @"launchError": exception.reason ?: @"Failed to launch Python executable"
        };
    }

    NSFileHandle *stdinHandle = [stdinPipe fileHandleForWriting];
    if (stdinText.length > 0) {
        NSData *stdinData = [stdinText dataUsingEncoding:NSUTF8StringEncoding];
        if (stdinData.length > 0) {
            [stdinHandle writeData:stdinData];
        }
    }
    [stdinHandle closeFile];

    long waitResult = dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)));
    BOOL timedOut = (waitResult != 0);
    if (timedOut && task.isRunning) {
        [task terminate];
        dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)));
    }

    stdoutHandle.readabilityHandler = nil;
    stderrHandle.readabilityHandler = nil;

    NSData *remainingStdout = [stdoutHandle readDataToEndOfFile];
    NSData *remainingStderr = [stderrHandle readDataToEndOfFile];
    @synchronized (stdoutData) {
        if (remainingStdout.length > 0) {
            [stdoutData appendData:remainingStdout];
        }
    }
    @synchronized (stderrData) {
        if (remainingStderr.length > 0) {
            [stderrData appendData:remainingStderr];
        }
    }

    NSString *stdoutText = [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"";
    NSString *stderrText = [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"";
    int exitCode = timedOut ? -1 : task.terminationStatus;

    return @{
        @"success": @(!timedOut && exitCode == 0),
        @"exitCode": @(exitCode),
        @"stdout": stdoutText,
        @"stderr": stderrText,
        @"timedOut": @(timedOut)
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

- (NSString *)resolvedPythonExecutable:(NSString *)candidate
{
    NSString *trimmed = [candidate stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (trimmed.length > 0) {
        if ([trimmed isEqualToString:@"python"] || [trimmed isEqualToString:@"python3"]) {
            return @"/usr/bin/env";
        }
        NSString *standard = [trimmed stringByStandardizingPath];
        if ([standard hasPrefix:@"/"] && [[NSFileManager defaultManager] isExecutableFileAtPath:standard]) {
            return standard;
        }
        return @"";
    }

    NSArray *candidates = @[
        @"/opt/homebrew/bin/python3",
        @"/usr/local/bin/python3",
        @"/usr/bin/python3"
    ];
    for (NSString *path in candidates) {
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:path]) {
            return path;
        }
    }
    return @"/usr/bin/env";
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
    NSString *standard = [path stringByStandardizingPath];
    BOOL isDirectory = NO;
    if ([[NSFileManager defaultManager] fileExistsAtPath:standard isDirectory:&isDirectory] && isDirectory) {
        return standard;
    }
    return @"";
}

- (NSString *)validatedAbsoluteFilePath:(NSString *)path label:(NSString *)label
{
    NSString *standard = [[self stringValue:path] stringByStandardizingPath];
    if (![standard hasPrefix:@"/"]) {
        return @"";
    }
    BOOL isDirectory = NO;
    if (![[NSFileManager defaultManager] fileExistsAtPath:standard isDirectory:&isDirectory] || isDirectory) {
        return @"";
    }
    return standard;
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
