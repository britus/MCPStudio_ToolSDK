#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import "ToolEntryHandler.h"

@interface ToolEntryHandler ()
@property (nonatomic, retain) NSString *sid;
@property (nonatomic, retain) NSString *toolName;
@property (nonatomic, retain) NSDictionary *params;
@property (nonatomic, retain) NSString *sdkRootPath;
@end

@implementation ToolEntryHandler

- (NSDictionary *)handleToolEntryWithSID:(NSString *)sid
                                toolName:(NSString *)toolName
                                  params:(NSDictionary *)params
                                   error:(NSError **)error
{
    self.sid = sid ?: @"";
    self.toolName = toolName ?: @"";
    self.params = [self normalizedArgumentsFromParams:params ?: @{}];
    self.sdkRootPath = [self locateSDKRoot];

    if (self.sid.length == 0) {
        return [self errorEnvelope:@"Missing SID" metadata:nil];
    }

    if (self.toolName.length == 0) {
        return [self errorEnvelope:@"Missing tool name" metadata:nil];
    }

    return [self dispatchHandler:self.toolName params:self.params error:error];
}

- (NSDictionary *)dispatchHandler:(NSString *)handlerName
                           params:(NSDictionary *)params
                            error:(NSError **)error
{
    NSString *effectiveHandler = [self effectiveHandlerName:handlerName params:params];

    if ([effectiveHandler isEqualToString:@"analyzeDirectory"]) {
        return [self analyzeDirectory:params];
    }
    if ([effectiveHandler isEqualToString:@"mkdir"]) {
        return [self mkdirHandler:params];
    }
    if ([effectiveHandler isEqualToString:@"checkWithXcode"]) {
        return [self checkWithXcode:params];
    }
    if ([effectiveHandler isEqualToString:@"clangCheckSyntax"]) {
        return [self clangCheckSyntax:params];
    }
    if ([effectiveHandler isEqualToString:@"clangCompile"]) {
        return [self clangCompile:params];
    }
    if ([effectiveHandler isEqualToString:@"clangMake"]) {
        return [self clangMake:params];
    }
    if ([effectiveHandler isEqualToString:@"shellCall"]) {
        return [self shellCall:params];
    }
    if ([effectiveHandler isEqualToString:@"cmakeBuild"]) {
        return [self cmakeBuild:params];
    }
    if ([effectiveHandler isEqualToString:@"qmakeBuild"]) {
        return [self qmakeBuild:params];
    }
    if ([effectiveHandler isEqualToString:@"checkWithGcc"]) {
        return [self checkWithGcc:params];
    }
    if ([effectiveHandler isEqualToString:@"gccSettings"]) {
        return [self gccSettings:params];
    }
    if ([effectiveHandler isEqualToString:@"getGccInfo"]) {
        return [self getGccInfo:params];
    }
    if ([effectiveHandler isEqualToString:@"fileExists"]) {
        return [self fileExists:params];
    }
    if ([effectiveHandler isEqualToString:@"readFile"]) {
        return [self readFile:params];
    }
    if ([effectiveHandler isEqualToString:@"saveFile"] ||
        [effectiveHandler isEqualToString:@"writeFile"]) {
        return [self saveFile:params];
    }
    if ([effectiveHandler isEqualToString:@"openFile"]) {
        return [self openFile:params];
    }
    if ([effectiveHandler isEqualToString:@"deleteFile"]) {
        return [self deleteFile:params];
    }
    if ([effectiveHandler isEqualToString:@"listDirectory"]) {
        return [self listDirectory:params];
    }
    if ([effectiveHandler isEqualToString:@"createDirectory"]) {
        return [self createDirectory:params];
    }
    if ([effectiveHandler isEqualToString:@"getDocumentsPath"]) {
        return [self getDocumentsPath:params];
    }
    if ([effectiveHandler isEqualToString:@"getTempPath"]) {
        return [self getTempPath:params];
    }
    if ([effectiveHandler isEqualToString:@"fetchPrompt"]) {
        return [self fetchPrompt:params];
    }
    if ([effectiveHandler isEqualToString:@"fetchResource"]) {
        return [self fetchResource:params];
    }
    if ([effectiveHandler isEqualToString:@"previewFile"]) {
        return [self previewFile:params];
    }
    if ([effectiveHandler isEqualToString:@"fetchData"]) {
        return [self fetchData:params];
    }
    if ([effectiveHandler isEqualToString:@"postData"]) {
        return [self postData:params];
    }
    if ([effectiveHandler isEqualToString:@"fetchJSON"]) {
        return [self fetchJSON:params];
    }
    if ([effectiveHandler isEqualToString:@"downloadFile"]) {
        return [self downloadFile:params];
    }
    if ([effectiveHandler isEqualToString:@"apiRequest"]) {
        return [self apiRequest:params];
    }
    if ([effectiveHandler isEqualToString:@"scrapeWebpage"]) {
        return [self scrapeWebpage:params];
    }
    if ([effectiveHandler isEqualToString:@"checkStatus"]) {
        return [self checkStatus:params];
    }
    if ([effectiveHandler isEqualToString:@"webhookCall"]) {
        return [self webhookCall:params];
    }

    if (error) {
        *error = [NSError errorWithDomain:@"ToolSDK"
                                     code:404
                                 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"Unknown handler: %@", effectiveHandler]}];
    }

    return [self errorEnvelope:[NSString stringWithFormat:@"Unknown handler: %@", effectiveHandler]
                      metadata:@{@"handler": effectiveHandler ?: @""}];
}

#pragma mark - Shared result helpers

- (NSDictionary *)successEnvelopeForData:(id)data metadata:(NSDictionary *)metadata
{
    NSString *text = [self stringFromJSONObject:data ?: @{} pretty:YES];
    NSDictionary *structured = @{
        @"text": text ?: @"",
        @"success": @YES,
        @"metadata": metadata ?: @{}
    };

    return @{
        @"structuredContent": structured,
        @"content": @[
            @{
                @"type": @"text",
                @"text": text ?: @""
            }
        ],
        @"isError": @NO
    };
}

- (NSDictionary *)errorEnvelope:(NSString *)message metadata:(NSDictionary *)metadata
{
    NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:metadata ?: @{}];
    if (message) {
        merged[@"error"] = message;
    }

    NSDictionary *structured = @{
        @"text": message ?: @"",
        @"success": @NO,
        @"metadata": merged
    };

    return @{
        @"structuredContent": structured,
        @"content": @[
            @{
                @"type": @"text",
                @"text": message ?: @""
            }
        ],
        @"isError": @YES
    };
}

- (NSDictionary *)successOperation:(NSString *)operation
                              data:(NSDictionary *)data
                          metadata:(NSDictionary *)metadata
{
    NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:metadata ?: @{}];
    if (operation) {
        merged[@"operation"] = operation;
    }
    merged[@"success"] = @YES;
    return [self successEnvelopeForData:data ?: @{} metadata:merged];
}

- (NSDictionary *)errorOperation:(NSString *)operation
                         message:(NSString *)message
                        metadata:(NSDictionary *)metadata
{
    NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:metadata ?: @{}];
    if (operation) {
        merged[@"operation"] = operation;
    }
    merged[@"success"] = @NO;
    return [self errorEnvelope:message metadata:merged];
}

