import {
  listPrivateDirectory,
  readPrivateFile,
  writePrivateFile,
  isGithubConfigured,
  SNAPSHOT_REPOSITORY,
  SNAPSHOT_REPOSITORY_URL,
  getLatestSnapshotFromGithub,
  pushSnapshotToGithub,
} from "./github";
import {
  readAccountChat,
  writeAccountChat,
  type StoredChatMessage,
} from "./auth-service";
import { logger } from "./logger";

const START = "__START__";
const END = "__END__";
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const LIVE_MODEL_PATH = "snapshots/latest.json";
type Vocabulary = Record<string, number>;
type Transitions = Record<string, Record<string, number>>;

type BrainData = {
  vocabulary: Vocabulary;
  transitions: Transitions;
  messageCount: number;
  learningStartedAt: Date;
  lastSnapshotAt: Date | null;
};

type SnapshotDocument = {
  format: "bigram-ai/v1";
  createdAt: string;
  model: {
    vocabulary: Vocabulary;
    transitions: Transitions;
    messageCount: number;
    learningStartedAt: string;
    lastSnapshotAt?: string | null;
  };
};

let modelWriteChain: Promise<void> = Promise.resolve();

export type BrainOverview = {
  vocabulary: number;
  bigrams: number;
  messages: number;
  learningStartedAt: string;
  lastSnapshotAt: string | null;
  nextSnapshotAt: string;
  githubConfigured: boolean;
  githubConnected: boolean;
};

export type PublicMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type PublicSnapshot = {
  id: string;
  filename: string;
  createdAt: string;
  vocabulary: number;
  bigrams: number;
  messages: number;
  status: "local" | "github" | "failed";
  error: string | null;
};

