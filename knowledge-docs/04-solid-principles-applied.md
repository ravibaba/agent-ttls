# Applied SOLID Principles in our Agent

Throughout this project, we explicitly constructed our LangGraph/MCP application using **SOLID** object-oriented principles. Here is an explanation of every principle used in the project, accompanied by real-world analogies.

## 1. Single Responsibility Principle (SRP)

_A class or module should have one, and only one, reason to change._

### In our project:

- `MongoCheckpointSaver` (`src/persistence/mongoSaver.ts`): The ONLY reason to change this file is if our database schema or driver changes. It has zero knowledge of what LangGraph actually runs, it just saves and loads data.
- `MCPIntegration` (`src/mcp/client.ts`): The ONLY reason to change this file is if the MCP Protocol updates.

**Analogy:** A restaurant. The Chef cooks (Agent), the Waiter takes orders (MCP tools execution), and the Cashier handles money (Persistence). You don't have the Cashier cooking food.

## 2. Open-Closed Principle (OCP)

_Software entities should be open for extension, but closed for modification._

### In our project:

- LangChain's Tool structure lets us build tools arrays: `const modelWithTools = llm.bindTools(tools);`
- If we want the agent to suddenly be able to "search the web", we do not edit the Agent code or the LLM logic. We simply add a new tool to the MCP Server, and the `MCPIntegration` translates it. The core agent is **closed** for modification but **open** for extension.

**Analogy:** A video game console. The console's hardware is closed (you don't rebuild the internal motherboard to play a new game), but it is open to extension by inserting new game cartridges (MCP Tools).

## 3. Liskov Substitution Principle (LSP)

_Objects of a superclass shall be replaceable with objects of its subclasses without breaking the application._

### In our project:

- LangGraph defines an abstract `BaseCheckpointSaver`.
- We built `MongoCheckpointSaver extends BaseCheckpointSaver`.
- We can swap `MongoCheckpointSaver` for `MemorySaver` (A built-in LangGraph class) instantly inside `src/index.ts` without our application knowing the difference.

**Analogy:** If you ask for a "Car", delivering an "Electric Car" or a "Gas Car" both fulfill the contract (steers, drives, brakes) without breaking your expectation.

## 4. Interface Segregation Principle (ISP)

_No client should be forced to depend on methods it does not use._

### In our project:

- We keep our interfaces minimal. The `MCPIntegration` exposes exactly what is needed wrapper methods: `connect()`, `buildLangchainTools()`, and `disconnect()`. The LangGraph code does not know about SSE transports, raw headers, or complex JSON schema objects.

**Analogy:** A universal remote control with 100 buttons is confusing if you only watch Netflix. ISP is giving you a remote with just "Power, Volume, Play/Pause".

## 5. Dependency Inversion Principle (DIP)

_High-level modules should not depend on low-level modules. Both should depend on abstractions._

### In our project:

- Look at `src/agent/index.ts -> compileAgent()`. It receives `llm: BaseChatModel` and `saver: BaseCheckpointSaver` through the constructor (Dependency Injection).
- By injecting these, the High-Level Agent module does not manually create `new ChatOpenAI()` or `new MongoCheckpointSaver()`. It relies entirely on abstractions.
- You control the entire application from the root (`src/index.ts`).

**Analogy:** Plugging a lamp into a wall outlet. The lamp (high-level module) depends on standard outlet prongs (abstraction). It does NOT wire itself directly to the city's power plant (low-level module). Because of this, you can move the lamp to any house.
