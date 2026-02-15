// Created at 2026-01-01 05:24:02
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { BrowserWindow, IpcMainInvokeEvent, ipcMain } from "electron";

let httpServer: Server | null = null;
let serverPort = 8787;

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number;
    method: string;
    params?: any;
}

interface JsonRpcResponse {
    jsonrpc: "2.0";
    id?: string | number;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

interface McpTool {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

// MCP Tools
const tools: McpTool[] = [
    {
        name: "evaluate_javascript",
        description: "Execute JavaScript code in Discord's context",
        inputSchema: {
            type: "object",
            properties: {
                code: {
                    type: "string",
                    description: "JavaScript code to execute"
                }
            },
            required: ["code"]
        }
    },
    {
        name: "get_store",
        description: "Get a Discord Flux store by name",
        inputSchema: {
            type: "object",
            properties: {
                storeName: {
                    type: "string",
                    description: "Name of the store (e.g., 'UserStore', 'GuildStore')"
                }
            },
            required: ["storeName"]
        }
    },
    {
        name: "get_store_method",
        description: "Call a method on a Discord store",
        inputSchema: {
            type: "object",
            properties: {
                storeName: {
                    type: "string",
                    description: "Name of the store"
                },
                methodName: {
                    type: "string",
                    description: "Name of the method to call"
                },
                args: {
                    type: "array",
                    description: "Arguments to pass to the method",
                    items: {}
                }
            },
            required: ["storeName", "methodName"]
        }
    },
    {
        name: "find_webpack_module",
        description: "Find a webpack module by props or code",
        inputSchema: {
            type: "object",
            properties: {
                props: {
                    type: "array",
                    description: "Property names to search for",
                    items: { type: "string" }
                },
                code: {
                    type: "string",
                    description: "Code string to search for"
                }
            }
        }
    },
    {
        name: "find_variable",
        description: "Recursively search for a variable name (case-insensitive partial match) in document.*",
        inputSchema: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Part of variable name to search for (case-insensitive)"
                },
                maxDepth: {
                    type: "number",
                    description: "Maximum recursion depth (default: 5)",
                    default: 5
                }
            },
            required: ["name"]
        }
    },
    {
        name: "inspect_element",
        description: "Inspect a DOM element using a CSS selector (like querySelector) and return detailed metadata including XPath, attributes, children, parents, computed styles, and position information",
        inputSchema: {
            type: "object",
            properties: {
                selector: {
                    type: "string",
                    description: "CSS selector string to find the element (e.g., '#myId', '.myClass', 'div > button', etc.)"
                }
            },
            required: ["selector"]
        }
    }
];

function sendJsonRpcResponse(res: ServerResponse, response: JsonRpcResponse) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
}

function sendJsonRpcError(res: ServerResponse, id: string | number | undefined, code: number, message: string, data?: any) {
    sendJsonRpcResponse(res, {
        jsonrpc: "2.0",
        id,
        error: { code, message, data }
    });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
    console.log(`[DiscordMCP] ${req.method} ${req.url}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        console.log(`[DiscordMCP] OPTIONS request handled`);
        res.writeHead(200);
        res.end();
        return;
    }

    // Simple health check endpoint
    if (req.method === "GET" && (req.url === "/" || !req.url || req.url === "")) {
        console.log(`[DiscordMCP] GET / health check`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "ok",
            service: "discord-mcp",
            version: "1.0.0",
            protocol: "MCP over HTTP"
        }));
        return;
    }

    if (req.method !== "POST") {
        sendJsonRpcError(res, null, -32600, "Invalid Request", "Only POST method is allowed");
        return;
    }

    let body = "";
    req.on("data", chunk => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            const request: JsonRpcRequest = JSON.parse(body);

            if (request.jsonrpc !== "2.0") {
                sendJsonRpcError(res, request.id, -32600, "Invalid Request", "jsonrpc must be '2.0'");
                return;
            }

            let result: any;

            switch (request.method) {
                case "initialize":
                    result = {
                        protocolVersion: "2024-11-05",
                        capabilities: {
                            tools: {}
                        },
                        serverInfo: {
                            name: "discord-mcp",
                            version: "1.0.0"
                        }
                    };
                    break;

                case "tools/list":
                    result = {
                        tools
                    };
                    break;

                case "tools/call":
                    {
                        const { name, arguments: args } = request.params || {};
                        if (!name) {
                            sendJsonRpcError(res, request.id, -32602, "Invalid params", "tool name is required");
                            return;
                        }

                        // Execute tool in renderer process via webContents.executeJavaScript
                        try {
                            const windows = BrowserWindow.getAllWindows();
                            if (windows.length === 0) {
                                sendJsonRpcError(res, request.id, -32000, "Internal error", "No renderer window available");
                                return;
                            }

                            const webContents = windows[0].webContents;
                            const toolName = JSON.stringify(name);
                            const toolArgs = JSON.stringify(args || {});

                            // Execute tool handler in renderer context
                            const responseStr = await webContents.executeJavaScript(`
                                (async () => {
                                    if (typeof window.__discordMCPHandleTool !== 'function') {
                                        return JSON.stringify({ error: 'Tool handler not available' });
                                    }
                                    try {
                                        const response = await window.__discordMCPHandleTool(${toolName}, ${toolArgs});
                                        return JSON.stringify(response);
                                    } catch (error) {
                                        return JSON.stringify({ error: error.message || String(error) });
                                    }
                                })()
                            `);

                            const response = JSON.parse(responseStr);
                            if (response.error) {
                                sendJsonRpcError(res, request.id, -32000, "Internal error", response.error);
                                return;
                            }

                            result = {
                                content: [
                                    {
                                        type: "text",
                                        text: typeof response.result === "string" ? response.result : JSON.stringify(response.result, null, 2)
                                    }
                                ]
                            };
                        } catch (error: any) {
                            sendJsonRpcError(res, request.id, -32000, "Internal error", error.message);
                            return;
                        }
                    }
                    break;

                default:
                    sendJsonRpcError(res, request.id, -32601, "Method not found", `Unknown method: ${request.method}`);
                    return;
            }

            sendJsonRpcResponse(res, {
                jsonrpc: "2.0",
                id: request.id,
                result
            });
        } catch (error: any) {
            sendJsonRpcError(res, null, -32700, "Parse error", error.message);
        }
    });
}

export async function startServer(_event: IpcMainInvokeEvent, port: number) {
    if (httpServer) {
        await stopServer(_event);
    }

    serverPort = port;
    httpServer = createServer(handleRequest);

    return new Promise<void>((resolve, reject) => {
        httpServer!.listen(port, "127.0.0.1", () => {
            const address = httpServer!.address();
            console.log(`[DiscordMCP] Server started on http://127.0.0.1:${port}`);
            console.log(`[DiscordMCP] Server address:`, address);
            resolve();
        });

        httpServer!.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                reject(new Error(`Port ${port} is already in use`));
            } else {
                console.error(`[DiscordMCP] Server error:`, error);
                reject(error);
            }
        });
    });
}

export async function stopServer(_event: IpcMainInvokeEvent) {
    if (!httpServer) {
        return;
    }

    return new Promise<void>((resolve) => {
        httpServer!.close(() => {
            httpServer = null;
            resolve();
        });
    });
}

// so we can filter the native helpers by this key
export function discordMCPUniqueIdThingyIdkMan() { }