function tokenize(text: string) {
  return (
    text
      .toLocaleLowerCase()
      .match(/[a-z0-9]+(?:'[a-z0-9]+)?|[.,!?;:]/g) ?? []
  );
}

function formatTokens(tokens: string[]) {
  let result = "";
  for (const token of tokens) {
    if (/[.,!?;:]/.test(token)) result = `${result.trimEnd()}${token} `;
    else result += `${token} `;
  }
  return result.trim();
}

function learn(data: BrainData, text: string) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return;

  let previous = START;
  for (const token of tokens) {
    data.vocabulary[token] = (data.vocabulary[token] ?? 0) + 1;
    data.transitions[previous] ??= {};
    data.transitions[previous][token] =
      (data.transitions[previous][token] ?? 0) + 1;
    previous = token;
  }

  data.transitions[previous] ??= {};
  data.transitions[previous][END] =
    (data.transitions[previous][END] ?? 0) + 1;
  data.messageCount += 1;
}

function chooseNext(options: Record<string, number>) {
  const entries = Object.entries(options);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let cursor = Math.random() * total;
  for (const [token, count] of entries) {
    cursor -= count;
    if (cursor <= 0) return token;
  }
  return entries[entries.length - 1]?.[0] ?? null;
}

function generate(data: BrainData, prompt: string) {
  if (Object.keys(data.vocabulary).length < 3) {
    return "I am still learning the shape of language. Keep talking with me.";
  }

  const promptTokens = tokenize(prompt);
  let current = promptTokens.at(-1) ?? START;
  const generated: string[] = [];

  for (let index = 0; index < 32; index += 1) {
    const next = chooseNext(data.transitions[current] ?? {});
    if (!next || next === END) break;
    generated.push(next);
    current = next;
  }

  if (generated.length === 0) {
    current = START;
    for (let index = 0; index < 24; index += 1) {
      const next = chooseNext(data.transitions[current] ?? {});
      if (!next || next === END) break;
      generated.push(next);
      current = next;
    }
  }

  return (
    formatTokens(generated) ||
    "I have learned a little more. Give me another thought to connect."
  );
}

function createEmptyState(): BrainData {
  return {
    vocabulary: {},
    transitions: {},
    messageCount: 0,
    learningStartedAt: new Date(),
    lastSnapshotAt: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseVocabulary(value: unknown, label: string): Vocabulary {
  if (!isRecord(value)) {
    throw new Error(`The ${label} snapshot field is invalid.`);
  }
  const result: Vocabulary = {};
  for (const [token, count] of Object.entries(value)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      throw new Error(`The ${label} snapshot field is invalid.`);
    }
    result[token] = count;
  }
  return result;
}

function parseTransitions(value: unknown): Transitions {
  if (!isRecord(value)) {
    throw new Error("The snapshot transitions field is invalid.");
  }
  const result: Transitions = {};
  for (const [token, options] of Object.entries(value)) {
    result[token] = parseVocabulary(options, "snapshot transition");
  }
  return result;
}

function parseSnapshotDocument(content: string, source: string): {
  document: SnapshotDocument;
  state: BrainData;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new Error(`The GitHub snapshot ${source} is not valid JSON.`, {
      cause: error,
    });
  }

  if (
    !isRecord(parsed) ||
    parsed.format !== "bigram-ai/v1" ||
    typeof parsed.createdAt !== "string" ||
    !isRecord(parsed.model) ||
    typeof parsed.model.learningStartedAt !== "string" ||
    typeof parsed.model.messageCount !== "number" ||
    !Number.isInteger(parsed.model.messageCount) ||
    parsed.model.messageCount < 0
  ) {
    throw new Error(`The GitHub snapshot ${source} has an invalid format.`);
  }

  const createdAt = new Date(parsed.createdAt);
  const learningStartedAt = new Date(parsed.model.learningStartedAt);
  const rawLastSnapshotAt = parsed.model.lastSnapshotAt;
  if (
    Number.isNaN(createdAt.getTime()) ||
    Number.isNaN(learningStartedAt.getTime()) ||
    (rawLastSnapshotAt !== undefined &&
      rawLastSnapshotAt !== null &&
      typeof rawLastSnapshotAt !== "string")
  ) {
    throw new Error(`The GitHub snapshot ${source} has invalid dates.`);
  }

  const lastSnapshotAtValue =
    rawLastSnapshotAt === undefined ? parsed.createdAt : rawLastSnapshotAt;
  const lastSnapshotAt =
    lastSnapshotAtValue === null ? null : new Date(lastSnapshotAtValue);
  if (lastSnapshotAt && Number.isNaN(lastSnapshotAt.getTime())) {
    throw new Error(`The GitHub snapshot ${source} has an invalid snapshot date.`);
  }

  const document = {
    format: "bigram-ai/v1" as const,
    createdAt: parsed.createdAt,
    model: {
      vocabulary: parseVocabulary(parsed.model.vocabulary, "vocabulary"),
      transitions: parseTransitions(parsed.model.transitions),
      messageCount: parsed.model.messageCount,
      learningStartedAt: parsed.model.learningStartedAt,
      lastSnapshotAt:
        rawLastSnapshotAt === undefined ? undefined : rawLastSnapshotAt,
    },
  };

  return {
    document,
    state: {
      vocabulary: document.model.vocabulary,
      transitions: document.model.transitions,
      messageCount: document.model.messageCount,
      learningStartedAt,
      lastSnapshotAt,
    },
  };
}

function toSnapshotDocument(state: BrainData, createdAt = new Date()): SnapshotDocument {
  return {
    format: "bigram-ai/v1",
    createdAt: createdAt.toISOString(),
    model: {
      vocabulary: state.vocabulary,
      transitions: state.transitions,
      messageCount: state.messageCount,
      learningStartedAt: state.learningStartedAt.toISOString(),
      lastSnapshotAt: state.lastSnapshotAt?.toISOString() ?? null,
    },
  };
}

async function readRemoteState() {
  const liveFile = await readPrivateFile(LIVE_MODEL_PATH);
  if (liveFile) {
    return parseSnapshotDocument(liveFile.content, LIVE_MODEL_PATH).state;
  }

  const latest = await getLatestSnapshotFromGithub();
  if (!latest) return null;
  return parseSnapshotDocument(latest.content, latest.filename).state;
}

async function getState() {
  return (await readRemoteState()) ?? createEmptyState();
}

async function saveLiveState(state: BrainData) {
  await writePrivateFile({
    relativePath: LIVE_MODEL_PATH,
    content: JSON.stringify(toSnapshotDocument(state), null, 2),
    message: "Update live Bigram AI model state",
  });
}

function withModelWriteLock<T>(operation: () => Promise<T>) {
  const next = modelWriteChain.then(operation, operation);
  modelWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function countBigrams(transitions: Transitions) {
  return Object.values(transitions).reduce(
    (total, options) =>
      total + Object.keys(options).filter((key) => key !== END).length,
    0,
  );
}

function snapshotSummary(
  filename: string,
  state: BrainData,
  status: PublicSnapshot["status"],
  error: string | null,
): PublicSnapshot {
  const createdAt =
    state.lastSnapshotAt?.toISOString() ?? new Date().toISOString();
  return {
    id: filename,
    filename,
    createdAt,
    vocabulary: Object.keys(state.vocabulary).length,
    bigrams: countBigrams(state.transitions),
    messages: state.messageCount,
    status,
    error,
  };
}

export async function getOverview(): Promise<BrainOverview> {
  const state = await getState();
  const next =
    (state.lastSnapshotAt?.getTime() ?? state.learningStartedAt.getTime()) +
    SNAPSHOT_INTERVAL_MS;
  const connected = isGithubConfigured();
  return {
    vocabulary: Object.keys(state.vocabulary).length,
    bigrams: countBigrams(state.transitions),
    messages: state.messageCount,
    learningStartedAt: state.learningStartedAt.toISOString(),
    lastSnapshotAt: state.lastSnapshotAt?.toISOString() ?? null,
    nextSnapshotAt: new Date(next).toISOString(),
    githubConfigured: connected,
    githubConnected: connected,
  };
}

export async function getMessages(username: string): Promise<PublicMessage[]> {
  return readAccountChat(username);
}

export async function learnAndRespond(prompt: string) {
  return withModelWriteLock(async () => {
    const state = await getState();
    learn(state, prompt);
    const response = generate(state, prompt);
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: prompt,
      createdAt: new Date(),
    };
    const assistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: response,
      createdAt: new Date(),
    };

    await saveLiveState(state);
    return { userMessage, assistantMessage };
  });
}

