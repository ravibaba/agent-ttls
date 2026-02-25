import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
} from "@langchain/langgraph";
import { Collection, MongoClient } from "mongodb";

// S: Single Responsibility. This object only interacts with the database to get/set checkpoints.
// L: Liskov Substitution. It correctly implements LangGraph's expected CheckpointSaver.
// D: Dependency Inversion. It takes an external MongoClient instance so the caller controls connections (DIP).

export class MongoCheckpointSaver extends BaseCheckpointSaver {
  private collection: Collection;

  constructor(
    client: MongoClient,
    dbName: string = "langgraph_agent",
    collectionName: string = "checkpoints",
  ) {
    super();
    this.collection = client.db(dbName).collection(collectionName);
  }

  async put(
    config: { configurable?: { thread_id?: string; [key: string]: any } },
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<any> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) throw new Error("Thread ID is required for checkpoints");

    const item = {
      thread_id: threadId,
      checkpoint_id: checkpoint.id,
      checkpoint: checkpoint,
      metadata: metadata,
      timestamp: new Date(),
    };

    // Upsert or insert new checkpoint version
    await this.collection.updateOne(
      { thread_id: threadId, checkpoint_id: checkpoint.id },
      { $set: item },
      { upsert: true },
    );

    return config;
  }

  async getTuple(config: {
    configurable?: {
      thread_id?: string;
      checkpoint_id?: string;
      [key: string]: any;
    };
  }): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;
    if (!threadId) return undefined;

    let query: any = { thread_id: threadId };
    if (checkpointId) {
      query.checkpoint_id = checkpointId;
    }

    const doc = await this.collection.findOne(query, {
      sort: { timestamp: -1 },
    });
    if (!doc) return undefined;

    return {
      config: {
        configurable: { thread_id: threadId, checkpoint_id: doc.checkpoint_id },
      },
      checkpoint: doc.checkpoint as Checkpoint,
      metadata: doc.metadata as CheckpointMetadata,
    };
  }

  async *list(config: {
    configurable?: { thread_id?: string; [key: string]: any };
  }): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    if (!threadId) return;

    const cursor = this.collection
      .find({ thread_id: threadId })
      .sort({ timestamp: -1 });

    for await (const doc of cursor) {
      yield {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_id: doc.checkpoint_id,
          },
        },
        checkpoint: doc.checkpoint as Checkpoint,
        metadata: doc.metadata as CheckpointMetadata,
      };
    }
  }

  // Required by newer versions of BaseCheckpointSaver
  async putWrites(
    config: { configurable?: { thread_id?: string; [key: string]: any } },
    writes: any,
    taskId: string
  ): Promise<void> {
    // Basic stub. Real implementation would save pending writes to DB.
    return Promise.resolve();
  }

  // Required by newer versions of BaseCheckpointSaver
  async deleteThread(
    threadId: string
  ): Promise<void> {
    if (threadId) {
       await this.collection.deleteMany({ thread_id: threadId });
    }
  }
}
