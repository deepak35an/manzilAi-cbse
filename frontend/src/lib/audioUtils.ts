export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const targetSampleRate = 16000
  const resampled = resample(samples, sampleRate, targetSampleRate)
  
  const buffer = new ArrayBuffer(44 + resampled.length * 2)
  const view = new DataView(buffer)

  /* RIFF identifier */
  writeString(view, 0, 'RIFF')
  /* file length */
  view.setUint32(4, 32 + resampled.length * 2, true)
  /* RIFF type */
  writeString(view, 8, 'WAVE')
  /* format chunk identifier */
  writeString(view, 12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, 1, true)
  /* channel count */
  view.setUint16(22, 1, true)
  /* sample rate */
  view.setUint32(24, targetSampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, targetSampleRate * 2, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true)
  /* bits per sample */
  view.setUint16(34, 16, true)
  /* data chunk identifier */
  writeString(view, 36, 'data')
  /* data chunk length */
  view.setUint32(40, resampled.length * 2, true)

  floatTo16BitPCM(view, 44, resampled)

  return new Blob([view], { type: 'audio/wav' })
}

function resample(samples: Float32Array, oldRate: number, newRate: number): Float32Array {
  if (oldRate === newRate) return samples
  const ratio = oldRate / newRate
  const newLength = Math.round(samples.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio
    const left = Math.floor(pos)
    const right = Math.ceil(pos)
    const weight = pos - left
    result[i] = samples[left] * (1 - weight) + (samples[right] || samples[left]) * weight
  }
  return result
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
}
