import { App, TFile } from "obsidian";
import { parseBuffer, selectCover, type IPicture } from "music-metadata";
import { AudioTags, extForMime, pathIn, uniqueName } from "./format";

/** Audio extensions supported by music-metadata's browser parsers. */
export const AUDIO_EXTENSIONS = new Set([
  "mp1", "mp2", "mp3", "m2a", "aac", "aacp",
  "mp4", "m4a", "m4b", "m4pa", "m4v", "m4r", "3gp", "mov", "movie", "qt",
  "flac", "ogg", "ogv", "oga", "ogm", "ogx", "opus", "spx",
  "wav", "wave", "bwf", "aif", "aiff", "aifc",
  "ape", "asf", "wma", "wmv", "caf", "caff", "dff", "dsf",
  "mka", "mkv", "mk3d", "mks", "webm", "mpc", "wv", "wvp",
]);

export function isAudioFile(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return false;
  return AUDIO_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/** MIME type for a file extension, so parseBuffer can pick the right parser. */
function mimeForExt(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case "mp3": case "mp2": case "mp1": return "audio/mpeg";
    case "m4a": case "m4b": case "mp4": case "aac": return "audio/mp4";
    case "flac": return "audio/flac";
    case "ogg": case "oga": case "opus": case "spx": return "audio/ogg";
    case "wav": case "wave": case "bwf": return "audio/wav";
    case "aif": case "aiff": case "aifc": return "audio/aiff";
    case "wma": case "asf": return "audio/x-ms-wma";
    case "webm": return "audio/webm";
    case "ape": return "audio/ape";
    default: return undefined;
  }
}

export interface ParsedAudio {
  tags: AudioTags;
  picture: IPicture | null;
}

/** Read and parse an audio file from the vault. Returns null on any failure. */
export async function parseAudio(app: App, file: TFile): Promise<ParsedAudio | null> {
  try {
    const buf = await app.vault.readBinary(file);
    const ext = file.extension;
    const metadata = await parseBuffer(new Uint8Array(buf), mimeForExt(ext), { duration: true });
    return { tags: metadata as unknown as AudioTags, picture: selectCover(metadata.common.picture) };
  } catch (e) {
    console.error("[audio-tags] failed to parse", file.path, e);
    return null;
  }
}

/**
 * Save album art next to the audio file and return its vault path, or null.
 * Reuses an existing same-named file so re-processing a track (and the note
 * insert + sidecar both pointing at the same art) yields exactly one file.
 */
export async function saveArt(
  app: App,
  audio: TFile,
  picture: IPicture,
): Promise<string | null> {
  try {
    const ext = extForMime(picture.format);
    const dir = audio.parent?.path ?? "";
    const name = `${audio.basename}.${ext}`;

    const existing = app.vault.getAbstractFileByPath(pathIn(dir, name));
    if (existing instanceof TFile) return existing.path;

    const target = freePath(app, dir, name);
    // Copy into a fresh ArrayBuffer of exactly the picture bytes.
    await app.vault.createBinary(target, new Uint8Array(picture.data).buffer);
    return target;
  } catch (e) {
    console.error("[audio-tags] failed to save art", e);
    return null;
  }
}

/** First free path for `name` inside `dir`, appending " 1", " 2", ... on collision. */
export function freePath(app: App, dir: string, name: string): string {
  return pathIn(dir, uniqueName(name, (n) => app.vault.getAbstractFileByPath(pathIn(dir, n)) !== null));
}
