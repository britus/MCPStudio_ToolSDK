# EoF MCP Studio

This is a implementation of the Model Context Protocol (MCP) server 
for macOS using AppKit and Cocoa SDK, Swift and SwiftUI.

## Features Implemented

- Full MCP protocol implementation (version 2025-06-18)
- HTTP transport layer
- Three core services: Tools, Resources, Prompts
- Configuration-driven startup
- Flexible tool registration
- Middleware support
- Session management
- Subscription notifications

## Getting Started

- Recommended
[Read MCP Server in depth before starting](README-MCPServer.md)

1. Build the project using Xcode
2. Run the application to start the MCP server
3. The server will automatically load configuration from the application directory

## Configuration

The configuration is exported to the app bundle settings directory:
```
- Tools     : `Tools/` directory
- Resources : `Resources/` directory  
- Prompts   : `Prompts/` directory
```

## Custom Tool Scripting

- Recommended
[Read scripting documentation before starting](README-Scripting.md)

## Custom Tool Plugins

- Recommended
[Read sample plugin documentation before starting](README-SamplePlugin.md)
