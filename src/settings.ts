import { App, PluginSettingTab, Setting } from "obsidian";
import type AudioTagsPlugin from "./main";

export interface AudioTagsSettings {
  /** Emit a ```card-music block (true) or plain markdown (false). */
  cardFormat: boolean;
  /** Append the curated extra tag keys (card format only). */
  extraTags: boolean;
  /** Save embedded album art as a vault image and reference it. */
  saveArt: boolean;
  /** Master switch: insert metadata into notes at all. */
  insertIntoNotes: boolean;
  /** Take over audio files' preview with the custom AudioView. */
  customView: boolean;
  /** Write a searchable sidecar .md next to each audio file. */
  sidecar: boolean;
}

export const DEFAULT_SETTINGS: AudioTagsSettings = {
  cardFormat: true,
  extraTags: true,
  saveArt: true,
  insertIntoNotes: true,
  customView: true,
  sidecar: true,
};

export class AudioTagsSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AudioTagsPlugin) {
    super(app, plugin);
  }

  private toggle(name: string, desc: string, get: () => boolean, set: (v: boolean) => void): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) =>
        t.setValue(get()).onChange(async (v) => {
          set(v);
          await this.plugin.saveSettings();
        }),
      );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl).setName("Note insertion").setHeading();
    this.toggle(
      "Insert metadata into notes",
      "Insert metadata next to audio embeds. Off = use the plugin only for the custom audio view.",
      () => s.insertIntoNotes,
      (v) => (s.insertIntoNotes = v),
    );
    this.toggle(
      "Card Viewer format",
      "Emit metadata as a card-music block (needs the Card Viewer plugin). Off = plain markdown.",
      () => s.cardFormat,
      (v) => (s.cardFormat = v),
    );
    this.toggle(
      "Emit extra tags",
      "Add extra music-metadata fields as key: lines. Card Viewer format only.",
      () => s.extraTags,
      (v) => (s.extraTags = v),
    );

    new Setting(containerEl).setName("Album art").setHeading();
    this.toggle(
      "Save album art to vault",
      "Save embedded cover art as an image in the attachment folder and show it. Off = no image.",
      () => s.saveArt,
      (v) => (s.saveArt = v),
    );

    new Setting(containerEl).setName("Audio preview view").setHeading();
    this.toggle(
      "Custom audio view",
      "Replace the built-in audio player preview with a player plus metadata. Takes over the preview for audio files vault-wide.",
      () => s.customView,
      (v) => (s.customView = v),
    );

    new Setting(containerEl).setName("Sidecar notes").setHeading();
    this.toggle(
      "Write sidecar notes",
      "Create a companion .md next to each audio file so its metadata is searchable. Requires a reload to start/stop.",
      () => s.sidecar,
      (v) => (s.sidecar = v),
    );
  }
}
