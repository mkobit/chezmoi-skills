import type { z } from "zod";

export type ValidationResult =
  | { valid: true; name: string }
  | { valid: false; name: string; details: string | z.ZodIssue[] };

export interface SkillTokenStats {
  skillName: string;
  l1l2Tokens: number;
  l3Tokens: number;
  totalTokens: number;
  fileCount: number;
}
