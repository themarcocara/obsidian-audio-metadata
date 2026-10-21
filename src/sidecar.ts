import { App, TFile, normalizePath } from "obsidian";
import { buildMarkdown } from "./format";
import { parseAudio, saveArt } from "./metadata";

/**
 * Ensure a searchable sidecar ".md" exists next to an audio file.
 * Placed in the user's attachment folder (respecting their setting). Never
 * overwrites an existing sidecar, so hand edits survive. Returns the path or null.
 */
export async function ensureSidecar(app: App, audio: TFile): Promise<string | null> {
  try {
    const existing = findSidecar(app, audio);
    if (existing) return existing.path;

    const parsed = await parseAudio(app, audio);
    if (!parsed) return null;

    const poster = parsed.picture
      ? await saveArt(app, audio, parsed.picture, audio.path)
      : null;

    const desired = normalizePath(
      await app.fileManager.getAvailablePathForAttachment(`${audio.basename}.md`, audio.path),
    );
    const md = buildMarkdown(parsed.tags, audio.basename, poster, true);
    const file = await app.vault.create(desired, md);
    return file.path;
  } catch (e) {
    console.error("[audio-tags] failed to create sidecar for", audio.path, e);
    return null;
  }
}

/**
 * Find an existing sidecar for an audio file: a .md whose frontmatter has an
 * "audio" property (either "[[file.mp3]]" or the raw name).
 */
function findSidecar(app: App, audio: TFile): TFile | null {
  const linkA = `[[${audio.name}]]`;
  const linkB = `[[${audio.basename}]]`;
  for (const other of app.vault.getMarkdownFiles()) {
    if (other.parent?.path !== audio.parent?.path) continue;
    const av = app.metadataCache.getFileCache(other)?.frontmatter?.audio;
    if (av === linkA || av === linkB || av === audio.name || av === audio.basename) return other;
  }
  return null;
}
