class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.analysisPort = null;
    this.quanta = 0;
    this.port.onmessage = (event) => {
      // Audio goes straight to the analysis worker; the main thread only gets light stats.
      if (event.data?.analysisPort) this.analysisPort = event.data.analysisPort;
    };
  }

  process(inputs) {
    const channels = inputs[0];
    const frameLength = channels?.[0]?.length ?? 0;
    if (frameLength > 0) {
      const frame = new Float32Array(frameLength);
      // Analysis contract: average every delivered channel into deterministic mono.
      for (let sampleIndex = 0; sampleIndex < frameLength; sampleIndex += 1) {
        let sum = 0;
        for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) sum += channels[channelIndex][sampleIndex];
        frame[sampleIndex] = sum / channels.length;
      }
      this.analysisPort?.postMessage({ samples: frame, contextTimeS: currentTime }, [frame.buffer]);
      this.quanta += 1;
      if (this.quanta % 32 === 0) {
        this.port.postMessage({ stats: { sampleRate, channelCount: channels.length, quanta: this.quanta } });
      }
    }
    return true;
  }
}

registerProcessor("microphone-processor", MicrophoneProcessor);
