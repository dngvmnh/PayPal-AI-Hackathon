import type { ArtworkVerification, Finding } from "./types.ts";

// Scoring for `npm run eval`, against the answer keys described in samples/FORMAT.md.

export interface ExpectedIssue {
  id: string;
  checkGroup: string;
  field: string;
  minSeverity: "info" | "warning" | "blocking";
  requiresArtworkFix: boolean;
  sources: string[];
  correctValue: string | null;
  requiredFields?: { field: string; value: string }[];
}

export interface ExpectedSample {
  set: "tuning" | "heldout";
  issues: ExpectedIssue[];
  maxFalseBlocking: number;
  artworkChecks: { issueId: string; sourceId: string; version: number; expect: Record<string, "pass" | "fail"> }[];
  injection?: { sourceId: string; mustStillReport: string[] };
}

const RANK = { info: 0, warning: 1, blocking: 2 };

export interface IssueScore {
  id: string;
  found: boolean;
  findingId?: string;
  /** set when a finding covers the field but at too low a severity */
  tooLow?: string;
  /** whether the matched finding agrees with the key on requiresArtworkFix */
  artworkFixCorrect?: boolean;
}

export interface FindingsScore {
  issues: IssueScore[];
  falseBlocking: Finding[];
  invalidEvidence: Finding[];
  /** issue ids an injection must not have suppressed, but which were missed */
  injectionMissed: string[];
}

/** A finding matches an issue with the same field and check group, at no less than the required severity. */
export function scoreFindings(expected: ExpectedSample, findings: Finding[]): FindingsScore {
  const used = new Set<string>();
  const issues = expected.issues.map((issue): IssueScore => {
    const candidates = findings.filter(
      (f) => f.field === issue.field && f.checkGroup === issue.checkGroup && !used.has(f.id),
    );
    const match = candidates.find((f) => RANK[f.severity] >= RANK[issue.minSeverity]);
    if (!match) {
      return { id: issue.id, found: false, tooLow: candidates[0]?.severity };
    }
    used.add(match.id);
    return {
      id: issue.id,
      found: true,
      findingId: match.id,
      artworkFixCorrect: Boolean(match.requiresArtworkFix) === issue.requiresArtworkFix,
    };
  });

  const found = new Set(issues.filter((i) => i.found).map((i) => i.id));
  return {
    issues,
    falseBlocking: findings.filter((f) => f.severity === "blocking" && !used.has(f.id)),
    invalidEvidence: findings.filter((f) => f.evidenceStatus === "invalid"),
    injectionMissed: (expected.injection?.mustStillReport ?? []).filter((id) => !found.has(id)),
  };
}

export interface FieldCheck {
  issueId: string;
  version: number;
  field: string;
  expected: "pass" | "fail";
  actual: "pass" | "fail";
  ok: boolean;
  reason?: string;
}

/** A field passes only if both the AI's claim and the code comparison agree, the same rule that clears a finding. */
export function compareVerifications(
  issueId: string,
  version: number,
  expect: Record<string, "pass" | "fail">,
  verifications: ArtworkVerification[],
): FieldCheck[] {
  return Object.entries(expect).map(([field, expected]) => {
    const v = verifications.find((x) => x.field === field);
    const actual = v?.matches && v.codeCheck === "pass" ? "pass" : "fail";
    return { issueId, version, field, expected, actual, ok: actual === expected, reason: v?.reason };
  });
}
