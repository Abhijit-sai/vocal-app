/**
 * scripts/gen-alert-sound.js
 *
 * Generates `public/sounds/alert.wav` — a short two-tone "ding-ding" alert
 * pattern designed to grab attention without being startling.
 *
 * Pattern: 1100 Hz (200ms) → 60ms pause → 1500 Hz (250ms)
 * Format:  44.1 kHz, mono, 16-bit PCM (~22 KB).
 *
 * Run: node scripts/gen-alert-sound.js
 */

const fs = require('node:fs')
const path = require('node:path')

const SAMPLE_RATE = 44100
const BITS_PER_SAMPLE = 16
const CHANNELS = 1

// Synthesize a tone with a fast attack and exponential decay so it sounds
// "tight" rather than droning. Returns Int16 samples.
function tone({ freq, durationMs, sampleRate = SAMPLE_RATE, gain = 0.45 }) {
  const samples = Math.round((durationMs / 1000) * sampleRate)
  const attackSamples = Math.round(0.005 * sampleRate)        // 5ms attack
  const decaySamples  = samples - attackSamples
  const out = new Int16Array(samples)
  for (let i = 0; i < samples; i++) {
    let env
    if (i < attackSamples) env = i / attackSamples
    else env = Math.exp(-3 * (i - attackSamples) / decaySamples)
    // Fundamental + a little 2nd harmonic for warmth.
    const t = i / sampleRate
    const wave =
      Math.sin(2 * Math.PI * freq * t) * 0.85 +
      Math.sin(2 * Math.PI * freq * 2 * t) * 0.15
    out[i] = Math.max(-32767, Math.min(32767, Math.round(wave * env * gain * 32767)))
  }
  return out
}

function silence(durationMs, sampleRate = SAMPLE_RATE) {
  return new Int16Array(Math.round((durationMs / 1000) * sampleRate))
}

function concat(...chunks) {
  const total = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Int16Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

function buildWav(samples) {
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  let p = 0
  buffer.write('RIFF', p); p += 4
  buffer.writeUInt32LE(36 + dataSize, p); p += 4
  buffer.write('WAVE', p); p += 4
  buffer.write('fmt ', p); p += 4
  buffer.writeUInt32LE(16, p); p += 4                       // chunk size
  buffer.writeUInt16LE(1, p); p += 2                        // PCM
  buffer.writeUInt16LE(CHANNELS, p); p += 2
  buffer.writeUInt32LE(SAMPLE_RATE, p); p += 4
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE / 8, p); p += 4
  buffer.writeUInt16LE(CHANNELS * BITS_PER_SAMPLE / 8, p); p += 2
  buffer.writeUInt16LE(BITS_PER_SAMPLE, p); p += 2
  buffer.write('data', p); p += 4
  buffer.writeUInt32LE(dataSize, p); p += 4
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], p)
    p += 2
  }
  return buffer
}

const audio = concat(
  tone({ freq: 1100, durationMs: 200, gain: 0.5 }),
  silence(60),
  tone({ freq: 1500, durationMs: 250, gain: 0.55 }),
  silence(40),
)

const out = path.resolve(__dirname, '..', 'public', 'sounds', 'alert.wav')
fs.writeFileSync(out, buildWav(audio))
console.log(`✓ Wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)
