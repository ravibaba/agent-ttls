# System Architecture & Workflows

This document visualizes the high-level architecture mapped to our SOLID methodology, illustrating how the LangGraph conversational agent requests tools from the Express Model Context Protocol (MCP) server.

## 1. High-Level System Architecture

This diagram shows the complete boundary isolation between logical application modules.

```mermaid
graph TD
    User([User CLI]) --> |Inputs| AgentMgr["Agent Orchestrator\n'src/index.ts'"]
    AgentMgr --> |Compiles & Invokes| LangGraph["LangGraph Engine\n'src/agent/index.ts'"]

    subgraph Agent Backend
    LangGraph --> |Persists State| MongoSaver["Mongo Checkpoint Saver\n'src/persistence/mongoSaver.ts'"]
    LangGraph --> |Sends Prompt| LLM["ChatOpenRouter\n'@langchain/openrouter'"]
    LangGraph --> |Executes Capability| MCPClient["MCP Integration Client\n'src/mcp/client.ts'"]
    end

    MongoSaver -.-> |Read/Write| MongoDB[(MongoDB Database)]
    LLM -.-> |OpenRouter API API| OpenAI[Remote LLMs]

    subgraph Tool Context Backend
    MCPClient == "SSE Network" ==> MCPServer["MCP Tool Server\n'src/mcp-server.ts'"]
    MCPServer --> Tool1[get_current_time]
    MCPServer --> Tool2[calculate_math]
    end
```

## 2. Agent Execution Sequence

This sequence diagram depicts what happens when a User submits a prompt over the CLI that asks for specific tool-requiring information.

```mermaid
sequenceDiagram
    participant User
    participant App as LangGraph App
    participant Mongo as Checkpoint Saver
    participant API as OpenRouter AI
    participant MCP as MCP Tool Server

    User->>App: "What is the time right now?"
    App->>Mongo: Retrieve Thread ("user-session-2")
    Mongo-->>App: Return Checkpoint History
    App->>API: Invoke LLM with Messages + Available MCP Tools Schema
    API-->>App: Response [Finish Reason: tool_calls]
    Note over App: Edge Routing detects tool request
    App->>App: Transition to 'tools' Node
    App->>MCP: CallToolRequest ("get_current_time")
    MCP-->>App: Result: "2026-02-25T22:37..."
    App->>Mongo: Save Thread Checkpoint
    App->>API: Invoke LLM with Tool Result
    API-->>App: Response "The time is 22:37..."
    App->>User: "The time is 22:37..."
```

## 3. Tool Discovery and Initialization (Startup)

Before the agent can answer any questions, it must discover its capabilities at launch. This illustrates the initialization sequence mapping the MCP protocol to LangChain tools dynamically.

```mermaid
sequenceDiagram
    participant App as index.ts
    participant MCPClient as mcp/client.ts
    participant MCPServer as mcp-server.ts (Express)

    App->>MCPClient: connect()
    MCPClient->>MCPServer: Establish SSE Connection (GET /sse)
    MCPServer-->>MCPClient: SSE Active
    App->>MCPClient: buildLangchainTools()
    MCPClient->>MCPServer: POST /message (listTools capability)
    MCPServer-->>MCPClient: JSON [calculate_math, get_current_time]

    loop Dynamic Wrapper
        MCPClient->>MCPClient: Map MCP Input Schema to Zod Objects
        MCPClient->>MCPClient: Encapsulate in standard LangChain 'tool()'
    end

    MCPClient-->>App: Return StructuredTool[]
    App->>App: compileAgent(llm, tools, checkpointer)
```
