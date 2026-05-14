#!/bin/bash
echo "GET /mcp HTTP/1.1\r\nHost: localhost\r\nAccept: application/json\r\nAuthorization: Bearer ${AUT_TOKEN}\r\n\r\n" | openssl s_client -connect localhost:8888  -showcerts 

