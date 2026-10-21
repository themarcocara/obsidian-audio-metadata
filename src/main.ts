import { Editor, MarkdownView, Plugin, TFile } from "obsidian";
import { AudioTagsSettings, DEFAULT_SETTINGS, AudioTagsSettingTab } from "./settings";
import { buildInsert } from "./format";
import { isAudioFile, parseAudio, saveArt, type ParsedAudio } from "./metadata";
import { AudioView, AUDIO_VIEW_TYPE, VIEW_EXTENSIONS } from "./audioView";
import { ensureSidecar } from "./sidecar";

/** Matches a wiki embed ![[target]] / ![[target|alias]] and markdown image ![](target). */
const EMBED_RE = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g;

/** Delay before rescanning, to let Obsidian finish copying + inserting the embed. */
const SETTLE_MS = 400;

export default class AudioTagsPlugin extends Plugin {
  settings: AudioTagsSettings = DEFAULT_SETTINGS;
  private scanning = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new AudioTagsSettingTab(this.app, this));

    // Custom preview for audio files (takes over the built-in player).
    this.registerView(AUDIO_VIEW_TYPE, (leaf) => new AudioView(leaf, this));
    if (this.settings.customView) {
      this.registerExtensions(VIEW_EXTENSIONS, AUDIO_VIEW_TYPE);
    }

    // Interactive drop, pre-insert: Obsidian inserts the embed after this fires.
    this.registerEvent(
      this.app.workspace.on("editor-drop", (_evt, editor, info) => {
        this.scheduleScan(editor, info.file?.path);
      }),
    );

    // Paste (desktop; Android's context-menu paste fires nothing).
    this.registerEvent(
      this.app.workspace.on("editor-paste", (_evt, editor, info) => {
        this.scheduleScan(editor, info.file?.path);
      }),
    );

    // Fallback for attach paths with no editor event (Android share sheet, etc.).
    // Registered after layout is ready to avoid the startup create-storm.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.vault.on("create", (file) => {
          if (!(file instanceof TFile) || !isAudioFile(file.path)) return;
          if (this.settings.sidecar) void ensureSidecar(this.app, file);
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          this.scheduleScan(view?.editor, view?.file?.path);
        }),
      );
    });

    this.addCommand({
      id: "insert-audio-metadata",
      name: "Insert audio metadata for embeds in this note",
      editorCallback: (editor, view) => void this.scan(editor, view.file?.path),
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Save art for a file, honouring the saveArt toggle. Used by the custom view. */
  async saveArtFor(audio: TFile, picture: ParsedAudio["picture"], sourcePath: string): Promise<string | null> {
    if (!picture) return null;
    return saveArt(this.app, audio, picture, sourcePath);
  }

  private scheduleScan(editor?: Editor, sourcePath?: string): void {
    if (!editor || !sourcePath) return;
    window.setTimeout(() => void this.scan(editor, sourcePath), SETTLE_MS);
  }

  /** Scan a note's embeds and annotate any audio embed that is not yet annotated. */
  private async scan(editor: Editor, sourcePath?: string): Promise<void> {
    if (this.scanning || !sourcePath || !this.settings.insertIntoNotes) return;
    this.scanning = true;
    try {
      const lines = editor.getValue().split("\n");

      // Walk bottom-up so earlier line indices stay valid as we insert.
      for (let i = lines.length - 1; i >= 0; i--) {
        const target = this.embedTarget(lines[i]);
        if (!target) continue;

        const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
        if (!(file instanceof TFile) || !isAudioFile(file.path)) continue;

        const parsed = await parseAudio(this.app, file);
        if (!parsed) continue;

        const poster =
          this.settings.saveArt && parsed.picture
            ? await saveArt(this.app, file, parsed.picture, sourcePath)
            : null;

        const insert = buildInsert(parsed.tags, file.basename, {
          cardFormat: this.settings.cardFormat,
          extraTags: this.settings.extraTags,
          poster,
        });
        if (this.alreadyFollows(lines, i, insert)) continue;

        editor.replaceRange("\n" + insert, { line: i, ch: lines[i].length });
      }
    } finally {
      this.scanning = false;
    }
  }

  /** First embed target on a line, or null. */
  private embedTarget(line: string): string | null {
    if (!line.includes("![")) return null;
    EMBED_RE.lastIndex = 0;
    const m = EMBED_RE.exec(line);
    if (!m) return null;
    const target = (m[1] ?? m[2] ?? "").trim();
    return target.length ? target : null;
  }

  /** True if the lines right after `embedIdx` already equal the block we would insert. */
  private alreadyFollows(lines: string[], embedIdx: number, insert: string): boolean {
    const expected = insert.split("\n").map((l) => l.trimEnd());
    let i = embedIdx + 1;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i + expected.length > lines.length) return false;
    for (let k = 0; k < expected.length; k++) {
      if (lines[i + k].trimEnd() !== expected[k]) return false;
    }
    return true;
  }
}
