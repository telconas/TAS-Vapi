class PcmPlayerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._buffer = new Float32Array(0);
    this._inputSampleRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || 16000;
    this._outputSampleRate = sampleRate;
    this._ratio = this._inputSampleRate / this._outputSampleRate;

    // Jitter buffer: target ~300ms of buffered audio before playing
    this._targetBufferFrames = Math.round(0.3 * this._outputSampleRate);
    this._primed = false;
    this._underflowCount = 0;

    // Ring buffer capacity: 2 seconds
    this._capacity = 2 * this._outputSampleRate;
    this._ring = new Float32Array(this._capacity);
    this._writePos = 0;
    this._readPos = 0;
    this._filled = 0;

    this.port.onmessage = (e) => {
      if (e.data instanceof Float32Array) {
        const upsampled = this._upsample(e.data);
        this._write(upsampled);
      } else if (e.data && e.data.type === 'config') {
        this._inputSampleRate = e.data.inputSampleRate || this._inputSampleRate;
        this._ratio = this._inputSampleRate / this._outputSampleRate;
        this._writePos = 0;
        this._readPos = 0;
        this._filled = 0;
        this._primed = false;
      } else if (e.data === 'clear') {
        this._writePos = 0;
        this._readPos = 0;
        this._filled = 0;
        this._primed = false;
      }
    };
  }

  _write(data) {
    for (let i = 0; i < data.length; i++) {
      if (this._filled < this._capacity) {
        this._ring[this._writePos] = data[i];
        this._writePos = (this._writePos + 1) % this._capacity;
        this._filled++;
      }
      // If ring is full, drop oldest (overwrite read position)
      else {
        this._ring[this._writePos] = data[i];
        this._writePos = (this._writePos + 1) % this._capacity;
        this._readPos = (this._readPos + 1) % this._capacity;
      }
    }
  }

  _read(output, len) {
    for (let i = 0; i < len; i++) {
      if (this._filled > 0) {
        output[i] = this._ring[this._readPos];
        this._readPos = (this._readPos + 1) % this._capacity;
        this._filled--;
      } else {
        output[i] = 0;
      }
    }
  }

  _upsample(input) {
    if (this._ratio === 1) return input;

    const outputLength = Math.ceil(input.length / this._ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * this._ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;

      // Cubic (Hermite) interpolation – 4 points
      const a = idx > 0 ? input[idx - 1] : input[0];
      const b = input[idx];
      const c = idx + 1 < input.length ? input[idx + 1] : b;
      const d = idx + 2 < input.length ? input[idx + 2] : c;

      const a00 = d - c - a + b;
      const a01 = a - b - a00;
      const a02 = c - a;
      const a03 = b;

      const val = a00 * frac * frac * frac + a01 * frac * frac + a02 * frac + a03;
      output[i] = val < -1 ? -1 : val > 1 ? 1 : val;
    }
    return output;
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    const len = output.length;

    // Wait until jitter buffer is primed before playing
    if (!this._primed) {
      if (this._filled >= this._targetBufferFrames) {
        this._primed = true;
      } else {
        output.fill(0);
        return true;
      }
    }

    if (this._filled >= len) {
      this._read(output, len);
      this._underflowCount = 0;
    } else {
      // Underrun: play what we have, fill rest with silence
      const available = this._filled;
      this._read(output, available);
      output.fill(0, available);
      this._filled = 0;
      this._primed = false;
      this._underflowCount++;
    }

    return true;
  }
}

registerProcessor('pcm-player-processor', PcmPlayerProcessor);