#pragma mark - Parameter helpers

- (NSDictionary *)normalizedArgumentsFromParams:(NSDictionary *)params
{
    id arguments = params[@"arguments"];
    if ([arguments isKindOfClass:[NSDictionary class]]) {
        NSMutableDictionary *merged = [NSMutableDictionary dictionaryWithDictionary:(NSDictionary *)arguments];
        if (params[@"execHandler"]) {
            merged[@"execHandler"] = params[@"execHandler"];
        }
        if (params[@"testHandler"]) {
            merged[@"testHandler"] = params[@"testHandler"];
        }
        if (params[@"name"]) {
            merged[@"name"] = params[@"name"];
        }
        return merged;
    }
    return params ?: @{};
}

- (NSString *)effectiveHandlerName:(NSString *)handlerName params:(NSDictionary *)params
{
    NSString *override = [self stringValue:params[@"testHandler"]];
    if (override.length > 0) {
        return override;
    }

    NSString *execHandler = [self stringValue:params[@"execHandler"]];
    if (execHandler.length > 0) {
        return execHandler;
    }

    return handlerName ?: @"";
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

- (NSArray *)arrayValue:(id)value
{
    if ([value isKindOfClass:[NSArray class]]) {
        return (NSArray *)value;
    }
    return @[];
}

- (NSDictionary *)dictionaryValue:(id)value
{
    if ([value isKindOfClass:[NSDictionary class]]) {
        return (NSDictionary *)value;
    }
    return @{};
}

#pragma mark - Path helpers

- (NSDictionary *)validatedPath:(id)rawValue
                          label:(NSString *)label
                       absolute:(BOOL)absolute
                       relative:(BOOL)relative
{
    NSString *value = [self stringValue:rawValue];
    if (value.length == 0) {
        return @{@"ok": @NO, @"message": [NSString stringWithFormat:@"%@ is required", label ?: @"path"]};
    }

    if ([value rangeOfString:@"\0"].location != NSNotFound ||
        [value rangeOfString:@"\n"].location != NSNotFound ||
        [value rangeOfString:@"\r"].location != NSNotFound) {
        return @{@"ok": @NO, @"message": [NSString stringWithFormat:@"%@ contains invalid characters", label ?: @"path"]};
    }

    NSArray *components = [value pathComponents];
    if ([components containsObject:@".."]) {
        return @{@"ok": @NO, @"message": [NSString stringWithFormat:@"%@ must not contain parent directory traversal", label ?: @"path"]};
    }

    NSString *normalized = [value stringByStandardizingPath];
    BOOL isAbsolute = [normalized hasPrefix:@"/"];

    if (absolute && !isAbsolute) {
        return @{@"ok": @NO, @"message": [NSString stringWithFormat:@"%@ must be an absolute path", label ?: @"path"]};
    }
    if (relative && isAbsolute) {
        return @{@"ok": @NO, @"message": [NSString stringWithFormat:@"%@ must be a relative path", label ?: @"path"]};
    }

    return @{@"ok": @YES, @"value": normalized ?: @""};
}

- (NSString *)documentsPath
{
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    return paths.firstObject ?: [NSHomeDirectory() stringByAppendingPathComponent:@"Documents"];
}

- (NSString *)tempPath
{
    return NSTemporaryDirectory().length > 0 ? NSTemporaryDirectory() : @"/tmp";
}

- (NSString *)locateSDKRoot
{
    NSString *current = [[NSFileManager defaultManager] currentDirectoryPath];
    if (current.length == 0) {
        current = NSHomeDirectory();
    }

    NSString *candidate = current;
    NSUInteger depth = 0;
    while (candidate.length > 1 && depth < 10) {
        BOOL isDirectory = NO;
        NSString *configPath = [candidate stringByAppendingPathComponent:@"config"];
        NSString *scriptsPath = [candidate stringByAppendingPathComponent:@"Scripts"];
        if ([[NSFileManager defaultManager] fileExistsAtPath:configPath isDirectory:&isDirectory] && isDirectory &&
            [[NSFileManager defaultManager] fileExistsAtPath:scriptsPath isDirectory:&isDirectory] && isDirectory) {
            return candidate;
        }
        candidate = [candidate stringByDeletingLastPathComponent];
        depth += 1;
    }

    return current;
}

#pragma mark - File and directory handlers

- (NSDictionary *)fileExists:(NSDictionary *)params
{
    NSDictionary *validation = [self validatedPath:params[@"path"] label:@"path" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"fileExists" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:path];
    NSDictionary *result = @{
        @"exists": @(exists),
        @"path": path
    };
    return [self successOperation:@"fileExists" data:result metadata:result];
}

- (NSDictionary *)readFile:(NSDictionary *)params
{
    NSDictionary *validation = [self validatedPath:params[@"path"] ?: params[@"file_path"] label:@"path" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"readFile" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
    if (!content) {
        NSData *raw = [NSData dataWithContentsOfFile:path options:0 error:&error];
        if (raw) {
            content = [[NSString alloc] initWithData:raw encoding:NSUTF8StringEncoding];
        }
    }

    if (!content) {
        return [self errorOperation:@"readFile"
                            message:[NSString stringWithFormat:@"Failed to read file: %@", path]
                           metadata:@{@"path": path}];
    }

    NSDictionary *result = @{
        @"content": content,
        @"path": path
    };
    return [self successOperation:@"readFile" data:result metadata:@{@"path": path, @"content": content}];
}

- (NSDictionary *)openFile:(NSDictionary *)params
{
    NSDictionary *response = [self readFile:@{@"path": params[@"path"] ?: params[@"file_path"] ?: @""}];
    NSMutableDictionary *structured = [NSMutableDictionary dictionaryWithDictionary:response[@"structuredContent"] ?: @{}];
    NSMutableDictionary *metadata = [NSMutableDictionary dictionaryWithDictionary:structured[@"metadata"] ?: @{}];
    metadata[@"operation"] = @"openFile";
    structured[@"metadata"] = metadata;
    NSMutableDictionary *result = [NSMutableDictionary dictionaryWithDictionary:response];
    result[@"structuredContent"] = structured;
    return result;
}

- (NSDictionary *)saveFile:(NSDictionary *)params
{
    NSDictionary *validation = [self validatedPath:params[@"file_path"] ?: params[@"path"] label:@"file_path" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"saveFile" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSString *content = [self stringValue:params[@"content"]];
    NSError *error = nil;

    NSString *parent = [path stringByDeletingLastPathComponent];
    if (parent.length > 0 && ![[NSFileManager defaultManager] fileExistsAtPath:parent]) {
        [[NSFileManager defaultManager] createDirectoryAtPath:parent
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:&error];
    }

    BOOL success = [content writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (!success) {
        return [self errorOperation:@"saveFile"
                            message:[NSString stringWithFormat:@"Failed to save file: %@", path]
                           metadata:@{@"path": path}];
    }

    NSDictionary *result = @{
        @"success": @"File successfully saved.",
        @"path": path
    };
    return [self successOperation:@"saveFile" data:result metadata:@{@"path": path}];
}

- (NSDictionary *)deleteFile:(NSDictionary *)params
{
    NSDictionary *validation = [self validatedPath:params[@"path"] label:@"path" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"deleteFile" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    BOOL success = [[NSFileManager defaultManager] removeItemAtPath:path error:&error];
    if (!success) {
        return [self errorOperation:@"deleteFile"
                            message:[NSString stringWithFormat:@"Failed to delete file: %@", path]
                           metadata:@{@"path": path}];
    }

    NSDictionary *result = @{
        @"success": @"File successfully deleted.",
        @"path": path
    };
    return [self successOperation:@"deleteFile" data:result metadata:@{@"path": path}];
}

- (NSDictionary *)listDirectory:(NSDictionary *)params
{
    NSString *defaultPath = [[self documentsPath] stringByAppendingPathComponent:@".eof.mcpstudio"];
    NSDictionary *validation = [self validatedPath:params[@"path"] ?: defaultPath label:@"path" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"listDirectory" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    NSArray *contents = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:path error:&error];
    if (!contents) {
        return [self errorOperation:@"listDirectory"
                            message:[NSString stringWithFormat:@"Failed to list directory: %@", path]
                           metadata:@{@"path": path}];
    }

    NSDictionary *result = @{
        @"contents": contents,
        @"path": path
    };
    return [self successOperation:@"listDirectory" data:result metadata:@{@"path": path, @"contents": contents}];
}

- (NSDictionary *)createDirectory:(NSDictionary *)params
{
    NSString *defaultPath = [[self documentsPath] stringByAppendingPathComponent:@".eof.mcpstudio"];
    NSDictionary *validation = [self validatedPath:params[@"dirPath"] ?: defaultPath label:@"dirPath" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"createDirectory" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    BOOL success = [[NSFileManager defaultManager] createDirectoryAtPath:path
                                             withIntermediateDirectories:YES
                                                              attributes:nil
                                                                   error:&error];
    if (!success && ![[NSFileManager defaultManager] fileExistsAtPath:path]) {
        return [self errorOperation:@"createDirectory"
                            message:[NSString stringWithFormat:@"Failed to create directory: %@", path]
                           metadata:@{@"path": path}];
    }

    NSDictionary *result = @{
        @"status": @"Directory successfully created.",
        @"path": path
    };
    return [self successOperation:@"createDirectory" data:result metadata:@{@"path": path}];
}

- (NSDictionary *)mkdirHandler:(NSDictionary *)params
{
    NSDictionary *response = [self createDirectory:params];
    NSMutableDictionary *structured = [NSMutableDictionary dictionaryWithDictionary:response[@"structuredContent"] ?: @{}];
    NSMutableDictionary *metadata = [NSMutableDictionary dictionaryWithDictionary:structured[@"metadata"] ?: @{}];
    metadata[@"operation"] = @"mkdir";
    structured[@"metadata"] = metadata;
    NSMutableDictionary *result = [NSMutableDictionary dictionaryWithDictionary:response];
    result[@"structuredContent"] = structured;
    return result;
}

- (NSDictionary *)getDocumentsPath:(NSDictionary *)params
{
    NSString *path = [self documentsPath];
    NSDictionary *result = @{
        @"path": path,
        @"type": @"documents"
    };
    return [self successOperation:@"getDocumentsPath" data:result metadata:@{@"path": path}];
}

- (NSDictionary *)getTempPath:(NSDictionary *)params
{
    NSString *path = [self tempPath];
    NSDictionary *result = @{
        @"path": path,
        @"type": @"temporary"
    };
    return [self successOperation:@"getTempPath" data:result metadata:@{@"path": path}];
}

- (NSDictionary *)previewFile:(NSDictionary *)params
{
    NSDictionary *validation = [self validatedPath:params[@"filePath"] label:@"filePath" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"previewFile" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    NSString *content = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
    if (!content) {
        return [self errorOperation:@"previewFile"
                            message:[NSString stringWithFormat:@"Failed to read file: %@", path]
                           metadata:@{@"filePath": path}];
    }

    NSArray *lines = [content componentsSeparatedByCharactersInSet:[NSCharacterSet newlineCharacterSet]];
    NSArray *words = [content componentsSeparatedByCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSUInteger wordCount = 0;
    for (NSString *word in words) {
        if (word.length > 0) {
            wordCount += 1;
        }
    }

    NSRange range = NSMakeRange(0, MIN((NSUInteger)10, lines.count));
    NSArray *previewLines = lines.count > 0 ? [lines subarrayWithRange:range] : @[];
    NSDictionary *result = @{
        @"filePath": path,
        @"lineCount": @(lines.count),
        @"wordCount": @(wordCount),
        @"charCount": @(content.length),
        @"preview": [previewLines componentsJoinedByString:@"\n"]
    };

    return [self successOperation:@"previewFile" data:result metadata:@{@"filePath": path}];
}

- (NSDictionary *)analyzeDirectory:(NSDictionary *)params
{
    NSString *defaultPath = [self documentsPath];
    NSDictionary *validation = [self validatedPath:params[@"dirPath"] ?: defaultPath label:@"dirPath" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"analyzeDirectory" message:validation[@"message"] metadata:nil];
    }

    NSString *path = validation[@"value"];
    NSError *error = nil;
    NSArray *items = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:path error:&error];
    if (!items) {
        return [self errorOperation:@"analyzeDirectory"
                            message:[NSString stringWithFormat:@"Directory not found: %@", path]
                           metadata:@{@"path": path}];
    }

    NSMutableArray *entries = [NSMutableArray array];
    for (NSString *item in items) {
        NSString *fullPath = [path stringByAppendingPathComponent:item];
        BOOL isDirectory = NO;
        BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:fullPath isDirectory:&isDirectory];
        [entries addObject:@{
            @"name": item,
            @"exists": @(exists),
            @"isDirectory": @(isDirectory)
        }];
    }

    NSDictionary *result = @{
        @"path": path,
        @"totalItems": @(entries.count),
        @"items": entries
    };
    return [self successOperation:@"analyzeDirectory" data:result metadata:@{@"path": path}];
}

#pragma mark - Config lookup handlers

- (NSDictionary *)fetchPrompt:(NSDictionary *)params
{
    NSString *promptName = [self stringValue:params[@"promptName"]];
    if (promptName.length == 0) {
        return [self errorOperation:@"fetchPrompt" message:@"Prompt name required" metadata:nil];
    }

    NSDictionary *prompt = [self loadNamedJSONResource:promptName directory:@"config/Prompts"];
    if (!prompt) {
        return [self errorOperation:@"fetchPrompt"
                            message:[NSString stringWithFormat:@"Failed to get prompt %@", promptName]
                           metadata:@{@"promptName": promptName}];
    }

    NSDictionary *result = @{
        @"operation": @"fetchPrompt",
        @"message": [NSString stringWithFormat:@"%@: %@", [self stringValue:prompt[@"name"]], [self stringValue:prompt[@"template"]]],
        @"prompt": [self stringValue:prompt[@"template"]],
        @"name": [self stringValue:prompt[@"name"]],
        @"arguments": [self dictionaryValue:prompt[@"arguments"]]
    };
    return [self successOperation:@"fetchPrompt" data:result metadata:result];
}

- (NSDictionary *)fetchResource:(NSDictionary *)params
{
    NSString *resourceName = [self stringValue:params[@"resourceName"]];
    if (resourceName.length == 0) {
        return [self errorOperation:@"fetchResource" message:@"MCP resource name required" metadata:nil];
    }

    NSDictionary *resource = [self loadNamedJSONResource:resourceName directory:@"config/Resources"];
    if (!resource) {
        return [self errorOperation:@"fetchResource"
                            message:[NSString stringWithFormat:@"Failed to load resource: %@", resourceName]
                           metadata:@{
                               @"mimeType": @"plain/text",
                               @"uri": @"",
                               @"name": @""
                           }];
    }

    NSDictionary *result = @{
        @"name": [self stringValue:resource[@"name"]],
        @"uri": [self stringValue:resource[@"uri"]],
        @"mimeType": [self stringValue:resource[@"mimeType"]],
        @"message": [NSString stringWithFormat:@"%@: take a look following link:\n%@",
                     [self stringValue:resource[@"name"]],
                     [self stringValue:resource[@"uri"]]]
    };
    return [self successOperation:@"fetchResource"
                             data:result
                         metadata:@{
                             @"mimeType": result[@"mimeType"],
                             @"uri": result[@"uri"],
                             @"name": result[@"name"]
                         }];
}

#pragma mark - Shell and build handlers

- (NSDictionary *)shellCall:(NSDictionary *)params
{
    NSString *command = [self stringValue:params[@"command"]];
    if (command.length == 0) {
        return [self errorOperation:@"shellCall" message:@"Missing required parameter: command" metadata:nil];
    }

    NSString *shell = [self stringValue:params[@"shell"]];
    if (shell.length == 0) {
        shell = @"/bin/bash";
    }

    NSDictionary *shellValidation = [self validatedPath:shell label:@"shell" absolute:YES relative:NO];
    if (![shellValidation[@"ok"] boolValue]) {
        return [self errorOperation:@"shellCall" message:shellValidation[@"message"] metadata:nil];
    }

    NSArray *parameters = [self arrayValue:params[@"parameters"]];
    NSString *invocation = [self shellInvocationForCommand:command parameters:parameters];
    NSDictionary *process = [self runProcess:shellValidation[@"value"]
                                   arguments:@[@"-lc", invocation]
                          currentDirectory:nil];

    NSMutableDictionary *metadata = [NSMutableDictionary dictionaryWithDictionary:process[@"metadata"] ?: @{}];
    metadata[@"command"] = command;
    metadata[@"shell"] = shellValidation[@"value"];
    metadata[@"parameters"] = parameters;
    metadata[@"operation"] = @"shellCall";

    NSString *text = [NSString stringWithFormat:@"%@\n%@%@",
                      [process[@"success"] boolValue] ? @"[Plugin] Command executed successfully" : @"[Plugin] Command failed.",
                      [self stringValue:process[@"stdout"]],
                      [self stringValue:process[@"stderr"]].length > 0 ? [NSString stringWithFormat:@"\nErrors and Warnings:\n%@", process[@"stderr"]] : @""];

    if (![process[@"success"] boolValue]) {
        return [self errorEnvelope:text metadata:metadata];
    }

    return [self successEnvelopeForData:@{
        @"text": text,
        @"stdout": [self stringValue:process[@"stdout"]],
        @"stderr": [self stringValue:process[@"stderr"]]
    } metadata:metadata];
}

- (NSDictionary *)checkWithXcode:(NSDictionary *)params
{
    NSString *projectName = [self stringValue:params[@"projectName"]];
    NSDictionary *dirValidation = [self validatedPath:params[@"projectDir"] label:@"projectDir" absolute:NO relative:NO];
    if (![dirValidation[@"ok"] boolValue]) {
        return [self errorOperation:@"checkWithXcode" message:dirValidation[@"message"] metadata:nil];
    }
    if (projectName.length == 0) {
        return [self errorOperation:@"checkWithXcode" message:@"Missing required parameter: projectName" metadata:nil];
    }

    NSString *projectDir = dirValidation[@"value"];
    BOOL clean = [self boolValue:params[@"clean"] defaultValue:NO];
    NSString *scheme = [self stringValue:params[@"scheme"]];
    NSString *configuration = [self stringValue:params[@"configuration"]];
    NSString *platform = [self stringValue:params[@"platform"]];
    NSString *codesign = [self stringValue:params[@"codesign"]];
    if (configuration.length == 0) {
        configuration = @"Debug";
    }
    if (platform.length == 0) {
        platform = @"macosx";
    }

    NSMutableString *script = [NSMutableString string];
    [script appendString:@"set -euo pipefail\n"];
    [script appendFormat:@"cd %@ || exit 1\n", [self shellQuote:projectDir]];
    if (clean) {
        [script appendString:@"rm -rf DerivedData build/DerivedData Build/DerivedData || true\n"];
    }
    [script appendString:@"ARCH=$(uname -m)\n"];
    [script appendFormat:@"xcodebuild -project %@.xcodeproj -arch \"$ARCH\"", [self shellQuote:projectName]];
    if (scheme.length > 0) {
        [script appendFormat:@" -scheme %@", [self shellQuote:scheme]];
    }
    if (platform.length > 0) {
        [script appendFormat:@" -sdk %@", [self shellQuote:platform]];
    }
    if (configuration.length > 0) {
        [script appendFormat:@" -configuration %@", [self shellQuote:configuration]];
    }
    if (codesign.length > 0) {
        [script appendFormat:@" CODE_SIGN_IDENTITY=%@", [self shellQuote:codesign]];
    } else {
        [script appendString:@" CODE_SIGNING_ALLOWED=NO"];
    }
    [script appendString:@" build\n"];

    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"checkWithXcode"
                                summary:[process[@"success"] boolValue] ? [NSString stringWithFormat:@"Build completed successfully for %@", projectName] : [NSString stringWithFormat:@"Build FAILED for %@", projectName]
                               metadata:@{
                                   @"path": projectDir,
                                   @"projectName": projectName,
                                   @"configuration": configuration,
                                   @"platform": platform,
                                   @"codesign": codesign,
                                   @"shellScript": script
                               }];
}

- (NSDictionary *)clangCheckSyntax:(NSDictionary *)params
{
    NSString *sourceFile = [self stringValue:params[@"sourceFile"]];
    NSDictionary *validation = [self validatedPath:sourceFile label:@"sourceFile" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"clangCheckSyntax" message:validation[@"message"] metadata:nil];
    }
    sourceFile = validation[@"value"];
    NSString *directory = [sourceFile stringByDeletingLastPathComponent];
    NSString *basename = [sourceFile lastPathComponent];
    NSString *command = [NSString stringWithFormat:@"clang -fsyntax-only %@", [self shellQuote:basename]];
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", command] currentDirectory:directory];
    return [self buildResultWithProcess:process
                              operation:@"clangCheckSyntax"
                                summary:[process[@"success"] boolValue] ? @"Syntax check successfully." : @"Syntax check failed:"
                               metadata:@{@"fileName": sourceFile}];
}

- (NSDictionary *)clangCompile:(NSDictionary *)params
{
    NSString *sourceFile = [self stringValue:params[@"sourceFile"]];
    NSDictionary *validation = [self validatedPath:sourceFile label:@"sourceFile" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"clangCompile" message:validation[@"message"] metadata:nil];
    }
    sourceFile = validation[@"value"];
    NSString *directory = [sourceFile stringByDeletingLastPathComponent];
    NSString *basename = [sourceFile lastPathComponent];
    NSString *outputName = [[basename stringByDeletingPathExtension] stringByAppendingString:@".o"];
    NSString *command = [NSString stringWithFormat:@"clang -c %@ -o %@", [self shellQuote:basename], [self shellQuote:outputName]];
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", command] currentDirectory:directory];
    return [self buildResultWithProcess:process
                              operation:@"clangCompile"
                                summary:[process[@"success"] boolValue] ? @"Compiled successfully." : @"Compiler failed:"
                               metadata:@{@"fileName": sourceFile, @"outputFile": [directory stringByAppendingPathComponent:outputName]}];
}

- (NSDictionary *)clangMake:(NSDictionary *)params
{
    NSString *makeFile = [self stringValue:params[@"makeFile"]];
    NSDictionary *validation = [self validatedPath:makeFile label:@"makeFile" absolute:NO relative:NO];
    if (![validation[@"ok"] boolValue]) {
        return [self errorOperation:@"clangMake" message:validation[@"message"] metadata:nil];
    }
    makeFile = validation[@"value"];
    NSString *directory = [makeFile stringByDeletingLastPathComponent];
    NSString *basename = [makeFile lastPathComponent];
    NSString *command = [NSString stringWithFormat:@"make -j8 -f %@", [self shellQuote:basename]];
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", command] currentDirectory:directory];
    return [self buildResultWithProcess:process
                              operation:@"clangMake"
                                summary:[process[@"success"] boolValue] ? @"Build successfully." : @"Build failed:"
                               metadata:@{@"fileName": makeFile}];
}

- (NSDictionary *)cmakeBuild:(NSDictionary *)params
{
    NSDictionary *dirValidation = [self validatedPath:params[@"projectDir"] label:@"projectDir" absolute:NO relative:NO];
    if (![dirValidation[@"ok"] boolValue]) {
        return [self errorOperation:@"cmakeBuild" message:dirValidation[@"message"] metadata:nil];
    }
    NSString *projectDir = dirValidation[@"value"];
    NSString *buildType = [self stringValue:params[@"buildType"]];
    NSString *cmakeFlags = [self stringValue:params[@"cmakeFlags"]];
    NSString *cmakeArgs = [self stringValue:params[@"cmakeArgs"]];
    if (buildType.length == 0) {
        buildType = @"Debug";
    }
    if (cmakeFlags.length == 0) {
        cmakeFlags = [NSString stringWithFormat:@"-DCMAKE_BUILD_TYPE=%@", buildType];
    }

    NSMutableString *script = [NSMutableString string];
    [script appendString:@"set -euo pipefail\n"];
    [script appendFormat:@"cd %@ || exit 1\n", [self shellQuote:projectDir]];
    [script appendString:@"mkdir -p build\n"];
    [script appendFormat:@"cmake -S . -B build -DCMAKE_BUILD_TYPE=%@ %@ %@\n", buildType, cmakeFlags, cmakeArgs];
    [script appendString:@"cd build || exit 1\n"];
    [script appendString:@"make -j8\n"];

    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"cmakeBuild"
                                summary:[process[@"success"] boolValue] ? @"[Plugin] cmake successfully" : @"[Plugin] cmake failed."
                               metadata:@{@"path": projectDir, @"shellScript": script}];
}

- (NSDictionary *)qmakeBuild:(NSDictionary *)params
{
    NSDictionary *dirValidation = [self validatedPath:params[@"projectDir"] label:@"projectDir" absolute:NO relative:NO];
    if (![dirValidation[@"ok"] boolValue]) {
        return [self errorOperation:@"qmakeBuild" message:dirValidation[@"message"] metadata:nil];
    }

    NSString *projectDir = dirValidation[@"value"];
    NSDictionary *projectFileValidation = [self validatedPath:params[@"projectFile"] ?: [[self stringValue:params[@"projectTarget"]] stringByAppendingString:@".pro"]
                                                       label:@"projectFile"
                                                    absolute:NO
                                                    relative:YES];
    if (![projectFileValidation[@"ok"] boolValue]) {
        return [self errorOperation:@"qmakeBuild" message:projectFileValidation[@"message"] metadata:@{@"path": projectDir}];
    }

    NSString *projectFile = projectFileValidation[@"value"];
    NSString *buildType = [self stringValue:params[@"buildType"]];
    NSString *qmakeArgs = [self stringValue:params[@"qmakeArgs"]];
    NSString *makeArgs = [self stringValue:params[@"makeArgs"]];
    if (buildType.length == 0) {
        buildType = @"Debug";
    }

    NSString *qtVersion = @"6.11.0";
    NSString *qtPlatformDir = [NSHomeDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"Qt/%@/macos", qtVersion]];
    NSString *configArg = [[buildType lowercaseString] isEqualToString:@"release"] ? @"CONFIG+=release" : @"CONFIG+=debug";

    NSMutableString *script = [NSMutableString string];
    [script appendString:@"set -euo pipefail\n"];
    [script appendFormat:@"export QTDIR=%@\n", [self shellQuote:qtPlatformDir]];
    [script appendString:@"export PATH=\"$QTDIR/bin:/usr/local/qt6/bin:/usr/local/bin:/bin:/usr/bin:$PATH\"\n"];
    [script appendFormat:@"cd %@ || exit 1\n", [self shellQuote:projectDir]];
    [script appendString:@"mkdir -p build\ncd build || exit 1\n"];
    [script appendFormat:@"qmake ../%@ %@ %@\n", [self shellQuote:projectFile], configArg, qmakeArgs];
    [script appendFormat:@"make -j8 %@\n", makeArgs];

    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"qmakeBuild"
                                summary:[process[@"success"] boolValue] ? @"[Plugin] QMake project built successfully." : @"[Plugin] QMake project build failed."
                               metadata:@{@"path": projectDir, @"shellScript": script}];
}

