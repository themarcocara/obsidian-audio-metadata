/**
 * Pure, Obsidian-free formatting of parsed audio metadata into note text.
 * Kept dependency-free so it can be unit-tested with plain node.
 */

/** Subset of music-metadata's IAudioMetadata we rely on. */
export interface AudioTags {
  common: {
    title?: string;
    artist?: string;
    album?: string;
    date?: string;
    releasedate?: string;
    genre?: string[];
    composer?: string[];
    track?: { no: number | null; of: number | null };
    disk?: { no: number | null; of: number | null };
    year?: number;
    bpm?: number;
    isrc?: string[];
    label?: string[];
    comment?: { text?: string }[];
    copyright?: string;
    encodedby?: string;
    website?: string;
    musicbrainz_trackid?: string;
  };
  format: {
    duration?: number;
    codec?: string;
    bitrate?: number;
    sampleRate?: number;
    bitsPerSample?: number;
    lossless?: boolean;
  };
}

export interface RenderOptions {
  /** Emit a ```card-music block (true) or plain markdown (false). */
  cardFormat: boolean;
  /** Append the curated extra tag keys (card format only). */
  extraTags: boolean;
  /** Poster/image reference to use, or null when art was not saved. */
  poster: string | null;
}

/** Track number as "no" or "no/of". */
function trackNo(t?: { no: number | null; of: number | null }): string | undefined {
  if (!t || t.no == null) return undefined;
  return t.of != null ? `${t.no}/${t.of}` : `${t.no}`;
}

function join(arr?: string[] | null): string | undefined {
  const v = arr?.filter((x) => x && x.length).join(", ");
  return v && v.length ? v : undefined;
}

/**
 * Curated flat extra tags. Structured/multi-line fields (lyrics, pictures,
 * replaygain) are deliberately skipped: they cannot survive the one-line-per-key format.
 */
export function extraTagPairs(tags: AudioTags): [string, string][] {
  const c = tags.common;
  const f = tags.format;
  const raw: [string, string | number | boolean | undefined][] = [
    ["composer", join(c.composer)],
    ["track", trackNo(c.track)],
    ["disk", trackNo(c.disk)],
    ["year", c.year],
    ["bpm", c.bpm],
    ["isrc", join(c.isrc)],
    ["label", join(c.label)],
    ["comment", c.comment?.map((x) => x.text).filter(Boolean).join(" ")],
    ["copyright", c.copyright],
    ["encodedby", c.encodedby],
    ["website", c.website],
    ["musicbrainz_trackid", c.musicbrainz_trackid],
    ["codec", f.codec],
    ["bitrate", f.bitrate != null ? Math.round(f.bitrate) : undefined],
    ["sampleRate", f.sampleRate != null ? Math.round(f.sampleRate) : undefined],
    ["bitsPerSample", f.bitsPerSample],
    ["lossless", f.lossless],
  ];
  return raw
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as [string, string]);
}

/** Remove characters that would break a single-line "key: value" field. */
function oneLine(value: string): string {
  return value.replace(/\r?\n/g, " ").trim();
}

/**
 * Build the text to append after an audio embed.
 * @param tags parsed metadata
 * @param fileName audio file's base name (used as title fallback)
 * @param opts render options
 */
export function buildInsert(tags: AudioTags, fileName: string, opts: RenderOptions): string {
  const c = tags.common;
  const title = c.title?.trim() || fileName;
  const date = c.date || c.releasedate;
  const duration =
    tags.format.duration != null ? String(Math.round(tags.format.duration)) : undefined;

  if (!opts.cardFormat) {
    // Plain markdown: art image, then Artist — Title, then album.
    const lines: string[] = [];
    if (opts.poster) lines.push(`![[${opts.poster}]]`);
    const heading = c.artist ? `${c.artist} — ${title}` : title;
    lines.push(oneLine(heading));
    if (c.album) lines.push(`*${oneLine(c.album)}*`);
    return lines.join("\n");
  }

  // card-viewer music card.
  const fields: [string, string | undefined][] = [
    ["title", title],
    ["author", c.artist],
    ["album", c.album],
    ["release_date", date],
    ["duration", duration],
    ["genres", join(c.genre)],
    ["poster", opts.poster ?? undefined],
  ];
  const body = fields
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${oneLine(String(v))}`);

  if (opts.extraTags) {
    for (const [k, v] of extraTagPairs(tags)) body.push(`${k}: ${oneLine(v)}`);
  }

  return ["```card-music", ...body, "```"].join("\n");
}

/** "song.md" -> "song 1.md", "song 2.md" ... until `taken` returns false. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/** Vault path of a file name inside a folder (empty folder = vault root). */
export function pathIn(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** File extension (no dot) for a picture mime type; defaults to jpg. */
export function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  return "jpg";
}

/** Minimal YAML scalar quoting. */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

/**
 * Build a scrap of plain markdown holding the audio metadata, for the custom
 * audio view to render and (optionally) for a searchable sidecar note.
 * @param tags parsed metadata
 * @param audioName audio file name including extension (e.g. "song.mp3")
 * @param poster vault path of the saved art, or null
 * @param frontmatter wrap the fields in YAML frontmatter so the sidecar is
 *   indexed by Obsidian search / Properties, instead of as a fenced card.
 */
export function buildMarkdown(
  tags: AudioTags,
  audioName: string,
  poster: string | null,
  frontmatter: boolean,
): string {
  const c = tags.common;
  const fallback = audioName.replace(/\.[^.]+$/, "");
  const title = c.title?.trim() || fallback;
  const date = c.date || c.releasedate;
  const link = `[[${audioName}]]`;

  const pairs: [string, string | undefined][] = [
    ["title", title],
    ["artist", c.artist],
    ["album", c.album],
    ["date", date],
    ["duration", tags.format.duration != null ? String(Math.round(tags.format.duration)) : undefined],
    ["genre", join(c.genre)],
    ...extraTagPairs(tags),
  ];

  const body: string[] = [];
  body.push(`Audio metadata for ${link}.`);
  body.push("");
  // Player embed (only when writing a real note; the custom view renders its
  // own player, and a fragment is inserted into a note that already has one).
  if (frontmatter) {
    body.push(`![[${audioName}]]`);
    body.push("");
  }
  for (const [k, v] of pairs) {
    if (v !== undefined && v !== "") body.push(`**${k}:** ${oneLine(v)}`);
  }
  if (poster) {
    body.push("");
    body.push(`![[${poster}]]`);
  }

  if (!frontmatter) return body.join("\n");

  const fm = [
    "audio-tags-sidecar: true",
    `audio: ${yamlString(link)}`,
    ...pairs
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${yamlString(String(v))}`),
  ];
  return ["---", ...fm, "---", "", ...body].join("\n");
}

