import { ModelType, ModelFormat } from '../types'

const MODEL_FORMATS: Record<string, ModelFormat> = {
  qwen: {
    systemStart: '<|im_start|>system\n',
    systemEnd: '<|im_end|>\n',
    userStart: '<|im_start|>user\n',
    userEnd: '<|im_end|>\n',
    assistantStart: '<|im_start|>assistant\n',
  },
  aya: {
    systemStart: '<|system|>',
    systemEnd: '<|end|>\n',
    userStart: '<|user|>',
    userEnd: '<|end|>\n',
    assistantStart: '<|assistant|>',
  },
}

export function getModelType(modelName: string): ModelType {
  const name = modelName.toLowerCase()
  if (name.includes('qwen')) return 'qwen'
  if (name.includes('aya')) return 'aya'
  if (name.includes('llama')) return 'llama'
  if (name.includes('gemma')) return 'gemma'
  return 'aya' // Default for multilingual
}

export function getModelFormat(modelType: ModelType): ModelFormat | null {
  return MODEL_FORMATS[modelType] || null
}

export function supportsEmbeddedFormat(modelType: ModelType): boolean {
  return modelType === 'qwen' || modelType === 'aya'
}

// Clean model-specific artifacts from output
export function cleanModelOutput(text: string, _modelType?: ModelType): string {
  let cleaned = text
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|im_start\|>assistant\n?/g, '')
    .replace(/<\|end\|>/g, '')
    .replace(/<\|assistant\|>/g, '')
    .trim()

  // Hybrid reasoning models emit their chain of thought inline, wrapped in
  // <think> tags, whenever the separate thinking channel is off. That reasoning
  // is never the answer, so it is dropped here rather than shown as a result.
  cleaned = cleaned
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .trim()

  // The translation prompt fences the source in <text> tags to stop the model
  // replying to it instead of translating it. Smaller models sometimes copy the
  // fence into the answer, so drop the tags and anything the model prefixed
  // before them rather than showing markup to the user.
  if (cleaned.includes('<text>')) {
    const fenced = cleaned.match(/<text>([\s\S]*?)(?:<\/text>|$)/)
    if (fenced) cleaned = fenced[1].trim()
  }
  cleaned = cleaned.replace(/<\/?text>/g, '').trim()

  return cleaned
}
