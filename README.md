# Audio Tags

Obsidian plugin. When an audio file is attached to a note (drag-drop, paste, or
share sheet), it reads the file's embedded metadata with
[music-metadata](https://github.com/borewit/music-metadata) and inserts
title / artist / album / album art next to the audio embed, automatically.

Works on desktop and Android (`isDesktopOnly: false`); the bundle contains no
Node builtins.

## Output

Three surfaces, each toggleable:

1. **Note insertion** — metadata next to the audio embed.
2. **Custom audio view** — replaces the built-in audio preview with a player + metadata.
3. **Sidecar note** — a companion `.md` next to the audio file, so the metadata is searchable.

### Note insertion

Two formats, chosen in settings:

**Card Viewer format** (default) — a `card-music` block that the
[Card Viewer](https://github.com/vsme/obsidian-card-viewer) plugin renders as a
card. Card Viewer is **not** bundled; install it separately, or this shows as a
plain code block.

````
![[song.mp3]]

```card-music
title: Song
author: Artist
album: Album
release_date: 2020-01-02
duration: 65
genres: Rock, Pop
poster: attachments/song.jpg
...
```
````

**Plain format** — album art as an image, then artist and title, then the album:

```
![[song.mp3]]

![[attachments/song.jpg]]
Artist — Song
*Album*
```

If the audio has no title tag, the filename is used.

## Settings

- **Insert metadata into notes** (on) — master switch. Off = use the plugin only
  for the custom audio view / sidecar.
- **Card Viewer format** (on) — card block vs plain markdown.
- **Emit extra tags** (on) — append extra music-metadata fields as `key:` lines
  (composer, track, year, bpm, codec, bitrate, ...). Card format only.
- **Save album art to vault** (on) — save the embedded cover as an image in the
  attachment folder and reference it. Off = no image, no file written.
- **Custom audio view** (on) — take over the preview of audio files.
- **Write sidecar notes** (on) — searchable companion `.md` per audio file.

## Custom audio view

`registerView` + `registerExtensions` override the built-in preview of a curated
list of audio extensions (`VIEW_EXTENSIONS` in `src/audioView.ts`; video
containers such as mp4/mkv/webm are excluded). The view is a `FileView`: an
`<audio controls>` pointed at `vault.getResourcePath(file)`, plus the metadata
rendered via `MarkdownRenderer`.

Notes:

- Registering an extension **takes over the preview vault-wide** while enabled,
  and conflicts with other plugins registering the same extension (e.g. Waveform
  Player, Media Extended) — last loaded wins. Toggle it off to restore the
  built-in player.
- With the plugin disabled, unregistering is automatic, but already-open tabs may
  need reopening to fall back to the built-in player.

## Sidecar notes

A companion `.md` is created next to each audio file, in the user's attachment
folder, with the metadata as **YAML frontmatter** (so Obsidian search and
Properties index it) plus readable body text. An existing sidecar is never
overwritten.

Every sidecar carries the marker `audio-tags-sidecar: true` in its frontmatter.
That marker is how the plugin **positively identifies** its own sidecars, so
"clear all" can never touch a note you wrote yourself.

Core search does **not** index non-markdown files, so the binary's own node can
never carry searchable text — the sidecar is the only way to make audio metadata
searchable.

### Managing sidecars

- Settings → **Generate sidecars for all audio files** and **Clear all sidecar
  files** (the latter moves them to the system trash, after confirmation).
- Command palette: *Create sidecar for active audio file*, *Generate sidecars for
  all audio files*, *Clear all sidecar files*.
- Right-click an audio node in the file explorer (single or a multi-selection)
  → *Audio tags: create sidecar…* / *clear sidecar…*.

## Development

```
npm install
npm run dev      # watch build
npm run build    # typecheck + production bundle
npm test         # unit tests for the pure formatting logic
```

`npm run build` produces `main.js`. Copy `main.js` and `manifest.json` into
`<vault>/.obsidian/plugins/audio-tags/` and enable it.

Android: build on desktop, let the plugin folder sync to the device, then reload
the app. There is no live reload on mobile.

## Triggers

- `editor-drop` / `editor-paste` — interactive insert; the note is known.
- `vault.on('create')` — fallback for attach paths with no editor event
  (e.g. Android share sheet). Correlates with the active note.
- Command **"Insert audio metadata for embeds in this note"** — manual.

Insertion is idempotent: re-running skips an embed that is already annotated.
