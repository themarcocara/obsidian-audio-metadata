import { App, TFile, normalizePath } from "obsidian";
import { parseBuffer, selectCover, type IPicture } from "music-metadata";
import { AudioTags, extForMime } from "./format";

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
 * Save album art as a vault image and return its vault path, or null on failure.
 * Reuses an existing file with the same name so re-processing a track does not
 * accumulate "song 1.jpg", "song 2.jpg", ...
 */
export async function saveArt(
  app: App,
  audio: TFile,
  picture: IPicture,
  sourcePath: string,
): Promise<string | null> {
  try {
    const ext = extForMime(picture.format);
    const base = audio.basename;
    const desired = normalizePath(
      await app.fileManager.getAvailablePathForAttachment(`${base}.${ext}`, sourcePath),
    );
    const dir = desired.includes("/") ? desired.slice(0, desired.lastIndexOf("/")) : "";
    const candidate = normalizePath(dir ? `${dir}/${base}.${ext}` : `${base}.${ext}`);

    const existing = app.vault.getAbstractFileByPath(candidate);
    if (existing instanceof TFile) return existing.path;

    // Copy into a fresh ArrayBuffer of exactly the picture bytes.
    const data = new Uint8Array(picture.data).buffer;
    await app.vault.createBinary(desired, data);
    return desired;
  } catch (e) {
    console.error("[audio-tags] failed to save art", e);
    return null;
  }
}
