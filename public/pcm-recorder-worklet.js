class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 2048;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0];
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    if (this._buffer.length >= this._bufferSize) {
      const pcm16 = new Int16Array(this._buffer.splice(0, this._bufferSize));
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.port.postMessage({ base64: btoa(binary) });
    }

    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorderProcessor);
