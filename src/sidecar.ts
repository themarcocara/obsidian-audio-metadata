import { App, TFile, TAbstractFile } from "obsidian";
import { buildMarkdown } from "./format";
import { freePath, isAudioFile, parseAudio, saveArt } from "./metadata";

/**
 * Frontmatter marker that positively identifies a file as one of our sidecars.
 * The only reliable way to tell them apart from a user's own notes.
 */
export const SIDECAR_MARKER = "audio-tags-sidecar";

/** True if this markdown file is a sidecar written by this plugin. */
export function isSidecar(app: App, file: TFile): boolean {
  if (file.extension !== "md") return false;
  return app.metadataCache.getFileCache(file)?.frontmatter?.[SIDECAR_MARKER] === true;
}

/** Every sidecar in the vault, by marker. */
export function allSidecars(app: App): TFile[] {
  return app.vault.getMarkdownFiles().filter((f) => isSidecar(app, f));
}

/** Every audio file in the vault that this plugin can parse. */
export function allAudioFiles(app: App): TFile[] {
  return app.vault.getFiles().filter((f) => isAudioFile(f.path));
}

/** The sidecar for an audio file, if one exists (matched by frontmatter link). */
export function sidecarFor(app: App, audio: TFile): TFile | null {
  const linkA = `[[${audio.name}]]`;
  const linkB = `[[${audio.basename}]]`;
  for (const other of allSidecars(app)) {
    const av = app.metadataCache.getFileCache(other)?.frontmatter?.audio;
    if (av === linkA || av === linkB || av === audio.name || av === audio.basename) return other;
  }
  return null;
}

/**
 * Ensure a searchable sidecar ".md" exists next to an audio file.
 * Placed in the user's attachment folder (respecting their setting). Never
 * overwrites an existing sidecar, so hand edits survive. Returns the path or null.
 */
export async function ensureSidecar(app: App, audio: TFile): Promise<string | null> {
  try {
    const existing = sidecarFor(app, audio);
    if (existing) return existing.path;

    const parsed = await parseAudio(app, audio);
    if (!parsed) return null;

    const poster = parsed.picture ? await saveArt(app, audio, parsed.picture) : null;

    // Next to the audio file, not relative to it (applying the attachment-folder
    // rule to the audio's own path nests it: a/attachments -> a/attachments/attachments).
    const dir = audio.parent?.path ?? "";
    const target = freePath(app, dir, `${audio.basename}.md`);
    const md = buildMarkdown(parsed.tags, audio.name, poster, true);
    const file = await app.vault.create(target, md);
    return file.path;
  } catch (e) {
    console.error("[audio-tags] failed to create sidecar for", audio.path, e);
    return null;
  }
}

export interface BatchResult {
  done: number;
  failed: number;
}

/** Generate missing sidecars for every audio file in the vault. */
export async function generateAllSidecars(
  app: App,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult> {
  const audios = allAudioFiles(app);
  let done = 0;
  let failed = 0;
  for (const audio of audios) {
    const path = await ensureSidecar(app, audio);
    if (path) done++;
    else failed++;
    onProgress?.(done + failed, audios.length);
  }
  return { done, failed };
}

/** Move every sidecar to the system trash. */
export async function removeAllSidecars(
  app: App,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult> {
  const sidecars = allSidecars(app);
  let done = 0;
  let failed = 0;
  for (const file of sidecars as TAbstractFile[]) {
    try {
      await app.fileManager.trashFile(file);
      done++;
    } catch (e) {
      console.error("[audio-tags] failed to trash sidecar", file.path, e);
      failed++;
    }
    onProgress?.(done + failed, sidecars.length);
  }
  return { done, failed };
}
