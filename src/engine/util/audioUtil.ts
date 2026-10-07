import { centralSoundManager } from "../sound/Sound";

export function createReversedAudioBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = centralSoundManager.getListener().context;

  const reversedAudioBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const channelData = reversedAudioBuffer.getChannelData(ch);
    channelData.set(buffer.getChannelData(ch));
    channelData.reverse();
  }

  return reversedAudioBuffer;
}
