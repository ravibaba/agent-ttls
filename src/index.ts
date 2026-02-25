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

// S: The main file's single responsibility is orchestrating and starting everything
// D: It creates the DB connections and Models, injecting them downwards (DIP)

async function main() {
    console.log("Starting LangGraph + MCP Conversational Agent...");

    // 1. Dependency: Database Checkpointer
    const mongoUri = process.env.MONGO_URI || "mongodb://admin:password@localhost:27017";
    const dbClient = new MongoClient(mongoUri);
    await dbClient.connect();
    const checkpointer = new MongoCheckpointSaver(dbClient);

    // 2. Dependency: Model (OpenRouter Configuration - OCP/LSP)
    // OpenRouter uses an OpenAI compatible endpoint
    const llm = new ChatOpenAI({
        modelName: process.env.OPENROUTER_MODEL || "arcee-ai/trinity-large-preview:free", // Example OpenRouter model
        temperature: 0,
        openAIApiKey: process.env.OPENROUTER_API_KEY,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "http://localhost:3000", // Required by OpenRouter
                "X-Title": "LangGraph Agent", // Required by OpenRouter
            }
        }
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

    const threadId = "user-session-1"; // Memory context ID

    console.log("\nAgent Ready. Type 'exit' to quit.");
    while (true) {
        const query = await rl.question("\nYou: ");
        if (query.toLowerCase() === "exit") break;

        const inputs = {
            messages: [new HumanMessage(query)],
        };
        
        const config = { configurable: { thread_id: threadId } };
        
        console.log("\nAgent is thinking...");
        const result = await agent.invoke(inputs, config);
        
        // The last message in the state is the agent's response
        const lastMessage = result.messages[result.messages.length - 1];
        console.log(`\nAgent: ${lastMessage?.content || "No response"}`);
    }

    await dbClient.close();
    await mcpClient.disconnect();
    rl.close();
}

main().catch(console.error);
