import { App, PluginSettingTab, Setting } from "obsidian";
import type AudioTagsPlugin from "./main";

export interface AudioTagsSettings {
  /** Emit a ```card-music block (true) or plain markdown (false). */
  cardFormat: boolean;
  /** Append the curated extra tag keys (card format only). */
  extraTags: boolean;
  /** Save embedded album art as a vault image and reference it. */
  saveArt: boolean;
}

export const DEFAULT_SETTINGS: AudioTagsSettings = {
  cardFormat: true,
  extraTags: true,
  saveArt: true,
};

export class AudioTagsSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AudioTagsPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Card Viewer format")
      .setDesc("Emit metadata as a card-music block (needs the Card Viewer plugin). Off = plain markdown.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.cardFormat).onChange(async (v) => {
          this.plugin.settings.cardFormat = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Emit extra tags")
      .setDesc("Add extra music-metadata fields as key: lines. Card Viewer format only.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.extraTags).onChange(async (v) => {
          this.plugin.settings.extraTags = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Save album art to vault")
      .setDesc("Save embedded cover art as an image in the attachment folder and show it. Off = no image.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.saveArt).onChange(async (v) => {
          this.plugin.settings.saveArt = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
