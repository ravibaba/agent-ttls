# Creating a Local MCP Server

In the previous sections, we built the LangGraph Agent (`src/index.ts`) which acts as the **Client**, fetching tools from an MCP source. Now, we are building the **Server** (`src/mcp-server.ts`).

## The Concept

Imagine a restaurant.

- The **Client** (our LangGraph Agent) is the Head Chef requesting ingredients.
- The **Server** (our MCP Server) is the pantry manager fulfilling those requests.

They need a way to communicate continuously. We use **SSE (Server-Sent Events)**. Instead of a standard request-response (like calling a waiter once), the Chef opens an ongoing radio channel (`/sse`) to easily receive updates, and sends immediate requests over a secondary line (`/message` POST).

## Line by Line Breakdown

### 1. Initialization

```typescript
const app = express();
const server = new Server(
  {
    name: "local-math-time-server",
    version: "1.0.0",
  },
  { capabilities: { tools: {} } },
);
```

We start a typical Express web server, but we also boot up an MCP SDK `Server` instance. We explicitly define that this server has the `{ tools }` capability.

### 2. Defining Tools (ListTools)

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => { ... }
```

When the LangGraph client connects, the first thing it asks is: _"What tools do you have?"_ (It triggers `listTools()` on the client side, which hits this handler on the server side).
We return a **JSON Schema** definition of our tools. This exactly mirrors the **Liskov Substitution Principle**: as long as we define our inputs/outputs via standard schema, the LangGraph client can use them seamlessly using `zod` record mapping.

### 3. Executing Tools (CallTool)

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    // Check request.params.name
    // Perform Logic
    // Return { content: [{ type: "text", text: String }] }
}
```

When the LLM decides to use `calculate_math`, the client sends a `CallTool` request containing the arguments.
Notice **SRP (Single Responsibility Principle)** here:
The Agent logic knows _nothing_ about how to calculate math or fetch time. It pushed that responsibility over the network to this specific server file.

### 4. Transport Endpoints

```typescript
app.get("/sse", async (req, res) => {
    transport = new SSEServerTransport("/message", res);
    await server.connect(transport);
});
app.post("/message", async (req, res) => ... transport.handlePostMessage);
```

These define the physical network layer. The agent connects to `/sse`, and sends command inputs to `/message`.
