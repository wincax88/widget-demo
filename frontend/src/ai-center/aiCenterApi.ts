import { request } from '../services/api'

export interface AiCenterStatus {
  configured: boolean
  defaultModel: string | null
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatInput {
  messages: ChatMessage[]
  model?: string
  max_tokens?: number
  temperature?: number
}

export interface ChatResponse {
  content: string
  model: string
  request_id: string
  finish_reason: string | null
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
}

export const aiCenterApi = {
  status: (signal?: AbortSignal) => request<AiCenterStatus>('/ai-center/status', { signal }),
  chat: (input: ChatInput, signal?: AbortSignal) => request<ChatResponse>('/ai-center/chat', {
    method: 'POST', body: JSON.stringify(input), signal,
  }),
}