- (NSDictionary *)checkWithGcc:(NSDictionary *)params
{
    NSString *arch = [self stringValue:params[@"arch"]];
    NSString *script = @"set -euo pipefail\nwhich gcc\necho \"=== GCC Version Information ===\"\ngcc --version 2>&1 || true\necho \"=== G++ Version Information ===\"\ng++ --version 2>&1 || echo \"G++ not found\"\necho \"=== Architecture Detection ===\"\nuname -m\narch\necho \"=== Native Target Detection ===\"\ngcc -dumpmachine\ngcc -dumpversion\n";
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"checkWithGcc"
                                summary:[process[@"success"] boolValue] ? @"[Plugin] GCC Detection completed successfully" : @"[Plugin] GCC Detection FAILED"
                               metadata:@{@"path": @"gcc", @"arch": arch ?: @"", @"shellScript": script}];
}

- (NSDictionary *)gccSettings:(NSDictionary *)params
{
    NSString *compiler = [self stringValue:params[@"compiler"]];
    if (compiler.length == 0) {
        compiler = @"gcc";
    }
    NSString *script = [NSString stringWithFormat:
                        @"set -euo pipefail\n"
                        @"echo \"=== Version Information ===\"\n"
                        @"%@ --version 2>&1 || echo \"Version info not available\"\n"
                        @"echo \"=== Compiler Flags Detection ===\"\n"
                        @"%@ -dM -E -x c /dev/null 2>&1 | grep -i __STDC_VERSION__ || true\n"
                        @"%@ -print-search-dirs 2>&1 || true\n"
                        @"%@ -dumpmachine || true\n"
                        @"%@ -dumpversion || true\n",
                        compiler, compiler, compiler, compiler, compiler];
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"gccSettings"
                                summary:[process[@"success"] boolValue] ? @"[Plugin] GCC Settings Detection completed successfully" : @"[Plugin] GCC Settings Detection FAILED"
                               metadata:@{@"path": compiler, @"compiler": compiler, @"shellScript": script}];
}

