// ===================================================================
//  PythonRuntimeHandler.mm
//  MCPStudio ToolSDK - Python Runtime Plugin
// ===================================================================

#import <Foundation/Foundation.h>

#import "PythonRuntimeHandler.h"
#import "RuntimeHostServices.h"
#import "ToolJSONBridge.h"

static const NSUInteger PythonRuntimeMaxOutputBytes = 10 * 1024 * 1024;

@implementation PythonRuntimeHandler

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
{
    NSString *normalizedSID = sid ?: @"";
    NSString *normalizedToolName = toolName ?: @"";
    NSDictionary *args = [self normalizedArgumentsFromParams:params ?: @{}];

    if (normalizedSID.length == 0) {
        return [PythonRuntimeHandler errorEnvelope:@"Missing SID" metadata:nil];
    }
    if (normalizedToolName.length == 0) {
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
        return [PythonRuntimeHandler errorEnvelope:@"workingDirectory must be an existing absolute directory"
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
                             timeoutSeconds:timeout
                                        sid:normalizedSID
                                   toolName:normalizedToolName];

    NSString *resultMode = [[self stringValue:args[@"resultMode"]] lowercaseString];
    if ([resultMode isEqualToString:@"toolresultjson"] || [resultMode isEqualToString:@"tool_result_json"]) {
        if (![run[@"success"] boolValue]) {
            return [PythonRuntimeHandler errorEnvelope:@"Python process failed before producing a successful tool result"
                                              metadata:run];
        }
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
    BOOL outputLimitExceeded = [run[@"outputLimitExceeded"] boolValue];
    NSNumber *maxOutputBytes = [run[@"maxOutputBytes"] isKindOfClass:[NSNumber class]]
        ? run[@"maxOutputBytes"]
        : @(PythonRuntimeMaxOutputBytes);
    BOOL success = ([exitCode integerValue] == 0 && !timedOut && !outputLimitExceeded);

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
        @"outputLimitExceeded": @(outputLimitExceeded),
        @"maxOutputBytes": maxOutputBytes,
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
                            sid:(NSString *)sid
                       toolName:(NSString *)toolName
{
    NSMutableArray<NSString *> *runtimeArguments = [NSMutableArray arrayWithArray:arguments ?: @[]];
    if ([executable isEqualToString:@"/usr/bin/env"] &&
        runtimeArguments.count > 0 &&
        [runtimeArguments.firstObject isEqualToString:@"python3"]) {
        [runtimeArguments removeObjectAtIndex:0];
    }

    NSString *sourceKind = @"none";
    NSString *source = nil;
    if (runtimeArguments.count >= 2 && [runtimeArguments.firstObject isEqualToString:@"-c"]) {
        sourceKind = @"inline";
        source = runtimeArguments[1];
        [runtimeArguments removeObjectsInRange:NSMakeRange(0, 2)];
    } else if (runtimeArguments.count >= 1) {
        sourceKind = @"path";
        source = runtimeArguments.firstObject;
        [runtimeArguments removeObjectAtIndex:0];
    }

    NSMutableDictionary *request = [NSMutableDictionary dictionaryWithDictionary:@{
        @"requestID": [NSUUID UUID].UUIDString,
        @"conversationID": sid ?: @"",
        @"toolID": toolName ?: @"PythonRuntimeTool",
        @"policyProfileID": @"runtime.python.v1",
        @"runtime": @"python",
        @"sourceKind": sourceKind,
        @"arguments": runtimeArguments,
        @"workingDirectory": workingDirectory ?: NSHomeDirectory(),
        @"environment": environment ?: @{},
        @"timeoutSeconds": @(timeout),
        @"outputLimitBytes": @(PythonRuntimeMaxOutputBytes)
    }];
    if (source) {
        request[@"source"] = source;
    }
    if (executable.length > 0 && ![executable isEqualToString:@"/usr/bin/env"]) {
        request[@"executableHint"] = executable;
    }
    NSData *stdinData = [stdinText dataUsingEncoding:NSUTF8StringEncoding];
    if (stdinData.length > 0) {
        request[@"standardInput"] = [stdinData base64EncodedStringWithOptions:0];
    }

    NSError *hostError = nil;
    NSDictionary *response = MCPStudioExecuteHostProcessRequest(request, &hostError);
    if (!response || hostError) {
        NSString *message = hostError.localizedDescription ?: @"The host process service failed.";
        return @{
            @"success": @NO,
            @"exitCode": @(-1),
            @"stdout": @"",
            @"stderr": message,
            @"timedOut": @NO,
            @"outputLimitExceeded": @NO,
            @"maxOutputBytes": @(PythonRuntimeMaxOutputBytes),
            @"launchError": message
        };
    }

    if (![response[@"hostServiceSuccess"] boolValue]) {
        NSString *message = [self stringValue:response[@"errorMessage"]] ?: @"The host process service rejected the request.";
        return @{
            @"success": @NO,
            @"exitCode": @(-1),
            @"stdout": @"",
            @"stderr": message,
            @"timedOut": @NO,
            @"outputLimitExceeded": @NO,
            @"maxOutputBytes": @(PythonRuntimeMaxOutputBytes),
            @"launchError": message
        };
    }

    NSDictionary *result = [response[@"result"] isKindOfClass:[NSDictionary class]] ? response[@"result"] : @{};
    NSData *stdoutData = [[NSData alloc] initWithBase64EncodedString:[self stringValue:result[@"standardOutput"]] ?: @"" options:0];
    NSData *stderrData = [[NSData alloc] initWithBase64EncodedString:[self stringValue:result[@"standardError"]] ?: @"" options:0];
    NSString *terminationReason = [self stringValue:result[@"terminationReason"]] ?: @"launchFailed";
    NSNumber *exitCode = [result[@"exitCode"] isKindOfClass:[NSNumber class]] ? result[@"exitCode"] : @(-1);
    BOOL timedOut = [terminationReason isEqualToString:@"timedOut"];
    BOOL outputLimitExceeded = [terminationReason isEqualToString:@"outputLimitExceeded"] || [result[@"outputTruncated"] boolValue];
    BOOL success = [terminationReason isEqualToString:@"exited"] && exitCode.integerValue == 0;

    return @{
        @"success": @(success),
        @"exitCode": exitCode,
        @"stdout": [self textFromOutputData:stdoutData ?: [NSData data] streamName:@"stdout"],
        @"stderr": [self textFromOutputData:stderrData ?: [NSData data] streamName:@"stderr"],
        @"timedOut": @(timedOut),
        @"outputLimitExceeded": @(outputLimitExceeded),
        @"maxOutputBytes": @(PythonRuntimeMaxOutputBytes),
        @"resolvedExecutable": [self stringValue:result[@"resolvedExecutable"]] ?: @""
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
        if (![trimmed isAbsolutePath]) {
            return @"";
        }
        return [trimmed stringByStandardizingPath];
    }
    // The out-of-sandbox host service resolves its approved runtime paths.
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
    if (![path isAbsolutePath]) {
        return @"";
    }
    return [path stringByStandardizingPath];
}

- (NSString *)validatedAbsoluteFilePath:(NSString *)path label:(NSString *)label
{
    NSString *rawPath = [self stringValue:path];
    if (![rawPath isAbsolutePath]) {
        return @"";
    }
    return [rawPath stringByStandardizingPath];
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
