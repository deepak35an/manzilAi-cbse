import { useState, useRef, useCallback } from 'react'

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorder.current = recorder
      chunks.current = []

      recorder.ondataavailable = (e) => chunks.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/wav' })
        setAudioBlob(blob)
        stream.getTracks().forEach((t) => t.stop())
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to access microphone:', err)
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }, [])

  const clearRecording = useCallback(() => {
    setAudioBlob(null)
  }, [])

  return { isRecording, audioBlob, startRecording, stopRecording, clearRecording }
}
