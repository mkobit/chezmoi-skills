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
      assertions.routerMatches('{"trigger":true,"selected_skill":"chezmoi-templating"}', context)
    ).toBe(true);
    expect(
      assertions.routerMatches('```json\n{"trigger":true,"selected_skill":"chezmoi-templating"}\n```', context)
    ).toBe(true);
    expect(
      assertions.routerMatches('{"trigger":false,"selected_skill":"chezmoi-templating"}', context)
    ).toBe(false);
    expect(assertions.routerMatches("not JSON", context)).toBe(false);
  });
});
