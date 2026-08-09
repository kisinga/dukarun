import { z } from 'zod';

export const RenderTargetSchema = z.enum(['wide', 'vertical', 'square']);
export type RenderTarget = z.infer<typeof RenderTargetSchema>;

export const NarrationModeSchema = z.enum(['human', 'mixed', 'silent']);
export type NarrationMode = z.infer<typeof NarrationModeSchema>;

export const SceneTemplateSchema = z.enum([
  'brand-hook',
  'phone-pos',
  'offline-state',
  'sync-state',
  'receipt',
  'ledger-posting',
  'dashboard-summary',
  'cta',
]);
export type SceneTemplate = z.infer<typeof SceneTemplateSchema>;

export const ClaimSchema = z.object({
  id: z.string().min(1),
  wording: z.string().min(1),
  status: z.enum(['shipped', 'preview', 'planned']),
  source: z.string().min(1),
  contexts: z.array(z.enum(['overview', 'walkthrough', 'marketing'])).min(1),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const VideoBriefSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  audience: z.string().min(1),
  objective: z.string().min(1),
  language: z.string().default('en-KE'),
  targetDurationSeconds: z.number().positive(),
  targetWordRange: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  claimIds: z.array(z.string()).min(1),
  callToAction: z.string().min(1),
  narrationMode: NarrationModeSchema,
  renderTargets: z.array(RenderTargetSchema).min(1),
});
export type VideoBrief = z.infer<typeof VideoBriefSchema>;

export const NarrationSegmentSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(['script', 'file']).default('script'),
  audioFile: z.string().nullable().default(null),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
});
export type NarrationSegment = z.infer<typeof NarrationSegmentSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  template: SceneTemplateSchema,
  startFrame: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  headline: z.string().min(1),
  body: z.string().default(''),
  claimIds: z.array(z.string()),
  narrationSegmentIds: z.array(z.string()),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
});
export type Scene = z.infer<typeof SceneSchema>;

export const ScriptManifestSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  language: z.string().default('en-KE'),
  fps: z.literal(30),
  durationInFrames: z.number().int().positive(),
  promptVersion: z.string().min(1),
  model: z.string().min(1),
  callToAction: z.string().min(1),
  narration: z.array(NarrationSegmentSchema).min(1),
  scenes: z.array(SceneSchema).min(1),
});
export type ScriptManifest = z.infer<typeof ScriptManifestSchema>;

export const VoiceRuntimeSchema = z.object({
  projectId: z.string(),
  mode: NarrationModeSchema,
  masterAudioFile: z.string().nullable(),
  generatedAt: z.string(),
  sourceHash: z.string(),
  transcript: z.string().nullable().default(null),
});
export type VoiceRuntime = z.infer<typeof VoiceRuntimeSchema>;

export const ApprovalRecordSchema = z.object({
  projectId: z.string(),
  stage: z.enum(['script', 'final']),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  approver: z.string().min(1),
  approvedAt: z.string().datetime(),
  promptVersion: z.string(),
  model: z.string(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export const CompositionPropsSchema = z.object({
  manifest: ScriptManifestSchema,
  target: RenderTargetSchema,
  cutdown: z.enum(['full', 'offline', 'ledger', 'dashboard']).default('full'),
  review: z.boolean().default(false),
  voice: VoiceRuntimeSchema.nullable().default(null),
});
export type CompositionProps = z.infer<typeof CompositionPropsSchema>;

export function countWords(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function validateManifest(
  value: unknown,
  shippedClaimIds: ReadonlySet<string>,
  wordRange?: readonly [number, number]
): ScriptManifest {
  const manifest = ScriptManifestSchema.parse(value);
  const narrationIds = new Set(manifest.narration.map(segment => segment.id));
  const sceneIds = new Set<string>();

  for (const scene of manifest.scenes) {
    if (sceneIds.has(scene.id)) throw new Error(`Duplicate scene id: ${scene.id}`);
    sceneIds.add(scene.id);
    if (scene.startFrame + scene.durationInFrames > manifest.durationInFrames) {
      throw new Error(`Scene ${scene.id} exceeds the composition duration`);
    }
    for (const claimId of scene.claimIds) {
      if (!shippedClaimIds.has(claimId)) throw new Error(`Unsupported claim: ${claimId}`);
    }
    for (const narrationId of scene.narrationSegmentIds) {
      if (!narrationIds.has(narrationId)) {
        throw new Error(`Scene ${scene.id} references missing narration: ${narrationId}`);
      }
    }
  }

  const words = countWords(manifest.narration.map(segment => segment.text).join(' '));
  if (wordRange && (words < wordRange[0] || words > wordRange[1])) {
    throw new Error(`Narration has ${words} words; expected ${wordRange[0]}–${wordRange[1]}`);
  }

  return manifest;
}
