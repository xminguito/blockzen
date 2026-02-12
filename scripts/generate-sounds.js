/**
 * Generate minimal WAV sound effects for BlockZen.
 *
 * Produces 4 tiny WAV files:
 *  - place.wav   : short "plop" (60ms, 440Hz → 220Hz descending)
 *  - clear.wav   : sparkle chime (200ms, ascending arpegio)
 *  - combo.wav   : power chord (300ms, two layered tones)
 *  - gameover.wav : descending sad tone (400ms)
 *
 * Run: node scripts/generate-sounds.js
 */

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

// ── WAV writer ──────────────────────────────────────────────────────────

function writeWav(filename, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * 2; // 16-bit mono
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);     // chunk size
  buffer.writeUInt16LE(1, 20);      // PCM
  buffer.writeUInt16LE(1, 22);      // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32);      // block align
  buffer.writeUInt16LE(16, 34);     // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`  ✓ ${filename} (${(buffer.length / 1024).toFixed(1)} KB, ${(numSamples / SAMPLE_RATE * 1000).toFixed(0)}ms)`);
}

// ── Sound generators ────────────────────────────────────────────────────

function generatePlace() {
  const duration = 0.06; // 60ms
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / numSamples;
    // Descending frequency 440→220Hz with quick fade
    const freq = 440 - 220 * progress;
    const envelope = 1 - progress; // linear fade
    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.6;
  }
  return samples;
}

function generateClear() {
  const duration = 0.22; // 220ms
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / numSamples;
    // Ascending sparkle: 523→1047Hz (C5→C6)
    const freq = 523 + 524 * progress;
    // Add harmonic shimmer
    const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
    const envelope = Math.sin(Math.PI * progress); // bell curve
    samples[i] = (Math.sin(2 * Math.PI * freq * t) + harmonic) * envelope * 0.5;
  }
  return samples;
}

function generateCombo() {
  const duration = 0.30; // 300ms
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / numSamples;
    // Power chord: two layered tones ascending
    const baseFreq = 440 + 440 * progress;
    const fifthFreq = baseFreq * 1.5;
    const octaveFreq = baseFreq * 2;
    const envelope = Math.pow(1 - progress, 0.5); // slow decay
    samples[i] = (
      Math.sin(2 * Math.PI * baseFreq * t) * 0.35 +
      Math.sin(2 * Math.PI * fifthFreq * t) * 0.2 +
      Math.sin(2 * Math.PI * octaveFreq * t) * 0.1
    ) * envelope * 0.7;
  }
  return samples;
}

function generateGameOver() {
  const duration = 0.45; // 450ms
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / numSamples;
    // Descending sad tone: 440→110Hz (A4→A2)
    const freq = 440 - 330 * progress;
    const envelope = Math.pow(1 - progress, 0.8);
    // Minor third for sadness
    const minor = Math.sin(2 * Math.PI * freq * 1.2 * t) * 0.15;
    samples[i] = (Math.sin(2 * Math.PI * freq * t) + minor) * envelope * 0.5;
  }
  return samples;
}

// ── Main ────────────────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('Generating sound effects...');
writeWav('place.wav', generatePlace());
writeWav('clear.wav', generateClear());
writeWav('combo.wav', generateCombo());
writeWav('gameover.wav', generateGameOver());
console.log('Done!');
