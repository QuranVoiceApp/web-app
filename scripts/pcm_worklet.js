class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._seq = 0;
  }
  process(inputs) {
    const ch0 = inputs && inputs[0] && inputs[0][0];
    if (ch0) {
      // Copy to detach from ring buffer
      this.port.postMessage({ seq: this._seq++, data: ch0.slice(0) });
    }
    return true;
  }
}

registerProcessor('pcm-capture', PCMProcessor);

