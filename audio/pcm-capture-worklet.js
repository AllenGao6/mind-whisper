class PCMCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch0 = input[0];
    const int16 = new Int16Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) {
      let s = ch0[i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm-capture', PCMCapture);
