import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueName, pathIn } from "../src/format.ts";

test("uniqueName keeps the name when free", () => {
  assert.equal(uniqueName("song.mp3", () => false), "song.mp3");
});

test("uniqueName appends a counter before the extension on collision", () => {
  const taken = new Set(["song.mp3"]);
  assert.equal(uniqueName("song.mp3", (n) => taken.has(n)), "song 1.mp3");
  taken.add("song 1.mp3");
  assert.equal(uniqueName("song.mp3", (n) => taken.has(n)), "song 2.mp3");
});

test("uniqueName handles names without an extension", () => {
  const taken = new Set(["notes"]);
  assert.equal(uniqueName("notes", (n) => taken.has(n)), "notes 1");
});

test("uniqueName does not treat a leading-dot name as an extension", () => {
  const taken = new Set([".gitignore"]);
  assert.equal(uniqueName(".gitignore", (n) => taken.has(n)), ".gitignore 1");
});

test("pathIn joins folder and name, and handles the vault root", () => {
  assert.equal(pathIn("a/attachments", "song.md"), "a/attachments/song.md");
  assert.equal(pathIn("", "song.md"), "song.md");
});
