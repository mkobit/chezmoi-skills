import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { getMarkdownFiles, getSkillsDirectories } from "./skills";
import type { ValidationResult } from "./types";

interface SecurityRule {
  id: string;
  description: string;
  pattern: RegExp;
}

const SECURITY_RULES: SecurityRule[] = [
  {
    id: "hardcoded-aws-key",
    description: "Hardcoded AWS access key ID",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    id: "hardcoded-github-token",
    description: "Hardcoded GitHub token",
    pattern:
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  {
    id: "hardcoded-api-secret-key",
    description: "Hardcoded sk- API secret key",
    pattern: /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    id: "hardcoded-slack-token",
    description: "Hardcoded Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    id: "private-key-pem",
    description: "Embedded private key PEM block",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    id: "hardcoded-age-secret-key",
    description: "Hardcoded age secret key literal",
    pattern: /\bAGE-SECRET-KEY-1[0-9A-Z]{58}\b/,
  },
  {
    id: "pipe-to-shell",
    description: "Piping remote download directly to shell",
    pattern: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:ba|z|da|k)?sh\b/,
  },
  {
    id: "destructive-rm-root",
    description: "Destructive recursive force delete on root or home wildcard",
    pattern:
      /\brm\s+-[^\n;|&]*r[^\n;|&]*f[^\n;|&]*\s+(?:\/(?:\s|$|\*)|~\/?\*(?:\s|$)|\$HOME\/?\*(?:\s|$))/,
  },
  {
    id: "unsafe-shell-eval",
    description: "Unsafe eval on shell variable or command substitution",
    pattern: /\beval\s+["']?\$\(?/,
  },
  {
    id: "world-writable-chmod",
    description: "World-writable permission change (777 / a+rwx)",
    pattern: /\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx)\b/,
  },
];

/** Scan text content line-by-line for unsafe shell or hardcoded secret patterns. */
export const lintSecurityContent = (
  content: string,
  filePath: string,
): string[] => {
  const findings: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const rule of SECURITY_RULES) {
      if (rule.pattern.test(line)) {
        findings.push(`${filePath}:${i + 1} [${rule.id}] ${rule.description}`);
      }
    }
  }

  return findings;
};

const getJsonFiles = async (dirPath: string): Promise<string[]> => {
  if (!existsSync(dirPath)) return [];
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getJsonFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }

  return files;
};

/** Validate skills/ and tests/evals/ for unsafe shell and secret patterns. */
export const validateSecurityLint = async (
  claudePluginDir: string = ".claude-plugin",
  evalsDir: string = "tests/evals",
): Promise<ValidationResult[]> => {
  const skillsDirs = await getSkillsDirectories(claudePluginDir);
  const skillFiles = (
    await Promise.all(
      skillsDirs.map((dir) =>
        existsSync(dir) ? getMarkdownFiles(dir) : Promise.resolve([]),
      ),
    )
  ).flat();
  const evalFiles = await getJsonFiles(evalsDir);
  const filesToScan = [...skillFiles, ...evalFiles];

  if (filesToScan.length === 0) {
    return [
      {
        valid: false,
        name: "security lint",
        details: "No skill or eval files found to scan",
      },
    ];
  }

  const allFindings: string[] = [];
  for (const file of filesToScan) {
    const content = await readFile(file, "utf-8").catch(() => null);
    if (content === null) {
      allFindings.push(`${file}: failed to read file`);
      continue;
    }
    allFindings.push(...lintSecurityContent(content, file));
  }

  if (allFindings.length > 0) {
    return [
      {
        valid: false,
        name: "security lint",
        details: allFindings.join("; "),
      },
    ];
  }

  return [
    {
      valid: true,
      name: `security lint (${filesToScan.length} files scanned)`,
    },
  ];
};