- (NSDictionary *)getGccInfo:(NSDictionary *)params
{
    NSString *compiler = [self stringValue:params[@"compiler"]];
    if (compiler.length == 0) {
        compiler = @"gcc";
    }
    NSString *script = [NSString stringWithFormat:
                        @"set -euo pipefail\n"
                        @"echo \"=== Basic Version Information ===\"\n"
                        @"%@ --version 2>&1 || true\n"
                        @"echo \"=== Compiler Location ===\"\n"
                        @"which %@ || true\n"
                        @"echo \"=== Target Architecture ===\"\n"
                        @"%@ -dumpmachine 2>&1 || true\n"
                        @"echo \"=== Compiler Version ===\"\n"
                        @"%@ -dumpversion 2>&1 || true\n",
                        compiler, compiler, compiler, compiler];
    NSDictionary *process = [self runProcess:@"/bin/bash" arguments:@[@"-lc", script] currentDirectory:nil];
    return [self buildResultWithProcess:process
                              operation:@"getGccInfo"
                                summary:[process[@"success"] boolValue] ? @"[Plugin] Basic GCC Info completed successfully" : @"[Plugin] Basic GCC Info FAILED"
                               metadata:@{@"path": compiler, @"compiler": compiler, @"shellScript": script}];
}

#pragma mark - HTTP handlers

