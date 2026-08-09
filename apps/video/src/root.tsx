import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import { Composition } from 'remotion';
import scriptJson from '../projects/offline-pos/script.json';
import { FORMAT_CONFIG } from './brand';
import { PilotVideo } from './pilot-video';
import { CompositionPropsSchema, ScriptManifestSchema, type RenderTarget } from './schema';
import type { Cutdown } from './timeline';
import './styles.css';

const manifest = ScriptManifestSchema.parse(scriptJson);
const cutdowns: Cutdown[] = ['full', 'offline', 'ledger', 'dashboard'];
const targets: RenderTarget[] = ['wide', 'vertical', 'square'];

export function compositionId(cutdown: Cutdown, target: RenderTarget): string { return `offline-pos-${cutdown}-${target}`; }

export function VideoRoot() {
  return <>{cutdowns.flatMap(cutdown => targets.map(target => { const dimensions = FORMAT_CONFIG[target]; return <Composition key={compositionId(cutdown, target)} id={compositionId(cutdown, target)} component={PilotVideo} width={dimensions.width} height={dimensions.height} fps={30} durationInFrames={cutdown === 'full' ? manifest.durationInFrames : 450} schema={CompositionPropsSchema} defaultProps={{ manifest, target, cutdown, review: false, voice: null }} />; }))}</>;
}
