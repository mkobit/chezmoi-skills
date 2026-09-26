import { describe, expect, it } from "bun:test";

const assertions = require("../scripts/eval-assertions.cjs");

describe("Promptfoo assertions", () => {
  it("matches commands in plain text, code spans, and fenced blocks", () => {
    const context = { config: { pattern: "^chezmoi diff --exclude scripts$" } };

    expect(assertions.commandMatches("chezmoi diff --exclude scripts", context)).toBe(true);
    expect(assertions.commandMatches("Run `chezmoi diff --exclude scripts`.", context)).toBe(true);
    expect(assertions.commandMatches("```sh\nchezmoi diff --exclude scripts\n```", context)).toBe(true);
    expect(assertions.commandMatches("chezmoi diff", context)).toBe(false);
  });

  it("compares parsed router fields", () => {
    const context = { config: { trigger: true, selectedSkill: "chezmoi-templating" } };

    expect(
      assertions.routerMatches(
        '{"trigger":true,"selected_skill":"chezmoi-templating","needs_clarification":false}',
        context
      )
    ).toBe(true);
    expect(
      assertions.routerMatches(
        '```json\n{"trigger":true,"selected_skill":"chezmoi-templating","needs_clarification":false}\n```',
        context
      )
    ).toBe(true);
    expect(
      assertions.routerMatches(
        '{"trigger":false,"selected_skill":"chezmoi-templating","needs_clarification":false}',
        context
      )
    ).toBe(false);
    expect(assertions.routerMatches("not JSON", context)).toBe(false);
  });

  it("accepts any configured skill or an explicit clarification for ambiguous routes", () => {
    const context = {
      config: {
        trigger: true,
        selectedSkills: ["chezmoi-configuration", "chezmoi-machine-config"],
        allowClarification: true,
      },
    };

    expect(
      assertions.routerMatches(
        '{"trigger":true,"selected_skill":"chezmoi-machine-config","needs_clarification":false}',
        context
      )
    ).toBe(true);
    expect(
      assertions.routerMatches('{"trigger":true,"selected_skill":null,"needs_clarification":true}', context)
    ).toBe(true);
    expect(
      assertions.routerMatches('{"trigger":true,"selected_skill":null,"needs_clarification":false}', context)
    ).toBe(false);
    expect(
      assertions.routerMatches(
        '{"trigger":true,"selected_skill":"chezmoi-machine-config","needs_clarification":true}',
        context
      )
    ).toBe(false);
  });

  it("requires a null selection when the skill catalog should not trigger", () => {
    const context = { config: { trigger: false, selectedSkills: [], allowClarification: false } };

    expect(
      assertions.routerMatches('{"trigger":false,"selected_skill":null,"needs_clarification":false}', context)
    ).toBe(true);
    expect(
      assertions.routerMatches(
        '{"trigger":false,"selected_skill":"chezmoi-cli-commands","needs_clarification":false}',
        context
      )
    ).toBe(false);
  });

  it("matches deterministic answer quality expectations", () => {
    const context = {
      config: {
        requiredConcepts: ["--dry-run"],
        forbiddenClaims: ["you should use --force"],
        clarification: "forbidden",
        safetyExpectations: ["preview"],
      },
    };

    expect(assertions.answerQualityMatches("Preview with `chezmoi apply --dry-run` first.", context)).toBe(true);
    expect(assertions.answerQualityMatches("Preview with --dry-run; do not use --force.", context)).toBe(true);
    expect(assertions.answerQualityMatches("Should I use --dry-run?", context)).toBe(false);
    expect(assertions.answerQualityMatches("Preview with --dry-run; you should use --force next.", context)).toBe(false);
  });
});
