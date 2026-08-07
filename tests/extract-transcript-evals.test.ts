import { describe, expect, it } from "bun:test";
import { parseTranscript } from "../scripts/extract-transcript-evals";

describe("extract-transcript-evals", () => {
  it("extracts command_correctness test case when a chezmoi command is run", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content: "<USER_REQUEST>How do I view pending changes with chezmoi diff?</USER_REQUEST>",
      }),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        tool_calls: [
          {
            name: "run_command",
            args: {
              CommandLine: "chezmoi diff --exclude scripts",
            },
          },
        ],
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("TC-TEST-001");
    expect(cases[0].eval_type).toBe("command_correctness");
    expect(cases[0].expected.exact_command).toBe("chezmoi diff --exclude scripts");
    expect(cases[0].expected.required_flags).toEqual(["--exclude"]);
  });

  it("extracts trigger_matching test case when prompt mentions chezmoi but no command is run", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content: "<USER_REQUEST>What is the best way to organize chezmoi dotfiles?</USER_REQUEST>",
      }),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        content: "Here is a guide to organizing your dotfiles...",
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe("TC-TEST-001");
    expect(cases[0].eval_type).toBe("trigger_matching");
    expect(cases[0].expected.should_trigger).toBe(true);
  });

  it("ignores non-chezmoi user requests", () => {
    const jsonl = [
      JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        content: "<USER_REQUEST>What is the capital of France?</USER_REQUEST>",
      }),
    ].join("\n");

    const cases = parseTranscript(jsonl, "chezmoi-cli-commands", "TC-TEST");
    expect(cases).toHaveLength(0);
  });
});
