import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInsert, extForMime } from "../src/format.ts";

const tags = {
  common: { title: "Song", artist: "Artist", album: "Album", date: "2020-01-02", genre: ["Rock", "Pop"] },
  format: { duration: 65.4 },
};

test("card format: fields, duration rounded, genres joined", () => {
  const out = buildInsert(tags, "file", { cardFormat: true, extraTags: false, poster: "art.jpg" });
  const lines = out.split("\n");
  assert.equal(lines[0], "```card-music");
  assert.equal(lines.at(-1), "```");
  assert.ok(lines.includes("title: Song"));
  assert.ok(lines.includes("author: Artist"));
  assert.ok(lines.includes("album: Album"));
  assert.ok(lines.includes("release_date: 2020-01-02"));
  assert.ok(lines.includes("duration: 65"));
  assert.ok(lines.includes("genres: Rock, Pop"));
  assert.ok(lines.includes("poster: art.jpg"));
});

test("title falls back to filename, artist line omitted when absent", () => {
  const out = buildInsert({ common: {}, format: {} }, "my song", {
    cardFormat: true,
    extraTags: false,
    poster: null,
  });
  assert.ok(out.includes("title: my song"));
  assert.ok(!out.includes("author:"));
  assert.ok(!out.includes("poster:"));
});

test("extra tags only in card format", () => {
  const withExtra = buildInsert(tags, "f", { cardFormat: true, extraTags: true, poster: null });
  assert.ok(withExtra.includes("codec:") === false); // no codec in fixture
  const t = { ...tags, common: { ...tags.common, bpm: 120 }, format: { ...tags.format, bitrate: 320000 } };
  const out = buildInsert(t, "f", { cardFormat: true, extraTags: true, poster: null });
  assert.ok(out.includes("bpm: 120"));
  assert.ok(out.includes("bitrate: 320000"));
  const plain = buildInsert(t, "f", { cardFormat: false, extraTags: true, poster: null });
  assert.ok(!plain.includes("bpm:"));
});

test("plain format: art, Artist — Title, italic album", () => {
  const out = buildInsert(tags, "f", { cardFormat: false, extraTags: false, poster: "art.jpg" });
  assert.deepEqual(out.split("\n"), ["![[art.jpg]]", "Artist — Song", "*Album*"]);
});

test("plain format with no art and no artist", () => {
  const out = buildInsert({ common: {}, format: {} }, "track01", {
    cardFormat: false,
    extraTags: false,
    poster: null,
  });
  assert.equal(out, "track01");
});

test("newlines are flattened out of field values", () => {
  const out = buildInsert({ common: { title: "a\nb" }, format: {} }, "f", {
    cardFormat: true,
    extraTags: false,
    poster: null,
  });
  assert.ok(out.includes("title: a b"));
});

test("extForMime", () => {
  assert.equal(extForMime("image/png"), "png");
  assert.equal(extForMime("image/jpeg"), "jpg");
  assert.equal(extForMime("image/webp"), "webp");
  assert.equal(extForMime("application/octet-stream"), "jpg");
});
