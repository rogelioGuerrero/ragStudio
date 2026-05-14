import { pipeline, env } from '@huggingface/transformers';

// Skip local files, only use the Hub
env.allowLocalModels = false;

class PipelineSingleton {
  static task = 'feature-extraction' as const;
  static instances: Record<string, any> = {};

  static async getInstance(model: string, progress_callback?: Function) {
    if (!this.instances[model]) {
      this.instances[model] = pipeline(this.task, model, { progress_callback });
    }
    return this.instances[model];
  }
}

export async function generateLocalEmbedding(text: string, model: string, progress_callback?: Function): Promise<number[]> {
  const extractor = await PipelineSingleton.getInstance(model, progress_callback);
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
