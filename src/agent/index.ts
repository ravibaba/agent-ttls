import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MongoCheckpointSaver } from "../persistence/mongoSaver.js";
import { StructuredTool } from "@langchain/core/tools";

// State Annotation (Data Structure)
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
});

// Setup Agent Node definition via Dependency Injection
export function createAgentNode(llm: BaseChatModel, tools: StructuredTool[]) {
  // OCP: Tools are bound dynamically
  const modelWithTools = (llm as any).bindTools(tools);
  return async (state: typeof AgentState.State) => {
    const result = await modelWithTools.invoke(state.messages);
    return { messages: [result] };
  };
}

// Edge Logic
export function shouldContinue(state: typeof AgentState.State): "tools" | "__end__" {
  const lastMessage = state.messages[state.messages.length - 1];
  
  // Cast safety check
  const aims = lastMessage as AIMessage;
  
  if (aims.tool_calls && aims.tool_calls.length > 0) {
    return "tools";
  }
  return END;
}

// Build Graph
export function compileAgent(
    llm: BaseChatModel, 
    tools: StructuredTool[], 
    saver?: MongoCheckpointSaver
) {
  const modelNode = createAgentNode(llm, tools);
  const toolNode = new ToolNode(tools);

  const workflow = new StateGraph(AgentState)
    .addNode("agent", modelNode)
    .addNode("tools", toolNode)
    // Edge setup
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent"); // Tools always return control to agent

  // Compile with optional checkpointer for DB persistence
  return workflow.compile({ checkpointer: saver as any });
}
