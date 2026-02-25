# MCP Integration Explained

The Model Context Protocol (MCP) aims to standardize how AI models communicate with tools and data sources.

## Core Concepts (with analogies)

Think of MCP as a **universal language** for appliances.
Instead of an AI needing custom adapters to talk to a Calculator, a Web Browser, and a Database (which all speak different languages), MCP creates a common plug. The AI just says "give me your MCP plug," and suddenly it knows how to use the tool.

### Line by Line Reasoning

We built `src/mcp/client.ts`:

1. **Imports:**

   ```typescript
   import { Client } from "@modelcontextprotocol/sdk/client/index.js";
   import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
   import { tool } from "@langchain/core/tools";
   ```

   We import the official SDK to handle the gritty protocol parsing. Then we import LangChain's `tool` helper. Our goal is to take an "MCP Tool" and disguise it as an "Agent Tool".

2. **Connecting to the Server:**

   ```typescript
   this.transport = new SSEClientTransport(new URL(serverUrl));
   await this.client.connect(this.transport);
   ```

   We connect using SSE (Server-Sent Events). The agent runs locally, but it might connect to a tool server running on another port or over the internet.

3. **Tool Conversion:**
   ```typescript
   const mcpTools = await this.client.listTools();
   // ... map it to ...
   return tool(
     async (input) => {
       /* call actual MCP tool */
     },
     { name, description, schema },
   );
   ```
   **Why is this important?**
   - LangChain's `bindTools` expects a specific format.
   - MCP servers provide a raw list of capabilities.
   - This block acts as an **Adapter** (a classic design pattern and crucial to **L**iskov Substitution), wrapping the MCP function in a standard LangChain Tool interface so our previous code (`index.ts`) doesn't care if the tool came from MCP or somewhere else.
