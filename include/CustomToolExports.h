// ===================================================================
//  CustomToolExports.h
//  MCPStudio - Custom Tool SDK
//
//  Created by EoF Software Labs on 2026.
//  Copyright © 2026 EoF Software Labs. All rights reserved.
// ===================================================================
#pragma once
#if defined(__APPLE__)
#define TOOL_EXPORT __attribute__((visibility("default")))
#else
#define TOOL_EXPORT
#endif
#ifdef __cplusplus
#define TOOL_EXTERN extern "C"
#else
#define TOOL_EXTERN extern
#endif
#define TOOL_API TOOL_EXTERN TOOL_EXPORT

