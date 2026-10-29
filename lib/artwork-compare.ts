export interface ComparisonResult {
  codeCheck: "pass" | "fail";
  observed: string[];
  reason?: string;
}

/**
 * Compare the expected year against all four-digit numbers read from artwork.
 * The AI's separate `matches` result must also pass before a finding is cleared.
 */
export function compareArtworkYear(
  expected: string,
  textElements: string[],
): ComparisonResult {
  const wanted = expected.trim();

  if (!/^\d{4}$/.test(wanted)) {
    return {
      codeCheck: "fail",
      observed: [],
      reason: "Expected year must contain exactly four digits.",
    };
  }

  const observed = [...new Set(
    textElements.flatMap((element) => element.match(/\b\d{4}\b/g) ?? []),
  )].sort();

  if (observed.length !== 1 || observed[0] !== wanted) {
    return {
      codeCheck: "fail",
      observed,
      reason: `Expected only ${wanted}; found ${observed.length ? observed.join(", ") : "no year"}.`,
    };
  }

  return { codeCheck: "pass", observed };
}

function normalizeUrl(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export function compareArtworkUrl(
  expected: string,
  textElements: string[],
): ComparisonResult {
  const urlPattern =
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/[^\s]*)?/gi;

  const wanted = normalizeUrl(expected);
  const expectedMatches = expected.trim().match(urlPattern) ?? [];

  if (
    expectedMatches.length !== 1 ||
    normalizeUrl(expectedMatches[0]) !== wanted
  ) {
    return {
      codeCheck: "fail",
      observed: [],
      reason: "Expected URL is invalid or ambiguous.",
    };
  }

  const observed = [...new Set(
    textElements.flatMap((element) =>
      (element.match(urlPattern) ?? []).map((url) =>
        normalizeUrl(url.replace(/[.,!?;:)\]]+$/, "")),
      ),
    ),
  )].sort();

  if (observed.length !== 1 || observed[0] !== wanted) {
    return {
      codeCheck: "fail",
      observed,
      reason: `Expected only ${wanted}; found ${observed.length ? observed.join(", ") : "no URL"}.`,
    };
  }

  return { codeCheck: "pass", observed };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length];
}

export function compareArtworkText(
  expected: string,
  textElements: string[],
): ComparisonResult {
  const wanted = normalizeText(expected);
  const observed = textElements.map(normalizeText).filter(Boolean);

  if (!wanted) {
    return { codeCheck: "fail", observed, reason: "Expected text is empty." };
  }

  const hasExactMatch = observed.includes(wanted);
  const nearMisses = observed.filter(
    (element) => element !== wanted && editDistance(element, wanted) <= 2,
  );

  if (!hasExactMatch || nearMisses.length > 0) {
    return {
      codeCheck: "fail",
      observed,
      reason: !hasExactMatch
        ? "No text element exactly matches the expected text."
        : `A similar but different text element was also found: ${nearMisses.join(", ")}.`,
    };
  }

  return { codeCheck: "pass", observed };
}

interface ParsedDate {
  month: number;
  day: number;
  weekday?: string;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

function extractDates(value: string): ParsedDate[] {
  const pattern =
    /\b(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*,?\s*)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?\b/gi;

  return [...value.matchAll(pattern)].map((match) => ({
    weekday: match[1]?.toLowerCase(),
    month: MONTHS[match[2].toLowerCase()],
    day: Number(match[3]),
  }));
}

function validDate(date: ParsedDate): boolean {
  const value = new Date(Date.UTC(2000, date.month - 1, date.day));
  return value.getUTCMonth() === date.month - 1 && value.getUTCDate() === date.day;
}

function dateLabel(date: ParsedDate): string {
  return `${date.weekday ? `${date.weekday} ` : ""}${date.month}/${date.day}`;
}

export function compareArtworkDate(
  expected: string,
  textElements: string[],
): ComparisonResult {
  const expectedDates = extractDates(expected);
  const dates = textElements.flatMap(extractDates);
  const observed = [...new Set(dates.map(dateLabel))].sort();

const numericDatePattern =
  /\b(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\b/;

if (
  numericDatePattern.test(expected) ||
  textElements.some((element) => numericDatePattern.test(element))
) {
  return {
    codeCheck: "fail",
    observed,
    reason: "A numeric date needs manual review; this format is not supported yet.",
  };
}
  if (expectedDates.length !== 1 || !validDate(expectedDates[0])) {
    return { codeCheck: "fail", observed, reason: "Expected date is invalid or unsupported." };
  }

  if (dates.length === 0 || dates.some((date) => !validDate(date))) {
    return { codeCheck: "fail", observed, reason: "Artwork date is missing or invalid." };
  }

  const wanted = expectedDates[0];
  const matches = dates.every((date) =>
    date.month === wanted.month &&
    date.day === wanted.day &&
    (!wanted.weekday || date.weekday === wanted.weekday),
  );

  const weekdays = new Set(dates.map((date) => date.weekday).filter(Boolean));

  if (!matches || weekdays.size > 1) {
    return {
      codeCheck: "fail",
      observed,
      reason: `Expected ${dateLabel(wanted)}; found ${observed.join(", ")}.`,
    };
  }

  return { codeCheck: "pass", observed };
}

const INK_COLORS: Record<string, string> = {
  white: "white",
  black: "black",
  red: "red",
  yellow: "yellow",
  orange: "orange",
  "safety orange": "orange",
  blue: "blue",
  green: "green",
  purple: "purple",
  pink: "pink",
  brown: "brown",
  gold: "gold",
  silver: "silver",
  gray: "gray",
  grey: "gray",
  navy: "navy",
  cyan: "cyan",
  magenta: "magenta",
};

function parseInkColors(values: string[]): string[] | null {
  const parts = values.flatMap((value) =>
    value.toLowerCase().split(/\s*(?:,|\+|;|\band\b)\s*/i),
  ).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => !INK_COLORS[part])) return null;
  return [...new Set(parts.map((part) => INK_COLORS[part]))].sort();
}

