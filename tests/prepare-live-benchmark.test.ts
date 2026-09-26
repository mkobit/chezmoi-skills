import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { prepareLiveBenchmark } from "../scripts/prepare-live-benchmark";

const write = (root: string, path: string, content: string): void => {
  const fullPath = join(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
};

describe("prepare-live-benchmark", () => {
  it("derives the full request matrix and reproducibility hashes without provider calls", () => {
    const root = mkdtempSync(join(tmpdir(), "chezmoi-live-benchmark-"));
    write(root, "package.json", '{"devDependencies":{"promptfoo":"0.123.1"}}');
    write(
      root,
      "tests/evals/sample.json",
      JSON.stringify([
        { eval_type: "command_correctness" },
        { eval_type: "answer_quality" },
        { eval_type: "skill_selection" },
      ])
    );
    write(root, "skills/example/SKILL.md", "---\nname: example\ndescription: Example\n---\n");
    write(root, "scripts/eval-assertions.cjs", "module.exports = {};\n");
    write(root, "scripts/generate-promptfoo-evals.ts", "export {};\n");
    write(root, "scripts/patch-version.cjs", "module.exports = {};\n");
    write(root, "bun.lock", "lockfile\n");
    write(
      root,
      "promptfooconfig.yaml",
      "prompts:\n  - label: baseline\n  - label: skill\nproviders:\n  - id: provider-a\n  - id: provider-b\ntests: file://eval_results/promptfoo-answer-tests.generated.yaml\n"
    );
    write(
      root,
      "eval_results/promptfooconfig.router.generated.yaml",
      "prompts:\n  - label: router\nproviders:\n  - id: provider-a\n  - id: provider-b\ntests: file://promptfoo-router-tests.generated.yaml\n"
    );
    write(
      root,
      "eval_results/promptfoo-answer-tests.generated.yaml",
      "  - description: command\n  - description: quality\n"
    );
    write(
      root,
      "eval_results/promptfoo-router-tests.generated.yaml",
      "  - description: command\n  - description: quality\n  - description: selection\n"
    );

    const result = prepareLiveBenchmark(root);

    expect(result.promptfoo_version).toBe("0.123.1");
    expect(result.corpus).toMatchObject({ cases: 3, answer_cases: 2, router_cases: 3 });
    expect(result.answer_suite).toMatchObject({ prompts: 2, planned_requests: 8 });
    expect(result.router_suite).toMatchObject({ prompts: 1, planned_requests: 6 });
    expect(result.total_planned_requests).toBe(14);
    expect(result.corpus.sha256).toHaveLength(64);
    expect(result.skill_source_sha256).toHaveLength(64);
    expect(result.evaluation_code_sha256).toHaveLength(64);
    expect(result.dependency_lock_sha256).toHaveLength(64);
  });

  it("rejects a Promptfoo version change before a paid run", () => {
    const root = mkdtempSync(join(tmpdir(), "chezmoi-live-benchmark-version-"));
    write(root, "package.json", '{"devDependencies":{"promptfoo":"1.0.0"}}');
    write(root, "tests/evals/sample.json", '[{"eval_type":"skill_selection"}]');

    expect(() => prepareLiveBenchmark(root)).toThrow("Expected promptfoo 0.123.1");
  });

  it("rejects stale generated suites before a paid run", () => {
    const root = mkdtempSync(join(tmpdir(), "chezmoi-live-benchmark-stale-"));
    write(root, "package.json", '{"devDependencies":{"promptfoo":"0.123.1"}}');
    write(root, "tests/evals/sample.json", '[{"eval_type":"answer_quality"}]');
    write(root, "skills/example/SKILL.md", "skill\n");
    write(root, "scripts/eval-assertions.cjs", "assertions\n");
    write(root, "scripts/generate-promptfoo-evals.ts", "generator\n");
    write(root, "scripts/patch-version.cjs", "patch\n");
    write(root, "bun.lock", "lockfile\n");
    write(root, "promptfooconfig.yaml", "prompts:\n  - label: answer\nproviders:\n  - id: provider\n");
    write(
      root,
      "eval_results/promptfooconfig.router.generated.yaml",
      "prompts:\n  - label: router\nproviders:\n  - id: provider\n"
    );
    write(root, "eval_results/promptfoo-answer-tests.generated.yaml", "");
    write(root, "eval_results/promptfoo-router-tests.generated.yaml", "");

    expect(() => prepareLiveBenchmark(root)).toThrow("Generated Promptfoo test counts do not match");
  });
});
