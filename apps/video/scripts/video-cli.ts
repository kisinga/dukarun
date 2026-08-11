import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { config as loadEnvironment } from 'dotenv';
import { shippedClaimIds } from '../src/claims';
import {
  assertScriptApproved,
  finalInputHash,
  hashFile,
  manifestToSrt,
  manifestToVtt,
  projectDirectory,
  readApproval,
  readJson,
  readScript,
  readVoice,
  repoRoot,
  scriptInputHash,
  sha256,
  videoRoot,
  writeJson,
} from '../src/node-utils';
import {
  ApprovalRecordSchema,
  NarrationModeSchema,
  VideoBriefSchema,
  VoiceRuntimeSchema,
  validateManifest,
  type ApprovalRecord,
  type NarrationMode,
  type ScriptManifest,
  type VoiceRuntime,
} from '../src/schema';
loadEnvironment({ path: path.join(repoRoot, '.env'), quiet: true });

const execFileAsync = promisify(execFile);
const DEFAULT_PROJECT = 'product-overview';

type Arguments = {
  command: string;
  projectId: string;
  approver?: string;
  mode?: NarrationMode;
  file?: string;
  only?: string;
};

function parseArguments(argv: string[]): Arguments {
  const command = argv[0];
  if (!command)
    throw new Error(
      'Usage: video-cli.ts <approve-script|voice|render-review|approve-final|render-final> [options]'
    );
  const options = new Map<string, string>();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    options.set(token.slice(2), value);
    index += 1;
  }
  const modeValue = options.get('mode');
  return {
    command,
    projectId: options.get('project') ?? DEFAULT_PROJECT,
    approver: options.get('approver'),
    mode: modeValue ? NarrationModeSchema.parse(modeValue) : undefined,
    file: options.get('file'),
    only: options.get('only'),
  };
}

function requireOption(value: string | undefined, option: string): string {
  if (!value) throw new Error(`Missing required option: --${option}`);
  return value;
}

async function approveScript(projectId: string, approver: string): Promise<void> {
  const directory = projectDirectory(projectId);
  const draftFile = path.join(directory, 'script.draft.json');
  let sourceFile = path.join(directory, 'script.json');
  try {
    await access(draftFile);
    sourceFile = draftFile;
  } catch {
    // The checked-in pilot script can be approved without generating a new draft.
  }
  const brief = VideoBriefSchema.parse(await readJson(path.join(directory, 'brief.json')));
  const manifest = validateManifest(
    await readJson(sourceFile),
    shippedClaimIds,
    brief.targetWordRange
  );
  if (sourceFile === draftFile) await copyFile(draftFile, path.join(directory, 'script.json'));
  const approval = ApprovalRecordSchema.parse({
    projectId,
    stage: 'script',
    inputHash: scriptInputHash(manifest),
    approver,
    approvedAt: new Date().toISOString(),
    promptVersion: manifest.promptVersion,
    model: manifest.model,
  });
  await writeJson(path.join(directory, 'approval.script.json'), approval);
  console.log(`Script approved by ${approver}.`);
}

async function normalizeAudio(input: string, output: string): Promise<void> {
  await mkdir(path.dirname(output), { recursive: true });
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    input,
    '-af',
    'loudnorm=I=-16:LRA=11:TP=-1.5',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    output,
  ]);
}

async function audioDurationSeconds(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error(`Could not read audio duration: ${file}`);
  return duration;
}

async function createVoice(
  projectId: string,
  mode: NarrationMode,
  sourceFile?: string
): Promise<void> {
  const manifest = await readScript(projectId);
  await assertScriptApproved(projectId, manifest);
  const project = projectDirectory(projectId);
  const generatedDirectory = path.join(videoRoot, 'public', 'generated', projectId);
  await mkdir(generatedDirectory, { recursive: true });
  const output = path.join(generatedDirectory, 'narration.m4a');
  const targetSeconds = manifest.durationInFrames / manifest.fps;
  let masterAudioFile: string | null = null;

  if (mode === 'human' || mode === 'mixed') {
    const input = path.resolve(repoRoot, requireOption(sourceFile, 'file'));
    await access(input);
    await normalizeAudio(input, output);
    const durationDifference = Math.abs((await audioDurationSeconds(output)) - targetSeconds);
    if (durationDifference > 3) {
      throw new Error(`Human narration must be within 3 seconds of the ${targetSeconds}s video.`);
    }
    masterAudioFile = `generated/${projectId}/narration.m4a`;
  }

  const voice = VoiceRuntimeSchema.parse({
    projectId,
    mode,
    masterAudioFile,
    generatedAt: new Date().toISOString(),
    sourceHash: masterAudioFile ? await hashFile(output) : sha256('silent'),
    transcript: null,
  });
  await writeJson(path.join(project, 'voice.json'), voice);
  console.log(
    mode === 'silent' ? 'Silent delivery configured.' : `Narration ready: ${masterAudioFile}`
  );
}

