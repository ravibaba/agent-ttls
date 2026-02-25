import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// S (SRP): This module strictly handles MCP server communication and translating 
// it to a format the rest of our app (LangChain Tools) understands.
// O (OCP): Extending this to handle multiple transports or diverse tool payloads 
// does not require changing consumers of these tools.

export class MCPIntegration {
    private client: Client;
    private transport: SSEClientTransport;

    constructor(serverUrl: string) {
        // SSE transport is commonly used for remote or local web-based MCP
        this.transport = new SSEClientTransport(new URL(serverUrl));
        this.client = new Client({
            name: "langgraph-agent-client",
            version: "1.0.0"
        }, {
            capabilities: {} 
        });
    }

    async connect() {
        await this.client.connect(this.transport);
        console.log("Connected to MCP Server");
    }

    async buildLangchainTools() {
        // Fetch all tools exposed by the MCP Server
        const mcpTools = await this.client.listTools();

        const langchainTools = mcpTools.tools.map((mcpTool) => {
            // Convert MCP JSONSchema parameters into a Zod schema for LangChain's StructuredTool
            // Note: In real-world, a full JSONSchema to Zod converter is safer.
            // For brevity, we pass any record if we don't have a strict static map.
            const s = z.record(z.string(), z.any());

            // Wrap each MCP tool inside a LangChain standard tool function
            return tool(
                async (input: any) => {
                    const result = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: input
                    });
                    return JSON.stringify(result.content);
                },
                {
                    name: mcpTool.name,
                    description: mcpTool.description || "A tool from the MCP Server",
                    schema: s
                }
            );
        });

        return langchainTools;
    }

    async disconnect() {
        await this.transport.close();
    }
}
