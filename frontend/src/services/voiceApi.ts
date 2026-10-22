import api from './api'

export const processVoice = (formData: FormData) =>
  api.post<{ transcription: string; text_confidence: number; audio_confidence: number; final_confidence: number; audio_features: Record<string, unknown> }>('/voice/process', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