- (NSDictionary *)fetchData:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"fetchData" message:@"URL is required" metadata:nil];
    }

    NSDictionary *response = [self sendRequestToURL:urlString
                                             method:@"GET"
                                            headers:[self dictionaryValue:params[@"headers"]]
                                               body:nil];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"fetchData" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSString *body = [self stringValue:response[@"body"]];
    NSString *saveToFile = [self stringValue:params[@"saveToFile"]];
    if (saveToFile.length > 0) {
        [body writeToFile:saveToFile atomically:YES encoding:NSUTF8StringEncoding error:nil];
    }

    NSDictionary *result = @{
        @"status": response[@"statusCode"] ?: @0,
        @"contentLength": @(body.length),
        @"content": body,
        @"headers": response[@"headers"] ?: @{}
    };
    return [self successOperation:@"fetchData" data:result metadata:@{@"operation": @"fetchData", @"url": urlString}];
}

- (NSDictionary *)postData:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"postData" message:@"URL is required" metadata:nil];
    }

    NSDictionary *headersInput = [self dictionaryValue:params[@"headers"]];
    NSMutableDictionary *headers = [NSMutableDictionary dictionaryWithDictionary:headersInput];
    if (!headers[@"Content-Type"]) {
        headers[@"Content-Type"] = @"application/json";
    }
    NSString *body = [self bodyStringFromValue:params[@"data"]];
    NSDictionary *response = [self sendRequestToURL:urlString method:@"POST" headers:headers body:body];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"postData" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSDictionary *result = @{
        @"status": response[@"statusCode"] ?: @0,
        @"statusText": response[@"statusText"] ?: @"",
        @"response": response[@"body"] ?: @""
    };
    return [self successOperation:@"postData" data:result metadata:@{@"url": urlString}];
}

