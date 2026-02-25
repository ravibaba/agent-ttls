# Agent Implementation & SOLID Principles

This document explains the core agent setup block by block, mapped to our principles.

## SOLID Principles Refresher

- **S**ingle Responsibility (SRP)
- **O**pen/Closed (OCP)
- **L**iskov Substitution (LSP)
- **I**nterface Segregation (ISP)
- **D**ependency Inversion (DIP)

## Applying to the Agent

We separate concerns in our project structure:

- `mcp/client.ts` -> Handles connection to MCP tools. (SRP: Just external tool integration)
- `persistence/mongoSaver.ts` -> Handles saving state. (SRP: Database interaction; DIP: Graph depends on a Checkpointer abstraction, not Mongo directly)
- `agent/index.ts` -> Assembles components and runs the graph.

### The Agent State

We define our `AgentState` using `@langchain/langgraph` `Annotation.Root`. This establishes what variables we track across turns. We primarily need to track `messages` (the conversation history).

```typescript
// Define what the graph remembers
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
});
```

### The Nodes

Our agent has two distinct jobs (SRP):

1. **Model Node**: Invoke the LLM with the current conversation history.
2. **Tools Node**: Execute a requested tool using the MCP client if the model asks for it.

> [!NOTE]
> We use the official `@langchain/openrouter` package and its `ChatOpenRouter` model client. This natively supports OpenRouter's tool calling quirks out of the box, without needing to hack the standard `ChatOpenAI` endpoint. We build a dynamic Zod schema to pass MCP parameters appropriately without encountering strict JSON schema validation errors.

```typescript
// Abstraction to inject the model dependency (DIP)
export function createModelNode(llm: BaseChatModel, mcpTools: any[]) {
  // Bind tools to LLM. OCP: We can add new tools to the array without changing this logic.
  const llmWithTools = llm.bindTools(mcpTools);

  return async (state: typeof AgentState.State) => {
    const response = await llmWithTools.invoke(state.messages);
    // Return array of new message to be appended to state
    return { messages: [response] };
  };
}
```

### Routing Logic

We need to conditionally decide the edge leaving the Model node. If the LLM returned a `tool_calls` request, we must route to the tool execution node. Otherwise, the conversation turn is complete.

```typescript
export function shouldContinue(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (
    lastMessage.additional_kwargs?.tool_calls?.length ||
    (lastMessage as AIMessage).tool_calls?.length
  ) {
    return "tools"; // Edge transition to tool node
  }
  return "__end__"; // Edge transition to End
}
```

### Graph Assembly

Finally we build the graph, inject our checkpointer (Mongo) and compile.

```typescript
export function buildAgent(
  llm: BaseChatModel,
  mcpTools: any[],
  checkpointer: BaseCheckpointSaver,
) {
  const graphBuilder = new StateGraph(AgentState)
    .addNode("model", createModelNode(llm, mcpTools))
    // LangChain has a built in ToolNode we can use for standard tool execution
    .addNode("tools", new ToolNode(mcpTools))
    .addEdge("__start__", "model")
    .addConditionalEdges("model", shouldContinue)
    .addEdge("tools", "model"); // After tools run, return to model

  return graphBuilder.compile({ checkpointer });
}
```