export async function sendMessage(username: string, prompt: string) {
  const { userMessage, assistantMessage } = await learnAndRespond(prompt);
  const existingMessages = await readAccountChat(username);
  const messages: StoredChatMessage[] = [
    ...existingMessages,
    {
      ...userMessage,
      createdAt: userMessage.createdAt.toISOString(),
    },
    {
      ...assistantMessage,
      createdAt: assistantMessage.createdAt.toISOString(),
    },
  ];
  await writeAccountChat(username, messages);
  return {
    userMessage: {
      ...userMessage,
      createdAt: userMessage.createdAt.toISOString(),
    },
    assistantMessage: {
      ...assistantMessage,
      createdAt: assistantMessage.createdAt.toISOString(),
    },
    overview: await getOverview(),
  };
}

export async function getSnapshots(): Promise<PublicSnapshot[]> {
  const directory = await listPrivateDirectory("snapshots");
  const snapshotFiles = directory.filter(
    (item) =>
      item.type === "file" &&
      item.name.startsWith("bigram-model-") &&
      item.name.endsWith(".json"),
  );
  const snapshots = await Promise.all(
    snapshotFiles.map(async (item) => {
      const file = await readPrivateFile(`snapshots/${item.name}`);
      if (!file) return null;
      const parsed = parseSnapshotDocument(file.content, item.name);
      return snapshotSummary(item.name, parsed.state, "github", null);
    }),
  );
  return snapshots
    .filter((snapshot): snapshot is PublicSnapshot => snapshot !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function createSnapshot(): Promise<PublicSnapshot> {
  return withModelWriteLock(async () => {
    const state = await getState();
    const createdAt = new Date();
    const filename = `bigram-model-${createdAt
      .toISOString()
      .replace(/[:.]/g, "-")}.json`;
    const snapshotState: BrainData = {
      ...state,
      lastSnapshotAt: createdAt,
    };
    const document = JSON.stringify(
      toSnapshotDocument(snapshotState, createdAt),
      null,
      2,
    );

    try {
      await pushSnapshotToGithub({ filename, content: document });
      await saveLiveState(snapshotState);
      return snapshotSummary(filename, snapshotState, "github", null);
    } catch (remoteError) {
      const error =
        remoteError instanceof Error
          ? remoteError.message
          : "The snapshot could not be written to GitHub.";
      logger.error(
        { err: remoteError, filename },
        "Could not write model snapshot to GitHub",
      );
      return snapshotSummary(filename, state, "failed", error);
    }
  });
}

export async function getGithubSettings() {
  const configured = isGithubConfigured();
  return {
    owner: SNAPSHOT_REPOSITORY.owner,
    repository: SNAPSHOT_REPOSITORY.repository,
    branch: SNAPSHOT_REPOSITORY.branch,
    configured,
    connected: configured,
    message: configured
      ? `Private GitHub backups are permanently linked to ${SNAPSHOT_REPOSITORY_URL}.`
      : "Set GITHUB_TOKEN to enable private GitHub backups.",
  };
}

export async function updateGithubSettings(input: {
  owner: string;
  repository: string;
  branch: string;
}) {
  void input;
  return getGithubSettings();
}

export function startSnapshotScheduler() {
  void getState().catch((error) => {
    logger.error({ err: error }, "Could not load the latest model snapshot from GitHub");
  });
  const timer = setInterval(() => {
    void createSnapshot().catch((error) => {
      logger.error({ err: error }, "Could not create scheduled model snapshot");
    });
  }, SNAPSHOT_INTERVAL_MS);
  timer.unref();
}