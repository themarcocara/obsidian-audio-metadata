# Audio Tags

Obsidian plugin. When an audio file is attached to a note (drag-drop, paste, or
share sheet), it reads the file's embedded metadata with
[music-metadata](https://github.com/borewit/music-metadata) and inserts
title / artist / album / album art next to the audio embed, automatically.

Works on desktop and Android (`isDesktopOnly: false`); the bundle contains no
Node builtins.

## Output

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

- **Card Viewer format** (on) — card block vs plain markdown.
- **Emit extra tags** (on) — append extra music-metadata fields as `key:` lines
  (composer, track, year, bpm, codec, bitrate, ...). Card format only.
- **Save album art to vault** (on) — save the embedded cover as an image in the
  attachment folder and reference it. Off = no image, no file written.

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