- (NSDictionary *)fetchJSON:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"fetchJSON" message:@"URL is required" metadata:nil];
    }

    NSMutableDictionary *headers = [NSMutableDictionary dictionaryWithDictionary:[self dictionaryValue:params[@"headers"]]];
    headers[@"Accept"] = @"application/json";
    NSDictionary *response = [self sendRequestToURL:urlString method:@"GET" headers:headers body:nil];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"fetchJSON" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSData *bodyData = [[self stringValue:response[@"body"]] dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error = nil;
    id json = bodyData ? [NSJSONSerialization JSONObjectWithData:bodyData options:0 error:&error] : nil;
    if (!json || error) {
        return [self errorOperation:@"fetchJSON"
                            message:[NSString stringWithFormat:@"Failed to parse JSON response: %@", error.localizedDescription ?: @"Unknown error"]
                           metadata:@{@"url": urlString}];
    }

    NSString *saveToFile = [self stringValue:params[@"saveToFile"]];
    if (saveToFile.length > 0) {
        NSString *pretty = [self stringFromJSONObject:json pretty:YES];
        [pretty writeToFile:saveToFile atomically:YES encoding:NSUTF8StringEncoding error:nil];
    }

    NSDictionary *result = @{
        @"status": response[@"statusCode"] ?: @0,
        @"data": json
    };
    return [self successOperation:@"fetchJSON" data:result metadata:@{@"url": urlString}];
}

- (NSDictionary *)downloadFile:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"downloadFile" message:@"URL is required" metadata:nil];
    }

    NSString *destination = [self stringValue:params[@"destination"]];
    if (destination.length == 0) {
        NSString *filename = [[NSURL URLWithString:urlString].lastPathComponent length] > 0 ? [NSURL URLWithString:urlString].lastPathComponent : @"download.txt";
        destination = [[self tempPath] stringByAppendingPathComponent:filename];
    }

    NSDictionary *response = [self sendRequestToURL:urlString method:@"GET" headers:@{} body:nil];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"downloadFile" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSString *body = [self stringValue:response[@"body"]];
    NSError *error = nil;
    BOOL saved = [body writeToFile:destination atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (!saved) {
        return [self errorOperation:@"downloadFile" message:@"Failed to download file" metadata:@{@"url": urlString, @"path": destination}];
    }

    BOOL exists = [[NSFileManager defaultManager] fileExistsAtPath:destination];
    NSDictionary *attributes = exists ? [[NSFileManager defaultManager] attributesOfItemAtPath:destination error:nil] : @{};
    unsigned long long size = [attributes[NSFileSize] unsignedLongLongValue];
    NSDictionary *result = @{
        @"message": @"File downloaded successfully",
        @"path": destination,
        @"size": @(size),
        @"exists": @(exists)
    };
    return [self successOperation:@"downloadFile" data:result metadata:@{@"url": urlString, @"path": destination}];
}

