import { FileView, MarkdownRenderer, TFile, WorkspaceLeaf } from "obsidian";
import type AudioTagsPlugin from "./main";
import { parseAudio } from "./metadata";
import { buildMarkdown } from "./format";

export const AUDIO_VIEW_TYPE = "audio-tags-view";

/** Audio extensions whose built-in preview this view takes over. Curated: no video containers. */
export const VIEW_EXTENSIONS = [
  "mp1", "mp2", "mp3", "m2a", "aac", "aacp",
  "m4a", "m4b", "m4pa", "m4r",
  "flac", "ogg", "oga", "opus", "spx",
  "wav", "wave", "bwf", "aif", "aiff", "aifc",
  "ape", "wma", "caf", "caff", "dff", "dsf", "mpc", "wv", "wvp",
];

/**
 * Replaces the built-in preview of audio files. Shows an HTML5 player plus the
 * file's parsed metadata (same data as the note insert).
 */
export class AudioView extends FileView {
  constructor(leaf: WorkspaceLeaf, private plugin: AudioTagsPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return AUDIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Audio";
  }

  getIcon(): string {
    return "audio-file";
  }

  async onLoadFile(file: TFile): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("audio-tags-view");

    root.createEl("audio", {
      cls: "audio-tags-player",
      attr: { controls: "true", src: this.app.vault.getResourcePath(file) },
    });

    const parsed = await parseAudio(this.app, file);
    if (!parsed) return;

    const settings = this.plugin.settings;
    const poster =
      settings.saveArt && parsed.picture
        ? await this.plugin.saveArtFor(file, parsed.picture)
        : null;

    const md = buildMarkdown(parsed.tags, file.name, poster, false);
    const el = root.createDiv({ cls: "audio-tags-metadata" });
    await MarkdownRenderer.render(this.app, md, el, file.path, this);
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.contentEl.empty();
  }
}
