class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._buffer = new Float32Array(0);
    this._inputSampleRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || 8000;
    this._outputSampleRate = sampleRate;
    this._ratio = this._inputSampleRate / this._outputSampleRate;

    this.port.onmessage = (e) => {
      if (e.data instanceof Float32Array) {
        const upsampled = this._upsample(e.data);
        const merged = new Float32Array(this._buffer.length + upsampled.length);
        merged.set(this._buffer);
        merged.set(upsampled, this._buffer.length);
        this._buffer = merged;
      } else if (e.data && e.data.type === 'config') {
        this._inputSampleRate = e.data.inputSampleRate || this._inputSampleRate;
        this._ratio = this._inputSampleRate / this._outputSampleRate;
      } else if (e.data === 'clear') {
        this._buffer = new Float32Array(0);
      }
    };
  }

  _upsample(input) {
    if (this._ratio === 1) return input;
    const outputLength = Math.ceil(input.length / this._ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * this._ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, input.length - 1);
      const frac = srcIdx - idx0;
      output[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
    }
    return output;
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
