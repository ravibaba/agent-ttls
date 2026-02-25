import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// S (SRP): This file is solely responsible for serving tools over the network.
// It translates incoming MCP requests into local function execution and sends responses.

const app = express();
app.use(cors());

// Track active transports by session
const transports = new Map<string, SSEServerTransport>();

// Provide tools dynamically per connection
function setupServerTransport(transport: SSEServerTransport) {
    const server = new Server({
        name: "local-math-time-server",
        version: "1.0.0"
    }, {
        capabilities: { tools: {} }
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: [
                {
                    name: "calculate_math",
                    description: "Evaluates a basic math expression (e.g., '2 + 5 * 10')",
                    inputSchema: {
                        type: "object",
                        properties: { expression: { type: "string" } },
                        required: ["expression"]
                    }
                },
                {
                    name: "get_current_time",
                    description: "Returns the current local server time as a string",
                    inputSchema: {
                        type: "object",
                        properties: {
                            format: { type: "string", description: "Optional time format (unused)" }
                        },
                        required: []
                    }
                }
            ]
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        if (name === "calculate_math") {
            try {
                const result = eval(args?.expression as string);
                return { content: [{ type: "text", text: `Result: ${result}` }] };
            } catch (e) {
                return { content: [{ type: "text", text: "Error evaluating expression" }], isError: true };
            }
        }

        if (name === "get_current_time") {
            return { content: [{ type: "text", text: `The current time is ${new Date().toISOString()}` }] };
        }

        throw new Error(`Tool not found: ${name}`);
    });

    server.connect(transport);
}

// Endpoint for the client to establish the SSE stream
app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport("/message", res);
    
    // In a real app we'd map this to a session ID. 
    // Here we just keep one actively written transport for ease of CLI use.
    transports.set("default", transport);
    
    setupServerTransport(transport);
});

// Endpoint for the client to send messages to the server over POST
app.post("/message", async (req, res) => {
    const transport = transports.get("default");
    if (!transport) {
        res.status(503).send("SSE transport not initialized. Connect to /sse first");
        return;
    }
    await transport.handlePostMessage(req, res);
});

// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MCP Server running on http://localhost:${PORT}`);
    console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
    console.log(`Exposed Tools: [calculate_math, get_current_time]`);
});
