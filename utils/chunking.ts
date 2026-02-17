const LORA_MAX_PAYLOAD = 200;
const CHUNK_HEADER_SIZE = 12;
const CHUNK_DATA_SIZE = LORA_MAX_PAYLOAD - CHUNK_HEADER_SIZE;

export const CHUNK_PREFIX = 'MCHK';
export const CHUNK_VERSION = 1;

export interface ChunkHeader {
  prefix: string;
  version: number;
  messageId: string;
  chunkIndex: number;
  totalChunks: number;
  dataType: 'CASHU' | 'LN_INV' | 'BTC_TX' | 'RAW';
}

export interface Chunk {
  header: ChunkHeader;
  payload: string;
  raw: string;
}

export interface ChunkAssemblyState {
  messageId: string;
  totalChunks: number;
  receivedChunks: Map<number, string>;
  dataType: ChunkHeader['dataType'];
  timestamp: number;
  isComplete: boolean;
}

function generateMessageId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function encodeChunkHeader(header: ChunkHeader): string {
  return `${header.prefix}|${header.version}|${header.messageId}|${header.chunkIndex}/${header.totalChunks}|${header.dataType}|`;
}

export function decodeChunkHeader(raw: string): ChunkHeader | null {
  const parts = raw.split('|');
  if (parts.length < 6 || parts[0] !== CHUNK_PREFIX) {
    return null;
  }

  const indexParts = parts[3].split('/');
  if (indexParts.length !== 2) return null;

  return {
    prefix: parts[0],
    version: parseInt(parts[1], 10),
    messageId: parts[2],
    chunkIndex: parseInt(indexParts[0], 10),
    totalChunks: parseInt(indexParts[1], 10),
    dataType: parts[4] as ChunkHeader['dataType'],
  };
}

export function chunkMessage(
  data: string,
  dataType: ChunkHeader['dataType']
): Chunk[] {
  const messageId = generateMessageId();

  if (data.length <= CHUNK_DATA_SIZE) {
    const header: ChunkHeader = {
      prefix: CHUNK_PREFIX,
      version: CHUNK_VERSION,
      messageId,
      chunkIndex: 0,
      totalChunks: 1,
      dataType,
    };
    const headerStr = encodeChunkHeader(header);
    return [{
      header,
      payload: data,
      raw: headerStr + data,
    }];
  }

  const totalChunks = Math.ceil(data.length / CHUNK_DATA_SIZE);
  const chunks: Chunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_DATA_SIZE;
    const end = Math.min(start + CHUNK_DATA_SIZE, data.length);
    const payload = data.slice(start, end);

    const header: ChunkHeader = {
      prefix: CHUNK_PREFIX,
      version: CHUNK_VERSION,
      messageId,
      chunkIndex: i,
      totalChunks,
      dataType,
    };
    const headerStr = encodeChunkHeader(header);
    chunks.push({
      header,
      payload,
      raw: headerStr + payload,
    });
  }

  console.log(`[Chunking] Split message ${messageId} into ${totalChunks} chunks (${data.length} bytes)`);
  return chunks;
}

export function createAssemblyState(header: ChunkHeader): ChunkAssemblyState {
  return {
    messageId: header.messageId,
    totalChunks: header.totalChunks,
    receivedChunks: new Map(),
    dataType: header.dataType,
    timestamp: Date.now(),
    isComplete: false,
  };
}

export function addChunkToAssembly(
  state: ChunkAssemblyState,
  chunk: Chunk
): ChunkAssemblyState {
  const newReceived = new Map(state.receivedChunks);
  newReceived.set(chunk.header.chunkIndex, chunk.payload);

  const isComplete = newReceived.size === state.totalChunks;

  if (isComplete) {
    console.log(`[Chunking] Assembly complete for message ${state.messageId}`);
  } else {
    console.log(`[Chunking] Received chunk ${chunk.header.chunkIndex + 1}/${state.totalChunks} for ${state.messageId}`);
  }

  return {
    ...state,
    receivedChunks: newReceived,
    isComplete,
  };
}

export function assembleMessage(state: ChunkAssemblyState): string | null {
  if (!state.isComplete) return null;

  let result = '';
  for (let i = 0; i < state.totalChunks; i++) {
    const chunk = state.receivedChunks.get(i);
    if (!chunk) return null;
    result += chunk;
  }

  console.log(`[Chunking] Assembled full message: ${result.length} bytes`);
  return result;
}

export function getAssemblyProgress(state: ChunkAssemblyState): number {
  return state.receivedChunks.size / state.totalChunks;
}

export function getMissingChunks(state: ChunkAssemblyState): number[] {
  const missing: number[] = [];
  for (let i = 0; i < state.totalChunks; i++) {
    if (!state.receivedChunks.has(i)) {
      missing.push(i);
    }
  }
  return missing;
}

export function isChunkedMessage(raw: string): boolean {
  return raw.startsWith(CHUNK_PREFIX + '|');
}

export function formatChunkInfo(header: ChunkHeader): string {
  return `${header.dataType} [${header.chunkIndex + 1}/${header.totalChunks}] #${header.messageId}`;
}

export const LORA_LIMITS = {
  maxPayload: LORA_MAX_PAYLOAD,
  headerSize: CHUNK_HEADER_SIZE,
  dataSize: CHUNK_DATA_SIZE,
} as const;
