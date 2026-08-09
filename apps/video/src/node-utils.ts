import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApprovalRecordSchema,
  ScriptManifestSchema,
  VoiceRuntimeSchema,
  type ApprovalRecord,
  type ScriptManifest,
  type VoiceRuntime,
} from './schema';

export const videoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(videoRoot, '../..');

export function projectDirectory(projectId: string): string {
  if (!/^[a-z0-9-]+$/u.test(projectId)) throw new Error(`Invalid project id: ${projectId}`);
  return path.join(videoRoot, 'projects', projectId);
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashFile(file: string): Promise<string> {
  return sha256(await readFile(file));
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readScript(projectId: string): Promise<ScriptManifest> {
  return ScriptManifestSchema.parse(
    await readJson(path.join(projectDirectory(projectId), 'script.json'))
  );
}

export async function readVoice(projectId: string): Promise<VoiceRuntime | null> {
  try {
    return VoiceRuntimeSchema.parse(
      await readJson(path.join(projectDirectory(projectId), 'voice.json'))
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function scriptInputHash(manifest: ScriptManifest): string {
  return sha256(stableJson(manifest));
}

export async function finalInputHash(
  manifest: ScriptManifest,
  voice: VoiceRuntime | null
): Promise<string> {
  let audioHash: string | null = null;
  if (voice?.masterAudioFile)
    audioHash = await hashFile(path.join(videoRoot, 'public', voice.masterAudioFile));
  const segmentAudioHashes = await Promise.all(
    manifest.narration
      .filter(segment => Boolean(segment.audioFile))
      .map(async segment => ({
        id: segment.id,
        hash: await hashFile(path.join(videoRoot, 'public', segment.audioFile!)),
      }))
  );
  return sha256(stableJson({ manifest, voice, audioHash, segmentAudioHashes }));
}

export async function readApproval(
  projectId: string,
  stage: 'script' | 'final'
): Promise<ApprovalRecord> {
  return ApprovalRecordSchema.parse(
    await readJson(path.join(projectDirectory(projectId), `approval.${stage}.json`))
  );
}

export async function assertScriptApproved(
  projectId: string,
  manifest: ScriptManifest
): Promise<ApprovalRecord> {
  const approval = await readApproval(projectId, 'script');
  if (approval.inputHash !== scriptInputHash(manifest)) {
    throw new Error('The script changed after approval. Run approve-script again.');
  }
  return approval;
}

export function formatSrtTimestamp(frames: number, fps: number): string {
  const milliseconds = Math.round((frames / fps) * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function formatVttTimestamp(frames: number, fps: number): string {
  return formatSrtTimestamp(frames, fps).replace(',', '.');
}

export function manifestToSrt(manifest: ScriptManifest): string {
  return `${manifest.narration
    .map(
      (segment, index) =>
        `${index + 1}\n${formatSrtTimestamp(segment.startFrame, manifest.fps)} --> ${formatSrtTimestamp(segment.endFrame, manifest.fps)}\n${segment.text}`
    )
    .join('\n\n')}\n`;
}

export function manifestToVtt(manifest: ScriptManifest): string {
  return `WEBVTT\n\n${manifest.narration
    .map(
      (segment, index) =>
        `${index + 1}\n${formatVttTimestamp(segment.startFrame, manifest.fps)} --> ${formatVttTimestamp(segment.endFrame, manifest.fps)}\n${segment.text}`
    )
    .join('\n\n')}\n`;
}
