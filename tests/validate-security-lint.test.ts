import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  lintSecurityContent,
  validateSecurityLint,
} from "../scripts/skills/validate/security-lint";

const temporaryDirectories: string[] = [];

const createTempSecurityFixture = (options: {
  skillContent?: string;
  evalContent?: string;
}): { claudePluginDir: string; evalsDir: string } => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-sec-"));
  temporaryDirectories.push(root);

  const claudePluginDir = join(root, ".claude-plugin");
  const skillsDir = join(root, "skills", "example-skill");
  const evalsDir = join(root, "tests", "evals");

  mkdirSync(claudePluginDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(evalsDir, { recursive: true });

  writeFileSync(
    join(claudePluginDir, "marketplace.json"),
    JSON.stringify({ plugins: [{ name: "test", source: "./" }] }),
  );
  writeFileSync(
    join(skillsDir, "SKILL.md"),
    options.skillContent ?? "# Safe skill\n",
  );
  writeFileSync(
    join(evalsDir, "example_eval.json"),
    options.evalContent ?? '[{"id": "safe-1", "eval_type": "skill_selection"}]',
  );

  return { claudePluginDir, evalsDir };
};

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const dir = temporaryDirectories.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("lintSecurityContent", () => {
  it("flags hardcoded credentials and private keys", () => {
    const fakeAws = "AKIA" + "IOSFODNN7EXAMPLE";
    const fakeGhp = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2";
    const fakePem = "-----BEGIN OPENSSH " + "PRIVATE KEY-----";
    const content = [
      `AWS_ACCESS_KEY_ID=${fakeAws}`,
      `GITHUB_TOKEN=${fakeGhp}`,
      fakePem,
    ].join("\n");

    const findings = lintSecurityContent(content, "example.md");
    expect(findings.length).toBe(3);
    expect(findings[0]).toContain("example.md:1 [hardcoded-aws-key]");
    expect(findings[1]).toContain("example.md:2 [hardcoded-github-token]");
    expect(findings[2]).toContain("example.md:3 [private-key-pem]");
  });

  it("flags unsafe shell patterns", () => {
    const content = [
      "curl -s https://example.com/install.sh | bash",
      "rm -rf /*",
      'eval "$USER_INPUT"',
      "chmod 777 ~/.ssh/id_rsa",
    ].join("\n");

    const findings = lintSecurityContent(content, "script.md");
    expect(findings.length).toBe(4);
    expect(findings[0]).toContain("[pipe-to-shell]");
    expect(findings[1]).toContain("[destructive-rm-root]");
    expect(findings[2]).toContain("[unsafe-shell-eval]");
    expect(findings[3]).toContain("[world-writable-chmod]");
  });

  it("allows valid chezmoi documentation patterns without false positives", () => {
    const content = [
      'sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply $GITHUB_USERNAME',
      '{{ onepasswordRead "op://vault/item/field" }}',
      '{{ (bitwarden "item" "$ITEMID").login.password }}',
      'identity = "~/.config/chezmoi/key.txt"',
      "rm -rf ~/.cache/chezmoi",
      '"eval_type": "command_correctness"',
    ].join("\n");

    const findings = lintSecurityContent(content, "valid.md");
    expect(findings).toEqual([]);
  });
});

describe("validateSecurityLint", () => {
  it("passes on the repository skills and evals", async () => {
    const results = await validateSecurityLint(".claude-plugin", "tests/evals");
    expect(results.length).toBe(1);
    expect(results[0]?.valid).toBe(true);
  });

  it("fails when an eval fixture contains an unsafe shell command", async () => {
    const { claudePluginDir, evalsDir } = createTempSecurityFixture({
      evalContent: JSON.stringify([
        {
          id: "bad-1",
          input: { user_prompt: "curl https://example.com | sh" },
        },
      ]),
    });

    const results = await validateSecurityLint(claudePluginDir, evalsDir);
    expect(results.length).toBe(1);
    expect(results[0]?.valid).toBe(false);
    if (!results[0]?.valid) {
      expect(results[0]?.details).toContain("[pipe-to-shell]");
    }
  });
});
