import { ChatOpenAI } from "@langchain/openai"; // Sometimes used as base for OpenRouter depending on package
// We'll use the official ChatOpenAI class but configured for OpenRouter's URL
import { MongoClient } from "mongodb";
import { compileAgent } from "./agent/index.js";
import { MCPIntegration } from "./mcp/client.js";
import { MongoCheckpointSaver } from "./persistence/mongoSaver.js";
import * as dotenv from "dotenv";
import * as readline from "readline/promises";
import { HumanMessage } from "@langchain/core/messages";

dotenv.config();

import { ChatOpenRouter } from "@langchain/openrouter";

// S: The main file's single responsibility is orchestrating and starting everything
// D: It creates the DB connections and Models, injecting them downwards (DIP)

async function main() {
    console.log("Starting LangGraph + MCP Conversational Agent...");

    // 1. Dependency: Database Checkpointer
    const mongoUri = process.env.MONGO_URI || "mongodb://admin:password@localhost:27017";
    const dbClient = new MongoClient(mongoUri);
    await dbClient.connect();
    const checkpointer = new MongoCheckpointSaver(dbClient);

    // 2. Dependency: Model (Native OpenRouter integration for proper tool support)
    const llm = new ChatOpenRouter({
        model: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
        temperature: 0,
        // The API key is automatically picked up from OPENROUTER_API_KEY via dotenv
    });

    // 3. Dependency: MCP Tools
    // E.g., connect to a local MCP server that exposes tools
    const mcpServerUrl = process.env.MCP_SERVER_URL || "http://localhost:3000/sse";
    const mcpClient = new MCPIntegration(mcpServerUrl);
    
    let tools: any[] = [];
    try {
        await mcpClient.connect();
        tools = await mcpClient.buildLangchainTools();
        console.log(`Loaded ${tools.length} tools from MCP Server`);
    } catch(e) {
        console.log("No MCP Server found or failed to connect. Running agent without external tools.");
    }

    // 4. Build Agent with Injected Dependencies
    const agent = compileAgent(llm, tools, checkpointer);

    // 5. Interface to Play with it (CLI)
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const threadId = "user-session-2"; // Memory context ID

    console.log("\nAgent Ready. Type 'exit' to quit.");
    while (true) {
        const query = await rl.question("\nYou: ");
        if (query.toLowerCase() === "exit") break;

        const inputs = {
            messages: [new HumanMessage(query)],
        };
        
        const config = { configurable: { thread_id: threadId } };
        
        console.log("\nAgent is thinking...");
        
        try {
            const result = await agent.invoke(inputs, config);
            
            // LangChain agent outputs the tool call response, but sometimes the actual
            // text response from the LLM is slightly earlier or nested correctly.
            // We will loop backwards to find the last actual string content.
            let finalResponse = "No response";
            for (let i = result.messages.length - 1; i >= 0; i--) {
                 const msg = result.messages[i];
                 if (!msg || !msg.content) continue;
    
                 if (typeof msg.content === 'string' && msg.content.trim() !== "") {
                     finalResponse = msg.content;
                     break;
                 } else if (Array.isArray(msg.content)) {
                     // Some models return arrays of content blocks
                     const contentArray = msg.content as any[];
                     const textBlock = contentArray.find((c: any) => c.type === 'text' && c.text);
                     if (textBlock && typeof textBlock.text === 'string' && textBlock.text.trim() !== '') {
                         finalResponse = textBlock.text;
                         break;
                     }
                 }
            }
            
            console.log(`\nAgent: ${finalResponse}`);
        } catch (error: any) {
            console.error(`\n[Agent Error]: ${error.message || error}`);
            console.log("Please try a different model or check your configuration.");
        }
    }

    await dbClient.close();
    await mcpClient.disconnect();
    rl.close();
}

main().catch(console.error);
