import { Audio } from '@remotion/media';
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from 'remotion';
import type { CompositionProps, NarrationSegment } from './schema';
import { SceneRenderer } from './scenes';
import { timelineFor } from './timeline';

function activeCaption(segments: readonly NarrationSegment[], frame: number): string | null {
  const segment = segments.find(item => frame >= item.startFrame && frame < item.endFrame);
  if (!segment) return null;
  const words = segment.text.split(/\s+/u);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 8)
    chunks.push(words.slice(index, index + 8).join(' '));
  const progress = (frame - segment.startFrame) / (segment.endFrame - segment.startFrame);
  return chunks[Math.min(chunks.length - 1, Math.floor(progress * chunks.length))];
}

export function PilotVideo({ manifest, target, cutdown, review, voice }: CompositionProps) {
  const frame = useCurrentFrame();
  const scenes = timelineFor(manifest, cutdown);
  const caption = cutdown === 'full' ? activeCaption(manifest.narration, frame) : null;
  const segmentAudio = manifest.narration.filter(segment => Boolean(segment.audioFile));
  const masterVolume = (audioFrame: number) =>
    segmentAudio.some(segment => audioFrame >= segment.startFrame && audioFrame < segment.endFrame)
      ? 0
      : 1;
  return (
    <AbsoluteFill className={`video-root ${target}`}>
      {scenes.map(scene => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
          premountFor={30}
        >
          <SceneRenderer scene={scene} target={target} />
        </Sequence>
      ))}
      {cutdown === 'full' && voice?.masterAudioFile ? (
        <Audio src={staticFile(voice.masterAudioFile)} volume={masterVolume} />
      ) : null}
      {cutdown === 'full'
        ? segmentAudio.map(segment => (
            <Sequence
              key={`audio-${segment.id}`}
              from={segment.startFrame}
              durationInFrames={segment.endFrame - segment.startFrame}
            >
              <Audio src={staticFile(segment.audioFile!)} volume={1} />
            </Sequence>
          ))
        : null}
      {caption ? (
        <div className="caption">
          <span>{caption}</span>
        </div>
      ) : null}
      {review ? <div className="draft-watermark">DRAFT</div> : null}
    </AbsoluteFill>
  );
}
