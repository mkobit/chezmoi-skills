# Agent Instructions

This repository contains skills for AI agents designed to manage and automate tasks related to `chezmoi`.

## Skill Structure and Progressive Disclosure

When adding or modifying skills in the `skills/` directory, you must follow the Progressive Disclosure pattern outlined in the Agent Development Kit (ADK) [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/).

This pattern organizes knowledge into three distinct layers to optimize context usage:

* **L1 Metadata**: Basic information including the `name` and `description` defined in the YAML frontmatter of the `SKILL.md` file. The description should be descriptive enough for an agent to determine if the skill is relevant.
* **L2 Instructions**: The body of the `SKILL.md` file containing the step-by-step instructions the agent should follow when the skill is activated.
* **L3 Resources**: Detailed reference materials, examples, and external context located in the `references/` subdirectory within the skill's folder. These are loaded dynamically only when instructed by the L2 layer.

### Example Directory Structure

```text
skills/example-skill/
├── SKILL.md           # Contains L1 (YAML frontmatter) and L2 (Markdown instructions)
└── references/        # Contains L3 resources
    ├── spec.md
    └── examples.txt
```

By adhering to this structure, we ensure that agents only load the context they need, when they need it, leading to more efficient and scalable capability expansion.