export function compareArtworkInkColors(
  expected: string,
  inkColors: string[],
): ComparisonResult {
  const wanted = parseInkColors([expected]);
  const observed = parseInkColors(inkColors);

  if (!wanted || !observed) {
    return {
      codeCheck: "fail",
      observed: observed ?? inkColors,
      reason: "Ink colors are missing, ambiguous, or unsupported.",
    };
  }

  if (wanted.length !== observed.length || wanted.some((color, i) => color !== observed[i])) {
    return {
      codeCheck: "fail",
      observed,
      reason: `Expected ${wanted.join(", ")}; found ${observed.join(", ")}.`,
    };
  }

  return { codeCheck: "pass", observed };
}

import type {
  ArtworkVerification,
  RequiredArtworkField,
} from "./types.ts";

type ArtworkReading = {
  textElements: string[];
  inkColors: string[];
};

type AIClaim = Pick<
  ArtworkVerification,
  "findingId" | "field" | "expected" | "observed" | "matches"
>;

function compareRequiredField(
  field: RequiredArtworkField,
  expected: string,
  reading: ArtworkReading,
): ComparisonResult {
  switch (field) {
    case "year":
      return compareArtworkYear(expected, reading.textElements);
    case "date":
      return compareArtworkDate(expected, reading.textElements);
    case "url":
      return compareArtworkUrl(expected, reading.textElements);
    case "name":
    case "text_line":
      return compareArtworkText(expected, reading.textElements);
    case "ink_colors":
      return compareArtworkInkColors(expected, reading.inkColors);
  }
}

export function buildArtworkVerifications(
  findingId: string,
  requiredFields: { field: RequiredArtworkField; value: string }[],
  reading: ArtworkReading,
  claims: AIClaim[],
): ArtworkVerification[] {
  return requiredFields.map(({ field, value }) => {
    const codeResult = compareRequiredField(field, value, reading);

    const matchingClaims = claims.filter(
      (claim) =>
        claim.findingId === findingId &&
        claim.field === field &&
        claim.expected === value,
    );

    const claim = matchingClaims.length === 1 ? matchingClaims[0] : undefined;

    if (!claim || !claim.matches || !claim.observed?.trim()) {
      return {
        findingId,
        field,
        expected: value,
        observed: claim?.observed ?? null,
        matches: false,
        codeCheck: codeResult.codeCheck,
        reason: "AI confirmation is missing, negative, or ambiguous.",
      };
    }

    const claimReading: ArtworkReading = {
      textElements: [claim.observed],
      inkColors: [claim.observed],
    };
    const claimResult = compareRequiredField(field, value, claimReading);

    return {
      findingId,
      field,
      expected: value,
      observed: claim.observed,
      matches: claimResult.codeCheck === "pass",
      codeCheck: codeResult.codeCheck,
      reason:
        codeResult.codeCheck === "fail"
          ? codeResult.reason
          : claimResult.codeCheck === "fail"
            ? "AI observation does not match the expected value."
            : undefined,
    };
  });
}