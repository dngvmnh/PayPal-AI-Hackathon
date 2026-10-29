import { test } from "node:test";
import assert from "node:assert/strict";
import { compareArtworkYear } from "../lib/artwork-compare.ts";

test("year passes when the artwork contains only the expected year", () => {
  assert.equal(compareArtworkYear("2026", ["FUN RUN 2026"]).codeCheck, "pass");
});

test("duplicate occurrences of the same year pass", () => {
  assert.equal(compareArtworkYear("2026", ["2026", "EVENT 2026"]).codeCheck, "pass");
});

test("old and new years together fail", () => {
  const result = compareArtworkYear("2026", ["FUN RUN 2026", "Copyright 2025"]);
  assert.equal(result.codeCheck, "fail");
  assert.deepEqual(result.observed, ["2025", "2026"]);
});

test("missing or wrong year fails", () => {
  assert.equal(compareArtworkYear("2026", ["FUN RUN"]).codeCheck, "fail");
  assert.equal(compareArtworkYear("2026", ["FUN RUN 2025"]).codeCheck, "fail");
});

test("an invalid expected year fails", () => {
  assert.equal(compareArtworkYear("26", ["2026"]).codeCheck, "fail");
});

import { compareArtworkText, compareArtworkUrl } from "../lib/artwork-compare.ts";

test("URL normalization accepts protocol, www and trailing slash", () => {
  assert.equal(
    compareArtworkUrl("riverside5k.org", ["https://www.riverside5k.org/"]).codeCheck,
    "pass",
  );
});

test("an old URL alongside the expected URL fails", () => {
  assert.equal(
    compareArtworkUrl("riverside5k.org", ["riverside5k.org", "riversidefunrun.org"]).codeCheck,
    "fail",
  );
});

test("missing URL fails", () => {
  assert.equal(compareArtworkUrl("riverside5k.org", ["Riverside 5K"]).codeCheck, "fail");
});

test("text comparison ignores case, punctuation, spaces and diacritics", () => {
  assert.equal(
    compareArtworkText("Cafe Club", ["CAFÉ   CLUB!"]).codeCheck,
    "pass",
  );
});

test("text must match a whole element, not just a substring", () => {
  assert.equal(
    compareArtworkText("Harbor Science Club", ["Join Harbor Science Club today"]).codeCheck,
    "fail",
  );
});

test("an exact text match plus a near miss fails", () => {
  assert.equal(
    compareArtworkText("Harbor Science Club", [
      "HARBOR SCIENCE CLUB",
      "HARBOR SCIENCE CLBU",
    ]).codeCheck,
    "fail",
  );
});

import { compareArtworkDate, compareArtworkInkColors } from "../lib/artwork-compare.ts";

test("date passes when month, day and requested weekday match", () => {
  assert.equal(compareArtworkDate("Sunday, May 17", ["SUNDAY, MAY 17"]).codeCheck, "pass");
});

test("date fails for a missing weekday or an extra old date", () => {
  assert.equal(compareArtworkDate("Sunday, May 17", ["May 17"]).codeCheck, "fail");
  assert.equal(
    compareArtworkDate("Sunday, May 17", ["Sunday, May 17", "Saturday, May 16"]).codeCheck,
    "fail",
  );
});

test("invalid or unreadable dates fail", () => {
  assert.equal(compareArtworkDate("February 30", ["February 30"]).codeCheck, "fail");
  assert.equal(compareArtworkDate("Sunday, May 17", []).codeCheck, "fail");
});

test("ink colors match regardless of order and safety-orange synonym", () => {
  assert.equal(
    compareArtworkInkColors("white, safety orange", ["orange", "white"]).codeCheck,
    "pass",
  );
});

test("extra, missing or unsupported ink colors fail", () => {
  assert.equal(compareArtworkInkColors("white", ["white", "red"]).codeCheck, "fail");
  assert.equal(compareArtworkInkColors("white", []).codeCheck, "fail");
  assert.equal(compareArtworkInkColors("white", ["mystery ink"]).codeCheck, "fail");
});

test("an unsupported numeric date alongside the expected date fails", () => {
  const result = compareArtworkDate(
    "Sunday, May 17",
    ["Sunday, May 17", "05/16"],
  );

  assert.equal(result.codeCheck, "fail");
});

import { buildArtworkVerifications } from "../lib/artwork-compare.ts";
import type { ArtworkVerification } from "../lib/types.ts";

type AIClaim = Pick<
  ArtworkVerification,
  "findingId" | "field" | "expected" | "observed" | "matches"
>;

const yearRequirement = [{ field: "year" as const, value: "2026" }];
const goodReading = { textElements: ["FUN RUN 2026"], inkColors: ["white"] };
const goodClaim: AIClaim = {
  findingId: "f1",
  field: "year",
  expected: "2026",
  observed: "2026",
  matches: true,
};

test("verification passes only when AI and code agree", () => {
  const [result] = buildArtworkVerifications("f1", yearRequirement, goodReading, [goodClaim]);

  assert.equal(result.matches, true);
  assert.equal(result.codeCheck, "pass");
});

test("verification fails when AI confirmation is missing or negative", () => {
  const [missing] = buildArtworkVerifications("f1", yearRequirement, goodReading, []);
  const [negative] = buildArtworkVerifications("f1", yearRequirement, goodReading, [
    { ...goodClaim, matches: false },
  ]);

  assert.equal(missing.matches, false);
  assert.equal(negative.matches, false);
});

test("verification fails when the AI observation disagrees", () => {
  const [result] = buildArtworkVerifications("f1", yearRequirement, goodReading, [
    { ...goodClaim, observed: "2025" },
  ]);

  assert.equal(result.matches, false);
});

test("verification fails when artwork reading contains old and new years", () => {
  const reading = {
    textElements: ["FUN RUN 2026", "OLD DESIGN 2025"],
    inkColors: ["white"],
  };

  const [result] = buildArtworkVerifications("f1", yearRequirement, reading, [goodClaim]);

  assert.equal(result.codeCheck, "fail");
});

test("duplicate AI confirmations are treated as ambiguous", () => {
  const [result] = buildArtworkVerifications(
    "f1",
    yearRequirement,
    goodReading,
    [goodClaim, goodClaim],
  );

  assert.equal(result.matches, false);
});