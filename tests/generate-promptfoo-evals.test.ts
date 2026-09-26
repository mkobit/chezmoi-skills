import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generatePromptfooEvals } from "../scripts/generate-promptfoo-evals";

describe("generate-promptfoo-evals", () => {
  it("derives answer and router suites from the full checked-in corpus without provider calls", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "chezmoi-promptfoo-evals-"));
    const summary = await generatePromptfooEvals({ outDir });

    expect(summary).toEqual({
      total_cases: 109,
      answer_cases: 46,
      router_cases: 109,
      skills: [
        "chezmoi-cli-commands",
        "chezmoi-configuration",
        "chezmoi-externals",
        "chezmoi-file-attributes",
        "chezmoi-init",
        "chezmoi-machine-config",
        "chezmoi-scripts",
        "chezmoi-secrets-management",
        "chezmoi-templating",
      ],
    });

    const answerTests = readFileSync(join(outDir, "promptfoo-answer-tests.generated.yaml"), "utf-8");
    const routerTests = readFileSync(join(outDir, "promptfoo-router-tests.generated.yaml"), "utf-8");
    const routerConfig = readFileSync(join(outDir, "promptfooconfig.router.generated.yaml"), "utf-8");
    const answerConfig = readFileSync("promptfooconfig.yaml", "utf-8");

    expect(answerTests.match(/^  - description:/gm)).toHaveLength(46);
    expect(routerTests.match(/^  - description:/gm)).toHaveLength(109);
    expect(routerTests).toContain('corpus_id: "TC-TRIG-001"');
    expect(routerTests).toContain('target_skill: "chezmoi-templating"');
    expect(answerTests).toContain("Apply the source state to the target directory");
    expect(answerTests).toContain("Execute and look up chezmoi CLI subcommands");
    expect(answerTests).not.toContain('skill_context: "file://');
    expect(answerTests).not.toContain('reference_context: "file://');
    expect(routerConfig).toContain("tests: file://promptfoo-router-tests.generated.yaml");
    expect(routerTests).toContain("file://../scripts/eval-assertions.cjs:routerMatches");
    expect(routerTests).toContain('selectedSkills: ["chezmoi-configuration","chezmoi-scripts"]');
    expect(routerTests).toContain("allowClarification: true");
    expect(answerTests).toContain("file://scripts/eval-assertions.cjs:answerQualityMatches");
    expect(answerConfig).toContain("tests: file://eval_results/promptfoo-answer-tests.generated.yaml");
    for (const skill of summary.skills) {
      expect(answerTests).toContain(`target_skill: "${skill}"`);
    }
  });
});
