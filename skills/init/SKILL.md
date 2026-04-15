---
version: 0.0.1
name: chezmoi-init
description: Initialize and set up chezmoi, including bare repository handling and initial configuration.
---

# Chezmoi initialization overview

The `chezmoi init` command is the foundational entry point for managing dotfiles on a new or existing machine.
Its primary purpose is to bootstrap the local environment by fetching the source state and configuring local settings.
This process transforms a raw machine into a fully configured environment tailored to the user.
Initialization handles cloning the remote repository, establishing the local source directory, and generating the primary configuration file.

## The initialization lifecycle

The initialization process follows a distinct lifecycle to ensure safe and predictable setup.
First, chezmoi determines the repository location using URL guessing or explicit arguments.
Next, it clones the remote repository into the local source directory.
By default, the source directory is located at `~/.local/share/chezmoi`.
After cloning, chezmoi searches for a special configuration template file in the source directory.
If this template exists, chezmoi evaluates it to generate the local configuration file.
Finally, if requested via flags, chezmoi will immediately apply the newly fetched state to the target directories.

## Repository resolution and cloning

Chezmoi provides intelligent repository URL guessing to simplify the initialization command.
If provided a single word, it assumes a GitHub username and attempts to clone their `dotfiles` repository.
Full HTTP, HTTPS, or SSH URLs can be provided for explicit repository targeting.
The `--ssh` flag forces chezmoi to guess an SSH URL instead of an HTTPS URL, which is useful for repositories requiring authenticated pushes.
You can target a specific git branch or tag during initialization using the `--branch` flag.
For faster cloning, especially in ephemeral environments, the `--depth 1` flag performs a shallow clone of the repository.

## Configuration file generation

The configuration file dictates how chezmoi behaves on the current specific machine.
It is generated dynamically during initialization from a template named `.chezmoi.toml.tmpl` located in the root of the source state.
This template is evaluated as a Go template before any other chezmoi commands are executed.
The resulting configuration file is typically saved to `~/.config/chezmoi/chezmoi.toml`.
Within this template, you can use built-in functions like `promptStringOnce` and `promptBoolOnce` to interactively ask the user for machine-specific values.
These prompted values might include email addresses, hostname overrides, or environment types like work or personal.
This dynamic generation ensures that a single dotfiles repository can serve many vastly different machines securely.

## Ephemeral environments and one-shot execution

Chezmoi is highly effective in ephemeral environments like Docker containers, Codespaces, or temporary virtual machines.
The `--one-shot` flag is designed specifically for these transient environments.
When used, `--one-shot` combines initialization, application, and cleanup into a single operation.
It clones the repository into a temporary directory instead of the permanent source directory.
It then applies the state and immediately deletes the temporary repository, leaving no chezmoi configuration behind.
This is ideal for bootstrapping scripts where you only want the resulting dotfiles without keeping chezmoi installed or managed.

## References

Review [Examples](./references/examples.md) for complex configuration templates and command variations.
Review [Docs](./references/docs.md) for deeper technical specifications and official guidance.
