/* 浏览器 WAV 录音器: 采集麦克风 → 16kHz 16bit 单声道 WAV base64 (供服务端火山ASR识别)
 * 注意: getUserMedia 仅在 HTTPS 或 localhost 下可用 */
(function () {
  window.WavRecorder = {
    _ctx: null, _stream: null, _proc: null, _src: null, _chunks: [], _srcRate: 48000,
    recording: false,

    supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    secureHint() {
      return (location.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(location.hostname))
        ? '当前地址非 HTTPS，浏览器禁用了麦克风。请通过 localhost 访问，或等域名 HTTPS 配好后使用' : '';
    },

    async start() {
      if (this.recording) return;
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const AC = window.AudioContext || window.webkitAudioContext;
      this._ctx = new AC();
      this._srcRate = this._ctx.sampleRate;
      this._src = this._ctx.createMediaStreamSource(this._stream);
      this._proc = this._ctx.createScriptProcessor(4096, 1, 1);
      this._chunks = [];
      this._proc.onaudioprocess = (e) => {
        if (!this.recording) return;
        this._chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      this._src.connect(this._proc);
      this._proc.connect(this._ctx.destination);
      this.recording = true;
    },

    async stop() {
      this.recording = false;
      try { this._proc && this._proc.disconnect(); this._src && this._src.disconnect(); } catch (e) {}
      try { (this._stream && this._stream.getTracks() || []).forEach(t => t.stop()); } catch (e) {}
      try { this._ctx && await this._ctx.close(); } catch (e) {}
      // 合并 + 重采样到 16k
      let len = 0; this._chunks.forEach(c => len += c.length);
      const pcm = new Float32Array(len);
      let off = 0; this._chunks.forEach(c => { pcm.set(c, off); off += c.length; });
      this._chunks = [];
      const target = 16000;
      const ratio = this._srcRate / target;
      const outLen = Math.floor(pcm.length / ratio);
      const out = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const v = pcm[Math.floor(i * ratio)] || 0;
        out[i] = Math.max(-1, Math.min(1, v)) * 0x7fff;
      }
      const seconds = outLen / target;
      return { base64: this._wav(out, target), seconds };
    },

    _wav(samples, rate) {
      const buf = new ArrayBuffer(44 + samples.length * 2);
      const v = new DataView(buf);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      ws(36, 'data'); v.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
      // ArrayBuffer -> base64
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
})();
