// Build a RIFF/WAVE buffer from raw little-endian Int16 PCM samples.
// Mono, 16-bit, configurable sample rate.
function int16PcmToWav(int16Samples, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = int16Samples.byteLength;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);          // subchunk1Size for PCM
  buffer.writeUInt16LE(1, 20);           // audio format: PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  Buffer.from(int16Samples.buffer, int16Samples.byteOffset, int16Samples.byteLength).copy(buffer, 44);
  return buffer;
}

module.exports = { int16PcmToWav };
