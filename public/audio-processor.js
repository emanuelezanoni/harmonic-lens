class MicrophoneProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];

    if (channel && channel.length > 0) {
      const frame = new Float32Array(channel);
      this.port.postMessage(
        {
          frame,
          sampleRate,
          timestamp: currentTime
        },
        [frame.buffer]
      );
    }

    return true;
  }
}

registerProcessor("microphone-processor", MicrophoneProcessor);