async function approveFinal(projectId: string, approver: string): Promise<void> {
  const manifest = await readScript(projectId);
  await assertScriptApproved(projectId, manifest);
  const voice = await readVoice(projectId);
  const approval: ApprovalRecord = {
    projectId,
    stage: 'final',
    inputHash: await finalInputHash(manifest, voice),
    approver,
    approvedAt: new Date().toISOString(),
    promptVersion: manifest.promptVersion,
    model: manifest.model,
  };
  await writeJson(path.join(projectDirectory(projectId), 'approval.final.json'), approval);
  console.log(`Final inputs approved by ${approver}.`);
}

async function assertFinalApproved(
  projectId: string,
  manifest: ScriptManifest,
  voice: VoiceRuntime | null
): Promise<void> {
  const approval = await readApproval(projectId, 'final');
  if (approval.inputHash !== (await finalInputHash(manifest, voice))) {
    throw new Error('Script or voice changed after final approval. Run approve-final again.');
  }
}

async function render(projectId: string, review: boolean, only?: string): Promise<void> {
  const manifest = await readScript(projectId);
  await assertScriptApproved(projectId, manifest);
  const voice = await readVoice(projectId);
  if (!review) await assertFinalApproved(projectId, manifest, voice);

  const brief = VideoBriefSchema.parse(
    await readJson(path.join(projectDirectory(projectId), 'brief.json'))
  );
  const requested = only ? new Set(only.split(',').map(value => value.trim())) : null;
  const renderJobs = brief.renderTargets
    .map(target => ({
      target,
      id: `${projectId}-full-${target}`,
    }))
    .filter(job => !requested || requested.has(job.id));
  if (renderJobs.length === 0)
    throw new Error('No compositions matched --only. Use comma-separated composition IDs.');

  console.log('Bundling Remotion project…');
  const serveUrl = await bundle({
    entryPoint: path.join(videoRoot, 'src', 'index.ts'),
    publicDir: path.join(videoRoot, 'public'),
    onProgress: progress => process.stdout.write(`\rBundle ${Math.round(progress)}%`),
  });
  process.stdout.write('\n');
  const outputDirectory = path.join(videoRoot, 'output', review ? 'review' : 'final', projectId);
  await mkdir(outputDirectory, { recursive: true });
  const artifacts: Array<{
    composition: string;
    video: string;
    thumbnail: string;
    sha256: string;
  }> = [];

  for (const [index, job] of renderJobs.entries()) {
    console.log(`[${index + 1}/${renderJobs.length}] Rendering ${job.id}`);
    const inputProps = { manifest, target: job.target, review, voice };
    const composition = await selectComposition({ serveUrl, id: job.id, inputProps });
    const videoFile = path.join(outputDirectory, `${job.id}.mp4`);
    const thumbnailFile = path.join(outputDirectory, `${job.id}.png`);
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: 'h264',
      pixelFormat: 'yuv420p',
      audioCodec: 'aac',
      outputLocation: videoFile,
      overwrite: true,
      concurrency: process.env.VIDEO_RENDER_CONCURRENCY ?? null,
      logLevel: 'warn',
    });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame: Math.min(60, composition.durationInFrames - 1),
      imageFormat: 'png',
      output: thumbnailFile,
      overwrite: true,
      logLevel: 'warn',
    });
    artifacts.push({
      composition: job.id,
      video: path.relative(outputDirectory, videoFile),
      thumbnail: path.relative(outputDirectory, thumbnailFile),
      sha256: await hashFile(videoFile),
    });
  }

  await writeFile(
    path.join(outputDirectory, `${projectId}.en-KE.srt`),
    manifestToSrt(manifest),
    'utf8'
  );
  await writeFile(
    path.join(outputDirectory, `${projectId}.en-KE.vtt`),
    manifestToVtt(manifest),
    'utf8'
  );
  await writeJson(path.join(outputDirectory, 'delivery-manifest.json'), {
    projectId,
    review,
    generatedAt: new Date().toISOString(),
    inputHash: await finalInputHash(manifest, voice),
    artifacts,
  });
  console.log(`Delivery ready: ${path.relative(repoRoot, outputDirectory)}`);
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  switch (args.command) {
    case 'approve-script':
      await approveScript(args.projectId, requireOption(args.approver, 'approver'));
      return;
    case 'voice':
      await createVoice(args.projectId, args.mode ?? 'silent', args.file);
      return;
    case 'render-review':
      await render(args.projectId, true, args.only);
      return;
    case 'approve-final':
      await approveFinal(args.projectId, requireOption(args.approver, 'approver'));
      return;
    case 'render-final':
      await render(args.projectId, false, args.only);
      return;
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
