// Data Structures for the RAG Application

export type ContentType = "text" | "image" | "audio";

export interface ChunkData {
  id: string; // Unique ID
  source_file: string; // Original filename
  content_type: ContentType;
  raw_content_preview: string; // Snippet or base64 preview
  raw_content?: string; // Full text content
  media_base64?: string; // For images/audio
  media_mime_type?: string; 
  embedding: number[];
  tokens?: number; // Estimated tokens
}

export interface RagMetadata {
  total_chunks: number;
  model: string;
  timestamp: string;
  total_tokens: number;
  total_time_ms: number;
}

export interface RagExport {
  metadata: RagMetadata;
  data: ChunkData[];
}

export interface VectorSearchResult {
  chunk: ChunkData;
  score: number;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function searchVectors(
  queryEmbedding: number[],
  dataset: ChunkData[],
  topK: number = 3
): VectorSearchResult[] {
  const results: VectorSearchResult[] = dataset.map((chunk) => {
    const score = chunk.embedding.length 
        ? cosineSimilarity(queryEmbedding, chunk.embedding) 
        : 0;
    return { chunk, score };
  });

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
