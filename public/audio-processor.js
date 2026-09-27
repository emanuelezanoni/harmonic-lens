class MicrophoneProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    const frameLength = channels?.[0]?.length ?? 0;

    if (frameLength > 0) {
      const frame = new Float32Array(frameLength);
      // Analysis contract: average every delivered channel into deterministic mono.
      // One output allocation per render quantum; transfer ownership to UI thread.
      for (let sampleIndex = 0; sampleIndex < frameLength; sampleIndex += 1) {
        let sum = 0;
        for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
          sum += channels[channelIndex][sampleIndex];
        }
        frame[sampleIndex] = sum / channels.length;
      }
      this.port.postMessage(
        {
          frame,
          sampleRate,
          timestamp: currentTime,
          channelCount: channels.length
        },
        [frame.buffer]
      );
    }

    return true;
  }
}

registerProcessor("microphone-processor", MicrophoneProcessor);
