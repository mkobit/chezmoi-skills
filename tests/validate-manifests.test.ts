import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  codexPluginJsonSchema,
  portablePluginJsonSchema,
  validateMarketplaceSkillParity,
  validateVersionSync,
} from "../scripts/validate/manifests";

const temporaryDirectories: string[] = [];

const createFixture = (skills: Array<{ directory: string; name?: string }>, skillsPath: string = "./skills") => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-manifest-"));
  temporaryDirectories.push(root);
  const pluginDirectory = join(root, ".claude-plugin");
  const skillsDirectory = join(root, "skills");
  mkdirSync(pluginDirectory);
  mkdirSync(skillsDirectory);

  writeFileSync(join(pluginDirectory, "marketplace.json"), JSON.stringify({
    name: "test-marketplace",
    owner: { name: "Test owner" },
    plugins: [{
      name: "test-plugin",
      source: "./",
      version: "1.0.0",
      skills: skillsPath,
    }],
  }));

  for (const skill of skills) {
    const skillDirectory = join(skillsDirectory, skill.directory);
    mkdirSync(skillDirectory);
    writeFileSync(join(skillDirectory, "SKILL.md"), skill.name === undefined
      ? "---\ndescription: Test skill.\n---\n\nTest instructions.\n"
      : `---\nname: ${skill.name}\ndescription: Test skill.\n---\n\nTest instructions.\n`);
  }

  return pluginDirectory;
};

const createVersionFixture = (codexVersion: string = "1.0.0") => {
  const root = mkdtempSync(join(tmpdir(), "chezmoi-skills-version-"));
  temporaryDirectories.push(root);
  const claudePluginDirectory = join(root, ".claude-plugin");
  const codexPluginDirectory = join(root, ".codex-plugin");
  mkdirSync(claudePluginDirectory);
  mkdirSync(codexPluginDirectory);

  writeFileSync(join(root, ".release-please-manifest.json"), JSON.stringify({ ".": "1.0.0" }));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(join(root, "plugin.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(join(codexPluginDirectory, "plugin.json"), JSON.stringify({ version: codexVersion }));
  writeFileSync(join(claudePluginDirectory, "plugin.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(join(claudePluginDirectory, "marketplace.json"), JSON.stringify({
    plugins: [{ version: "1.0.0" }],
  }));

  return { root, claudePluginDirectory };
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (existsSync(directory)) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("validateMarketplaceSkillParity", () => {
  it("accepts a marketplace whose declared directories and unique frontmatter names match the filesystem", async () => {
    const pluginDirectory = createFixture([
      { directory: "first", name: "first" },
      { directory: "second", name: "second" },
    ]);

    const results = await validateMarketplaceSkillParity(pluginDirectory);

    expect(results).toContainEqual({ valid: true, name: "marketplace skill declaration parity (test-plugin: 2 directories)" });
    expect(results).toContainEqual({ valid: true, name: "marketplace skill frontmatter name uniqueness (2 unique names)" });
  });

  it("rejects a marketplace skills path that does not resolve", async () => {
    const pluginDirectory = createFixture([
      { directory: "first", name: "first" },
    ], "./missing");

    const results = await validateMarketplaceSkillParity(pluginDirectory);
    const parity = results.find((result) => result.name === "marketplace skill declaration parity (test-plugin)");

    expect(parity).toEqual({
      valid: false,
      name: "marketplace skill declaration parity (test-plugin)",
      details: expect.stringContaining("Skills directory not found:"),
    });
  });

  it("rejects absent and duplicate SKILL.md frontmatter names", async () => {
    const pluginDirectory = createFixture([
      { directory: "first", name: "duplicate" },
      { directory: "second", name: "duplicate" },
      { directory: "third" },
    ]);

    const results = await validateMarketplaceSkillParity(pluginDirectory);

    expect(results).toContainEqual({
      valid: false,
      name: "marketplace skill declaration parity (test-plugin)",
      details: "SKILL.md frontmatter name does not match directory: first is named duplicate; SKILL.md frontmatter name does not match directory: second is named duplicate; SKILL.md frontmatter name is missing for directory: third",
    });
    expect(results).toContainEqual({
      valid: false,
      name: "marketplace skill frontmatter name uniqueness",
      details: "Duplicate SKILL.md frontmatter names: duplicate (test-plugin/first, test-plugin/second)",
    });
  });

  it("rejects a SKILL.md frontmatter name that does not match its directory", async () => {
    const pluginDirectory = createFixture([
      { directory: "first", name: "other" },
    ]);

    const results = await validateMarketplaceSkillParity(pluginDirectory);

    expect(results).toContainEqual({
      valid: false,
      name: "marketplace skill declaration parity (test-plugin)",
      details: "SKILL.md frontmatter name does not match directory: first is named other",
    });
  });
});

describe("portable plugin manifests", () => {
  const portablePlugin = {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "chezmoi",
    version: "1.0.0",
    description: "Agent skills for managing dotfiles with chezmoi.",
    author: { name: "Test owner", url: "https://example.com" },
    homepage: "https://example.com",
    repository: "https://example.com/repository",
    license: "MIT",
    keywords: ["chezmoi"],
  };

  it("accepts the portable manifest and Codex compatibility overlay", () => {
    expect(portablePluginJsonSchema.safeParse(portablePlugin).success).toBe(true);
    expect(codexPluginJsonSchema.safeParse({
      ...portablePlugin,
      skills: "./skills/",
      interface: {
        displayName: "Chezmoi",
        shortDescription: "Manage chezmoi dotfiles.",
        longDescription: "Use Agent Skills to manage chezmoi dotfiles.",
        developerName: "Test owner",
        category: "Productivity",
        capabilities: [],
        defaultPrompt: ["Help me manage chezmoi dotfiles."],
      },
    }).success).toBe(true);
  });

  it("requires the Codex skills path to resolve from the plugin root", () => {
    expect(codexPluginJsonSchema.safeParse({
      ...portablePlugin,
      skills: "./skills",
      interface: {
        displayName: "Chezmoi",
        shortDescription: "Manage chezmoi dotfiles.",
        longDescription: "Use Agent Skills to manage chezmoi dotfiles.",
        developerName: "Test owner",
        category: "Productivity",
        capabilities: [],
        defaultPrompt: ["Help me manage chezmoi dotfiles."],
      },
    }).success).toBe(false);
  });
});

describe("validateVersionSync", () => {
  it("includes portable and Codex manifests in version synchronization", async () => {
    const { root, claudePluginDirectory } = createVersionFixture("1.0.1");

    const results = await validateVersionSync(claudePluginDirectory, root);

    expect(results).toEqual([{
      valid: false,
      name: "version sync",
      details: "Versions out of sync: .release-please-manifest.json=1.0.0, root plugin.json=1.0.0, .codex-plugin/plugin.json=1.0.1, .claude-plugin/plugin.json=1.0.0, package.json=1.0.0, marketplace.json plugins[0]=1.0.0",
    }]);
  });
});
