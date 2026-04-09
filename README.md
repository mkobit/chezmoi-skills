# Chezmoi Agent Skills

Agent Skills for use with chezmoi.

These skills follow the [Agent Skills specification](https://agentskills.io/specification)
so they can be used by any skills-compatible agent, including Claude Code
and Codex CLI.

## Installation

### Marketplace

```sh
/plugin marketplace add your-username/chezmoi-skills
/plugin install chezmoi@chezmoi-skills
```

### npx skills

```sh
npx skills add git@github.com:your-username/chezmoi-skills.git
```

### Manually

#### Claude Code

Add the contents of this repo to a `/.claude` folder in the root of your workspace
(or whichever folder you're using with Claude Code). See more in the
[official Claude Skills documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).

## Skills

| Skill | Description |
| ----- | ----------- |
| [template-writing](skills/template-writing) | Create and edit chezmoi templates. |
| [source-directory](skills/source-directory) | Manage the chezmoi source directory files. |
| [target-writing](skills/target-writing) | Manage chezmoi targets. |
| [chezmoi-toml](skills/chezmoi-toml) | Configure chezmoi properties in `chezmoi.toml`. |
| [init](skills/init) | Initialization settings and commands for chezmoi. |
