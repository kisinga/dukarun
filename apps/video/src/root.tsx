import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import { Composition } from 'remotion';
import creditScriptJson from '../projects/credit-communications/script.json';
import creditVoiceJson from '../projects/credit-communications/voice.json';
import overviewScriptJson from '../projects/product-overview/script.json';
import overviewVoiceJson from '../projects/product-overview/voice.json';
import saleRecordsScriptJson from '../projects/sale-records/script.json';
import saleRecordsVoiceJson from '../projects/sale-records/voice.json';
import stockDecisionsScriptJson from '../projects/stock-decisions/script.json';
import stockDecisionsVoiceJson from '../projects/stock-decisions/voice.json';
import { FORMAT_CONFIG } from './brand';
import { PilotVideo } from './pilot-video';
import { CompositionPropsSchema, ScriptManifestSchema, VoiceRuntimeSchema, type RenderTarget } from './schema';
import './styles.css';

const voices = new Map(
  [overviewVoiceJson, saleRecordsVoiceJson, creditVoiceJson, stockDecisionsVoiceJson].map(
    voice => {
      const parsed = VoiceRuntimeSchema.parse(voice);
      return [parsed.projectId, parsed];
    }
  )
);

const manifests = [
  overviewScriptJson,
  saleRecordsScriptJson,
  creditScriptJson,
  stockDecisionsScriptJson,
].map(manifest => ScriptManifestSchema.parse(manifest));
const targets: RenderTarget[] = ['wide', 'vertical', 'square'];

export function compositionId(projectId: string, target: RenderTarget): string {
  return `${projectId}-full-${target}`;
}

export function VideoRoot() {
  return (
    <>
      {manifests.flatMap(manifest =>
        targets.map(target => {
          const dimensions = FORMAT_CONFIG[target];
          const id = compositionId(manifest.projectId, target);
          return (
            <Composition
              key={id}
              id={id}
              component={PilotVideo}
              width={dimensions.width}
              height={dimensions.height}
              fps={manifest.fps}
              durationInFrames={manifest.durationInFrames}
              schema={CompositionPropsSchema}
              defaultProps={{
                manifest,
                target,
                review: false,
                voice: voices.get(manifest.projectId) ?? null,
              }}
            />
          );
        })
      )}
    </>
  );
}
