class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    this.port.onmessage = (e) => {
      if (e.data instanceof Float32Array) {
        const merged = new Float32Array(this._buffer.length + e.data.length);
        merged.set(this._buffer);
        merged.set(e.data, this._buffer.length);
        this._buffer = merged;
      } else if (e.data === 'clear') {
        this._buffer = new Float32Array(0);
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    const len = output.length;

    if (this._buffer.length >= len) {
      output.set(this._buffer.subarray(0, len));
      this._buffer = this._buffer.subarray(len);
    } else {
      output.set(this._buffer);
      output.fill(0, this._buffer.length);
      this._buffer = new Float32Array(0);
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PcmPlayerProcessor);
