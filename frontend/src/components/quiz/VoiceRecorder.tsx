import { useState, useRef } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { encodeWAV } from '../../lib/audioUtils'

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void
  disabled?: boolean
}

export default function VoiceRecorder({ onRecordingComplete, disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const audioContext = useRef<AudioContext | null>(null)
  const processor = useRef<ScriptProcessorNode | null>(null)
  const input = useRef<MediaStreamAudioSourceNode | null>(null)
  const samples = useRef<Float32Array[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContext.current = new AudioContext()
      input.current = audioContext.current.createMediaStreamSource(stream)
      processor.current = audioContext.current.createScriptProcessor(4096, 1, 1)

      samples.current = []
      processor.current.onaudioprocess = (e) => {
        samples.current.push(new Float32Array(e.inputBuffer.getChannelData(0)))
      }

      input.current.connect(processor.current)
      processor.current.connect(audioContext.current.destination)
      
      setRecording(true)
    } catch {
      console.error('Microphone access denied')
    }
  }

  const stopRecording = async () => {
    if (audioContext.current && recording) {
      setProcessing(true)
      setRecording(false)

      const ctx = audioContext.current
      const proc = processor.current
      const src = input.current

      if (proc && src) {
        src.disconnect()
        proc.disconnect()
      }
      
      const flatSamples = flattenSamples(samples.current)
      const blob = encodeWAV(flatSamples, ctx.sampleRate)
      
      await ctx.close()
      onRecordingComplete(blob)
      setProcessing(false)
    }
  }

  const flattenSamples = (chunks: Float32Array[]) => {
    const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    const result = new Float32Array(length)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }

  return (
    <button
      onClick={recording ? stopRecording : startRecording}
      disabled={disabled || processing}
      className={cn(
        'p-3 rounded-xl transition-all',
        recording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : recording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </button>
  )
}