- (NSDictionary *)apiRequest:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"apiRequest" message:@"URL is required" metadata:nil];
    }

    NSString *method = [[self stringValue:params[@"method"]] uppercaseString];
    if (method.length == 0) {
        method = @"GET";
    }

    NSString *body = [self bodyStringFromValue:params[@"data"]];
    NSDictionary *response = [self sendRequestToURL:urlString
                                             method:method
                                            headers:[self dictionaryValue:params[@"headers"]]
                                               body:body];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"apiRequest" message:response[@"message"] metadata:@{@"url": urlString, @"method": method}];
    }

    NSDictionary *result = @{
        @"status": response[@"statusCode"] ?: @0,
        @"statusText": response[@"statusText"] ?: @"",
        @"headers": response[@"headers"] ?: @{},
        @"body": response[@"body"] ?: @""
    };
    return [self successOperation:@"apiRequest" data:result metadata:@{@"url": urlString, @"method": method}];
}

- (NSDictionary *)scrapeWebpage:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"scrapeWebpage" message:@"URL is required" metadata:nil];
    }

    NSDictionary *response = [self sendRequestToURL:urlString method:@"GET" headers:[self dictionaryValue:params[@"headers"]] body:nil];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"scrapeWebpage" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSString *html = [self stringValue:response[@"body"]];
    NSString *plainText = [self stripHTML:html];
    NSDictionary *result = @{
        @"url": urlString,
        @"title": [self extractTitleFromHTML:html],
        @"content": plainText,
        @"contentLength": @(plainText.length)
    };
    return [self successOperation:@"scrapeWebpage" data:result metadata:@{@"url": urlString}];
}

- (NSDictionary *)checkStatus:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"checkStatus" message:@"URLs array is required" metadata:nil];
    }

    NSDictionary *response = [self sendRequestToURL:urlString method:@"HEAD" headers:[self dictionaryValue:params[@"headers"]] body:nil];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"checkStatus" message:response[@"message"] metadata:@{@"url": urlString}];
    }

    NSDictionary *result = @{
        @"url": urlString,
        @"status": response[@"statusCode"] ?: @0,
        @"statusText": response[@"statusText"] ?: @"",
        @"headers": response[@"headers"] ?: @{}
    };
    return [self successOperation:@"checkStatus" data:result metadata:@{@"url": urlString}];
}

- (NSDictionary *)webhookCall:(NSDictionary *)params
{
    NSString *urlString = [self stringValue:params[@"url"] ?: params[@"webhookUrl"]];
    if (urlString.length == 0) {
        return [self errorOperation:@"webhookCall" message:@"Webhook URL is required" metadata:nil];
    }

    NSString *method = [[self stringValue:params[@"method"]] uppercaseString];
    if (method.length == 0) {
        method = @"POST";
    }
    if (!([method isEqualToString:@"POST"] || [method isEqualToString:@"PUT"])) {
        return [self errorOperation:@"webhookCall" message:@"Webhook method must be POST or PUT" metadata:@{@"url": urlString}];
    }

    NSDictionary *response = [self sendRequestToURL:urlString
                                             method:method
                                            headers:[self dictionaryValue:params[@"headers"]]
                                               body:[self bodyStringFromValue:params[@"body"] ?: params[@"data"]]];
    if (![response[@"success"] boolValue]) {
        return [self errorOperation:@"webhookCall" message:response[@"message"] metadata:@{@"url": urlString, @"method": method}];
    }

    NSDictionary *result = @{
        @"url": urlString,
        @"method": method,
        @"status": response[@"statusCode"] ?: @0,
        @"response": response[@"body"] ?: @""
    };
    return [self successOperation:@"webhookCall" data:result metadata:@{@"url": urlString, @"method": method}];
}

#pragma mark - Lower-level helpers

- (NSDictionary *)buildResultWithProcess:(NSDictionary *)process
                               operation:(NSString *)operation
                                 summary:(NSString *)summary
                                metadata:(NSDictionary *)metadata
{
    NSString *stdout = [self stringValue:process[@"stdout"]];
    NSString *stderr = [self stringValue:process[@"stderr"]];
    NSString *text = [NSString stringWithFormat:@"%@\n%@%@",
                      summary ?: @"",
                      stdout,
                      stderr.length > 0 ? [NSString stringWithFormat:@"\nErrors and Warnings:\n%@", stderr] : @""];

    NSMutableDictionary *fullMetadata = [NSMutableDictionary dictionaryWithDictionary:metadata ?: @{}];
    fullMetadata[@"stdout"] = stdout ?: @"";
    fullMetadata[@"stderr"] = stderr ?: @"";
    fullMetadata[@"operation"] = operation ?: @"";
    fullMetadata[@"success"] = process[@"success"] ?: @NO;

    if (![process[@"success"] boolValue]) {
        return [self errorEnvelope:text metadata:fullMetadata];
    }

    return [self successEnvelopeForData:@{
        @"text": text,
        @"stdout": stdout ?: @"",
        @"stderr": stderr ?: @""
    } metadata:fullMetadata];
}

- (NSDictionary *)runProcess:(NSString *)launchPath
                    arguments:(NSArray *)arguments
             currentDirectory:(NSString *)currentDirectory
{
    NSTask *task = [[NSTask alloc] init];
    task.launchPath = launchPath;
    task.arguments = arguments ?: @[];
    if (currentDirectory.length > 0) {
        task.currentDirectoryPath = currentDirectory;
    }

    NSPipe *stdoutPipe = [NSPipe pipe];
    NSPipe *stderrPipe = [NSPipe pipe];
    task.standardOutput = stdoutPipe;
    task.standardError = stderrPipe;

    @try {
        [task launch];
        [task waitUntilExit];
    } @catch (NSException *exception) {
        return @{
            @"success": @NO,
            @"stdout": @"",
            @"stderr": exception.reason ?: @"Failed to launch process",
            @"metadata": @{}
        };
    }

    NSData *stdoutData = [[stdoutPipe fileHandleForReading] readDataToEndOfFile];
    NSData *stderrData = [[stderrPipe fileHandleForReading] readDataToEndOfFile];
    NSString *stdout = [[NSString alloc] initWithData:stdoutData encoding:NSUTF8StringEncoding] ?: @"";
    NSString *stderr = [[NSString alloc] initWithData:stderrData encoding:NSUTF8StringEncoding] ?: @"";

    return @{
        @"success": @(task.terminationStatus == 0),
        @"stdout": stdout,
        @"stderr": stderr,
        @"metadata": @{
            @"terminationStatus": @(task.terminationStatus)
        }
    };
}

