import { ChatOpenAI } from "@langchain/openai";
import { MongoClient } from "mongodb";
import { compileAgent } from "./agent/index.js";
import { MCPIntegration } from "./mcp/client.js";
import { MongoCheckpointSaver } from "./persistence/mongoSaver.js";
import * as dotenv from "dotenv";
import { HumanMessage } from "@langchain/core/messages";

import { ChatOpenRouter } from "@langchain/openrouter";

dotenv.config();

async function main() {
    const mongoUri = process.env.MONGO_URI || "mongodb://admin:password@localhost:27017";
    const dbClient = new MongoClient(mongoUri);
    await dbClient.connect();
    const checkpointer = new MongoCheckpointSaver(dbClient);

    const llm = new ChatOpenRouter({
        model: process.env.OPENROUTER_MODEL || "anthropic/claude-3.5-sonnet",
        temperature: 0,
    });

    const mcpClient = new MCPIntegration("http://localhost:3000/sse");
    await mcpClient.connect();
    const tools = await mcpClient.buildLangchainTools();
    
    const agent = compileAgent(llm, tools, checkpointer);

    console.log("\n--- Sending request ---");
    const result = await agent.invoke(
        { messages: [new HumanMessage("What time is it right now?")] },
        { configurable: { thread_id: "test-thread-1" } }
    );
    
    console.log("\n--- Full Result Object ---");
    console.log(JSON.stringify(result, null, 2));

    await dbClient.close();
    await mcpClient.disconnect();
}

main().catch(console.error);
