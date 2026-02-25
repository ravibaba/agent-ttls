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
            // We must map it dynamically since LangGraph expects the input schema to strictly match 
            // the z.object parameter that the LLM sends back.
            // Build a dynamic Zod schema from the MCP inputSchema
            const schemaProps: Record<string, z.ZodTypeAny> = {};
            const inputSchema = mcpTool.inputSchema as any;
            
            if (inputSchema && inputSchema.properties) {
                for (const key of Object.keys(inputSchema.properties)) {
                    schemaProps[key] = z.any(); // We just need the keys to satisfy OpenAI
                }
            }
            
            // OpenAI requires type: "object"
            const s = z.object(schemaProps);

            return tool(
                async (input: any) => {
                    const result = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: input
                    });
                    
                    // The MCP protocol returns content as an array of items (text, image, etc).
                    // We extract just the text block to feed back to the LLM as a plain string.
                    if (result.isError) {
                         return `Error: ${JSON.stringify(result.content)}`;
                    }

                    const contentArray = result.content as { type: string, text?: string }[];
                    const textItem = contentArray.find((c) => c.type === 'text');
                    return textItem ? textItem.text : JSON.stringify(result.content);
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
