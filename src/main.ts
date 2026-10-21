import { Editor, MarkdownView, Menu, Modal, Notice, Plugin, TFile, TAbstractFile } from "obsidian";
import { AudioTagsSettings, DEFAULT_SETTINGS, AudioTagsSettingTab } from "./settings";
import { buildInsert } from "./format";
import { isAudioFile, parseAudio, saveArt, type ParsedAudio } from "./metadata";
import { AudioView, AUDIO_VIEW_TYPE, VIEW_EXTENSIONS } from "./audioView";
import {
  ensureSidecar,
  generateAllSidecars,
  removeAllSidecars,
  sidecarFor,
  allSidecars,
} from "./sidecar";

/** Matches a wiki embed ![[target]] / ![[target|alias]] and markdown image ![](target). */
const EMBED_RE = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g;

/** Delay before rescanning, to let Obsidian finish copying + inserting the embed. */
const SETTLE_MS = 400;

/** Debounce for editor-change, so we only scan after typing pauses. */
const TYPE_SETTLE_MS = 700;

/** Written to the console the moment the bundle is evaluated. Distinguishes a
 * parse/eval failure (never logged) from an onload failure (logged). */
console.log("[audio-tags] module evaluated");

export default class AudioTagsPlugin extends Plugin {
  settings: AudioTagsSettings = DEFAULT_SETTINGS;
  private scanning = false;
  /** Debounce timer for editor-change. */
  private typeTimer: number | null = null;
  /** Text at the end of the last scan, to skip no-op rescans (incl. our own insert). */
  private lastScanned = new WeakMap<Editor, string>();

  async onload(): Promise<void> {
    const steps: string[] = [];
    const step = (m: string) => {
      steps.push(`${new Date().toISOString()}  ${m}`);
      console.log(`[audio-tags] ${m}`);
    };

    try {
      await this.onloadInner(step);
      step("onload complete");
    } catch (e) {
      const err = e as Error;
      const report = [
        "audio-tags failed to load",
        "========================",
        "",
        "Steps:",
        ...steps,
        "",
        "Error:",
        `${err?.constructor?.name ?? "Error"}: ${err?.message ?? String(e)}`,
        "",
        err?.stack ?? "(no stack)",
      ].join("\n");

      // Goes to logcat as [INFO:CONSOLE(...)] under the chromium/Capacitor tag.
      console.error("[audio-tags] ONLOAD FAILED\n" + report);

      // Also lands in the vault, readable on-device without logcat.
      try {
        await this.writeDiagnostic(report);
      } catch (e2) {
        console.error("[audio-tags] could not write diagnostic file", e2);
      }

      // Swallowed on purpose: keep the plugin "loaded" so the settings tab and
      // the three-dot Options entry stay available for inspection.
      new Notice(`audio-tags failed to load: ${err?.message ?? String(e)}`, 0);
    }
  }

  /**
   * Write the diagnostic report next to the plugin, inside the config folder so
   * it never clutters notes.
   */
  private async writeDiagnostic(text: string): Promise<void> {
    const path = `${this.app.vault.configDir}/plugins/audio-tags/error.txt`;
    await this.app.vault.adapter.write(path, text);
  }