- (NSDictionary *)sendRequestToURL:(NSString *)urlString
                            method:(NSString *)method
                           headers:(NSDictionary *)headers
                              body:(NSString *)body
{
    NSURL *url = [NSURL URLWithString:urlString];
    if (!url) {
        return @{@"success": @NO, @"message": @"Invalid URL"};
    }

    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    request.HTTPMethod = method ?: @"GET";
    for (NSString *key in headers) {
        [request setValue:[self stringValue:headers[key]] forHTTPHeaderField:key];
    }
    if (body.length > 0) {
        request.HTTPBody = [body dataUsingEncoding:NSUTF8StringEncoding];
    }

    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSData *responseData = nil;
    __block NSURLResponse *response = nil;
    __block NSError *requestError = nil;

    NSURLSessionDataTask *task =
    [[NSURLSession sharedSession] dataTaskWithRequest:request
                                    completionHandler:^(NSData *data, NSURLResponse *urlResponse, NSError *error) {
        responseData = data;
        response = urlResponse;
        requestError = error;
        dispatch_semaphore_signal(semaphore);
    }];

    [task resume];
    dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);

    if (requestError) {
        return @{
            @"success": @NO,
            @"message": [NSString stringWithFormat:@"%@ request failed: %@", method ?: @"HTTP", requestError.localizedDescription]
        };
    }

    NSHTTPURLResponse *httpResponse = [response isKindOfClass:[NSHTTPURLResponse class]] ? (NSHTTPURLResponse *)response : nil;
    NSString *bodyString = responseData ? [[NSString alloc] initWithData:responseData encoding:NSUTF8StringEncoding] : @"";
    NSInteger statusCode = httpResponse.statusCode;

    if (statusCode >= 400) {
        return @{
            @"success": @NO,
            @"message": [NSString stringWithFormat:@"HTTP %ld: %@", (long)statusCode, [NSHTTPURLResponse localizedStringForStatusCode:statusCode]]
        };
    }

    return @{
        @"success": @YES,
        @"statusCode": @(statusCode),
        @"statusText": [NSHTTPURLResponse localizedStringForStatusCode:statusCode],
        @"headers": httpResponse.allHeaderFields ?: @{},
        @"body": bodyString ?: @""
    };
}

- (NSString *)bodyStringFromValue:(id)value
{
    if ([value isKindOfClass:[NSString class]]) {
        return (NSString *)value;
    }
    if ([value isKindOfClass:[NSDictionary class]] || [value isKindOfClass:[NSArray class]]) {
        return [self stringFromJSONObject:value pretty:NO];
    }
    return @"";
}

- (NSString *)stringFromJSONObject:(id)object pretty:(BOOL)pretty
{
    if (!object) {
        return @"";
    }

    if ([object isKindOfClass:[NSString class]]) {
        return (NSString *)object;
    }

    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:object options:(pretty ? NSJSONWritingPrettyPrinted : 0) error:&error];
    if (!data || error) {
        return @"{}";
    }

    return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"{}";
}

- (NSString *)shellQuote:(NSString *)value
{
    NSString *text = value ?: @"";
    return [NSString stringWithFormat:@"'%@'", [text stringByReplacingOccurrencesOfString:@"'" withString:@"'\"'\"'"]];
}

- (NSString *)shellInvocationForCommand:(NSString *)command parameters:(NSArray *)parameters
{
    NSMutableString *invocation = [NSMutableString stringWithString:command ?: @""];
    for (id parameter in parameters) {
        [invocation appendFormat:@" %@", [self shellQuote:[self stringValue:parameter]]];
    }
    return invocation;
}

- (NSDictionary *)loadNamedJSONResource:(NSString *)name directory:(NSString *)relativeDirectory
{
    NSString *directoryPath = [self.sdkRootPath stringByAppendingPathComponent:relativeDirectory];
    NSArray *candidates = @[
        [directoryPath stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.json", name]],
        [directoryPath stringByAppendingPathComponent:[NSString stringWithFormat:@"%@.json", [self snakeCase:name]]]
    ];

    NSFileManager *manager = [NSFileManager defaultManager];
    for (NSString *candidate in candidates) {
        if ([manager fileExistsAtPath:candidate]) {
            NSData *data = [NSData dataWithContentsOfFile:candidate];
            if (!data) {
                continue;
            }
            id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
            if ([json isKindOfClass:[NSDictionary class]]) {
                return (NSDictionary *)json;
            }
        }
    }

    NSDirectoryEnumerator *enumerator = [manager enumeratorAtPath:directoryPath];
    NSString *entry = nil;
    NSString *desired = [self normalizedLookupName:name];
    while ((entry = [enumerator nextObject])) {
        if (![[entry pathExtension] isEqualToString:@"json"]) {
            continue;
        }
        NSString *basename = [[entry lastPathComponent] stringByDeletingPathExtension];
        if ([[self normalizedLookupName:basename] isEqualToString:desired]) {
            NSString *fullPath = [directoryPath stringByAppendingPathComponent:entry];
            NSData *data = [NSData dataWithContentsOfFile:fullPath];
            id json = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
            if ([json isKindOfClass:[NSDictionary class]]) {
                return (NSDictionary *)json;
            }
        }
    }

    return nil;
}

- (NSString *)normalizedLookupName:(NSString *)value
{
    NSString *lower = [[self stringValue:value] lowercaseString];
    NSCharacterSet *trimSet = [[NSCharacterSet alphanumericCharacterSet] invertedSet];
    NSArray *parts = [lower componentsSeparatedByCharactersInSet:trimSet];
    NSMutableString *result = [NSMutableString string];
    for (NSString *part in parts) {
        if (part.length > 0) {
            [result appendString:part];
        }
    }
    return result;
}

- (NSString *)snakeCase:(NSString *)value
{
    NSMutableString *result = [NSMutableString string];
    NSString *text = [self stringValue:value];
    for (NSUInteger index = 0; index < text.length; index += 1) {
        unichar character = [text characterAtIndex:index];
        if ([[NSCharacterSet uppercaseLetterCharacterSet] characterIsMember:character] && index > 0) {
            [result appendString:@"_"];
        }
        [result appendFormat:@"%C", (unichar)tolower(character)];
    }
    return result;
}

- (NSString *)stripHTML:(NSString *)html
{
    NSError *error = nil;
    NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"<[^>]+>" options:0 error:&error];
    if (!regex || error) {
        return html ?: @"";
    }
    NSString *withoutTags = [regex stringByReplacingMatchesInString:html ?: @""
                                                            options:0
                                                              range:NSMakeRange(0, (html ?: @"").length)
                                                       withTemplate:@" "];
    NSArray *parts = [withoutTags componentsSeparatedByCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    NSPredicate *predicate = [NSPredicate predicateWithBlock:^BOOL(NSString *evaluatedObject, NSDictionary *bindings) {
        return evaluatedObject.length > 0;
    }];
    return [[parts filteredArrayUsingPredicate:predicate] componentsJoinedByString:@" "];
}

- (NSString *)extractTitleFromHTML:(NSString *)html
{
    if (html.length == 0) {
        return @"";
    }
    NSRange startRange = [html rangeOfString:@"<title>" options:NSCaseInsensitiveSearch];
    NSRange endRange = [html rangeOfString:@"</title>" options:NSCaseInsensitiveSearch];
    if (startRange.location == NSNotFound || endRange.location == NSNotFound || endRange.location <= NSMaxRange(startRange)) {
        return @"";
    }
    NSRange titleRange = NSMakeRange(NSMaxRange(startRange), endRange.location - NSMaxRange(startRange));
    return [[html substringWithRange:titleRange] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

@end
