# MCP HTTP Server - EoF MCP Studio

A production-ready Model Context Protocol (MCP) server implementation 
for macOS using native Cocoa/AppKit frameworks and C++. Idea and some
techniques copied from qmcp project. Thank's ;)

## Features

**Full MCP Protocol Support** - Implements MCP specification version 2025-06-18  
**HTTP/1.1 Transport** - Native socket-based HTTP server with high concurrency  
**Three Core Services** - Tools, Resources, and Prompts  
**Native macOS Integration** - Uses Foundation/Cocoa/AppKit instead of Qt  
**MCPStudio-Friendly API** - Modern async/await MCPStudio interface  
**Thread-Safe** - Proper synchronization using GCD and mutexes  
**Zero Dependencies** - No external libraries required  

## Architecture

```
┌─────────────────────────────────────┐
│      MCPStudio Application Layer        │
│    (MCPServer.MCPStudio wrapper)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Objective-C++ Bridge Layer        │
│    (MCPServerBridge.h/.mm)          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      C++ Core Implementation        │
│  MCPServer / Services / Router      │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      HTTP Transport Layer           │
│   (BSD Sockets + GCD queues)        │
└─────────────────────────────────────┘
```

## MCP Protocol Endpoints

The server implements these JSON-RPC methods:
```
| Method           | Description                                     |
|------------------|-------------------------------------------------|
| `initialize`     | Initialize connection and exchange capabilities |
| `tools/list`     | List all available tools                        |
| `tools/call`     | Execute a specific tool                         |
| `resources/list` | List all available resources                    |
| `resources/read` | Read resource content                           |
| `prompts/list`   | List all available prompts                      |
| `prompts/get`    | Render a prompt template                        |
```

## HTTP API

### Request Format

```http
POST / HTTP/1.1
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/list",
  "params": {}
}
```

### Response Format

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {}
}
```

## Performance Characteristics

- **Concurrent Connections**: Handled via GCD concurrent queue
- **Request Processing**: Asynchronous with semaphore-based synchronization
- **Memory Management**: Automatic via ARC for ObjC and RAII for C++
- **Typical Latency**: < 5ms for simple tool calls

## License

Copyright © 2026 EoF Software Labs. All rights reserved.

## Troubleshooting

### Server fails to start

- Check if port is already in use: `lsof -i :8080`
- Verify firewall settings allow incoming connections
- Check console logs for specific error messages

### Tools not executing

- Verify tool registration completed successfully
- Check parameter formats match the input schema
- Review handler implementations for exceptions