  private async onloadInner(step: (m: string) => void): Promise<void> {
    step("loading settings");
    await this.loadSettings();
    step(`settings: ${JSON.stringify(this.settings)}`);

    this.addSettingTab(new AudioTagsSettingTab(this.app, this));
    step("settings tab registered");

    // Custom preview for audio files (takes over the built-in player).
    this.registerView(AUDIO_VIEW_TYPE, (leaf) => new AudioView(leaf, this));
    step("view registered");

    if (this.settings.customView) {
      // Guarded: claiming extensions Obsidian core already owns may throw.
      // Non-fatal so the rest of the plugin still loads.
      try {
        this.registerExtensions(VIEW_EXTENSIONS, AUDIO_VIEW_TYPE);
        step("extensions registered");
      } catch (e) {
        step(`registerExtensions failed (non-fatal): ${(e as Error)?.message ?? String(e)}`);
        console.error("[audio-tags] registerExtensions failed", e);
      }
    } else {
      step("custom view disabled; extensions not registered");
    }

    // Interactive drop, pre-insert: Obsidian inserts the embed after this fires.
    this.registerEvent(
      this.app.workspace.on("editor-drop", (_evt, editor, info) => {
        this.scheduleScan(editor, info.file?.path);
      }),
    );

    // Pasted/dropped from the OS: not covered by editor-change reliably.
    this.registerEvent(
      this.app.workspace.on("editor-paste", (_evt, editor, info) => {
        this.scheduleScan(editor, info.file?.path);
      }),
    );

    // General catch-all: typed, autocompleted, drag-inserted, or pasted embeds.
    // Also the only trigger that fires for Android's context-menu paste.
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, info) => {
        this.scheduleTypedScan(editor, info.file?.path);
      }),
    );
    step("editor events registered");

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
    step("vault create listener queued");

    this.registerCommands();
    step("commands registered");

    this.registerMenus();
    step("menus registered");
  }

  private registerCommands(): void {
    this.addCommand({
      id: "insert-audio-metadata",
      name: "Insert audio metadata for embeds in this note",
      editorCallback: (editor, view) => void this.scan(editor, view.file?.path),
    });

    this.addCommand({
      id: "sidecar-for-active-file",
      name: "Create sidecar for active audio file",
      checkCallback: (checking) => {
        const file = this.audioFileFromActiveView();
        if (!file) return false;
        if (!checking) void this.createSidecarFor([file]);
        return true;
      },
    });

    this.addCommand({
      id: "generate-all-sidecars",
      name: "Generate sidecars for all audio files",
      callback: () => void this.generateAllSidecars(),
    });

    this.addCommand({
      id: "clear-all-sidecars",
      name: "Clear all sidecar files",
      callback: () => void this.clearSidecars(),
    });
  }

  private registerMenus(): void {
    // Right-click a single node.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (file instanceof TFile && isAudioFile(file.path)) this.addSidecarMenuItems(menu, [file]);
      }),
    );
    // Right-click a multi-selection in the file explorer.
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu: Menu, files: TAbstractFile[]) => {
        const audios = files.filter((f): f is TFile => f instanceof TFile && isAudioFile(f.path));
        if (audios.length) this.addSidecarMenuItems(menu, audios);
      }),
    );
  }

  /** Add "create / clear sidecar" entries for the given audio files. */
  private addSidecarMenuItems(menu: Menu, audios: TFile[]): void {
    const label = audios.length > 1 ? ` for ${audios.length} audio files` : "";
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(`Audio tags: create sidecar${label}`)
        .setIcon("file-plus")
        .onClick(() => void this.createSidecarFor(audios)),
    );
    if (audios.some((f) => sidecarFor(this.app, f))) {
      menu.addItem((item) =>
        item
          .setTitle(`Audio tags: clear sidecar${label}`)
          .setIcon("trash")
          .onClick(() => void this.clearSidecarsFor(audios)),
      );
    }
  }

  /** The audio file open in the active leaf. */
  private audioFileFromActiveView(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file && isAudioFile(file.path) ? file : null;
  }

  // --- actions invoked from settings, commands and menus ---

  async createSidecarFor(audios: TFile[]): Promise<void> {
    let created = 0;
    for (const audio of audios) {
      const before = sidecarFor(this.app, audio);
      const path = await ensureSidecar(this.app, audio);
      if (path && !before) created++;
    }
    new Notice(`Audio tags: created ${created} sidecar file(s).`);
  }

  async generateAllSidecars(): Promise<void> {
    const progress = new Notice("Audio tags: generating sidecars…", 0);
    const { done, failed } = await generateAllSidecars(this.app);
    progress.hide();
    new Notice(`Audio tags: ${done} sidecar(s) ready${failed ? `, ${failed} failed` : ""}.`);
  }

  async clearSidecars(): Promise<void> {
    const count = allSidecars(this.app).length;
    if (!count) {
      new Notice("Audio tags: no sidecar files found.");
      return;
    }
    if (!(await confirmModal(this.app, `Move ${count} sidecar file(s) to the trash?`))) return;
    const { done, failed } = await removeAllSidecars(this.app);
    new Notice(`Audio tags: trashed ${done} sidecar(s)${failed ? `, ${failed} failed` : ""}.`);
  }

  private async clearSidecarsFor(audios: TFile[]): Promise<void> {
    const sidecars = audios.map((f) => sidecarFor(this.app, f)).filter((f): f is TFile => !!f);
    if (!sidecars.length) return;
    if (!(await confirmModal(this.app, `Move ${sidecars.length} sidecar file(s) to the trash?`))) return;
    for (const file of sidecars) await this.app.fileManager.trashFile(file);
    new Notice(`Audio tags: trashed ${sidecars.length} sidecar(s).`);
  }

  // --- note insertion ---

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Save art for a file, honouring the saveArt toggle. Used by the custom view. */
  async saveArtFor(audio: TFile, picture: ParsedAudio["picture"]): Promise<string | null> {
    if (!picture) return null;
    return saveArt(this.app, audio, picture);
  }

  private scheduleScan(editor?: Editor, sourcePath?: string): void {
    if (!editor || !sourcePath) return;
    window.setTimeout(() => void this.scan(editor, sourcePath), SETTLE_MS);
  }

  /** Debounced scan for typing/autocomplete edits, so we run once the user pauses. */
  private scheduleTypedScan(editor: Editor, sourcePath?: string): void {
    if (!sourcePath || !this.settings.insertIntoNotes) return;
    if (this.typeTimer !== null) window.clearTimeout(this.typeTimer);
    this.typeTimer = window.setTimeout(() => {
      this.typeTimer = null;
      void this.scan(editor, sourcePath);
    }, TYPE_SETTLE_MS);
  }

  /** Scan a note's embeds and annotate any audio embed that is not yet annotated. */
  private async scan(editor: Editor, sourcePath?: string): Promise<void> {
    if (this.scanning || !sourcePath || !this.settings.insertIntoNotes) return;
    const text = editor.getValue();
    // Nothing changed since the last pass (e.g. our own replaceRange re-fired
    // editor-change): skip the work entirely.
    if (this.lastScanned.get(editor) === text) return;
    this.scanning = true;
    try {
      const lines = text.split("\n");

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
            ? await saveArt(this.app, file, parsed.picture)
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
      // Record the post-scan text so the change we just caused is not rescanned.
      this.lastScanned.set(editor, editor.getValue());
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

/** Minimal yes/no modal. ConfirmationModal is 1.13+, above our minAppVersion. */
function confirmModal(app: import("obsidian").App, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.contentEl.createEl("p", { text: message });
    const row = modal.contentEl.createDiv({ cls: "modal-button-container" });
    let answer = false;
    row.createEl("button", { text: "Cancel" }).onclick = () => modal.close();
    row.createEl("button", { text: "Trash", cls: "mod-warning" }).onclick = () => {
      answer = true;
      modal.close();
    };
    modal.onClose = () => {
      modal.contentEl.empty();
      resolve(answer);
    };
    modal.open();
  });
}
