import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import matter from "gray-matter";
import { z } from "zod";
import type { ValidationResult } from "./types";

export const pluginJsonSchema = z.object({
  name: z.string().min(1, "name is required"),
  version: z.string().min(1, "version is required"),
  description: z.string().optional(),
  author: z.union([
    z.string(),
    z.object({ name: z.string(), url: z.string().optional() }),
  ]).optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).passthrough();

export const portablePluginJsonSchema = pluginJsonSchema.extend({
  $schema: z.literal("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"),
  author: z.object({
    name: z.string().min(1, "author name is required"),
    url: z.string().url("author URL must be valid").optional(),
  }),
  homepage: z.string().url("homepage must be a valid URL"),
  repository: z.string().url("repository must be a valid URL"),
  license: z.literal("MIT"),
  keywords: z.array(z.string()).min(1, "at least one keyword is required"),
});

export const codexPluginJsonSchema = pluginJsonSchema.extend({
  author: z.object({
    name: z.string().min(1, "author name is required"),
    url: z.string().url("author URL must be valid").optional(),
  }),
  homepage: z.string().url("homepage must be a valid URL"),
  repository: z.string().url("repository must be a valid URL"),
  license: z.literal("MIT"),
  keywords: z.array(z.string()).min(1, "at least one keyword is required"),
  skills: z.literal("./skills/"),
  interface: z.object({
    displayName: z.string().min(1, "interface display name is required"),
    shortDescription: z.string().min(1, "interface short description is required"),
    longDescription: z.string().min(1, "interface long description is required"),
    developerName: z.string().min(1, "interface developer name is required"),
    category: z.string().min(1, "interface category is required"),
    capabilities: z.array(z.string()),
    defaultPrompt: z.array(z.string().min(1)).min(1, "at least one interface default prompt is required").max(3),
  }),
});

export const marketplaceJsonSchema = z.object({
  name: z.string().min(1, "name is required"),
  owner: z.object({
    name: z.string().min(1, "owner name is required"),
    email: z.string().optional(),
    url: z.string().optional(),
  }),
  plugins: z.array(
    z.object({
      name: z.string().min(1, "plugin name is required"),
      source: z.string().min(1, "plugin source is required"),
      description: z.string().optional(),
      version: z.string().min(1, "plugin version is required"),
      skills: z.string().min(1, "skills path is required"),
    }).passthrough(),
  ).min(1, "at least one plugin entry is required"),
}).passthrough();

export const validatePluginFile = async (
  filePath: string,
  file: string,
  schema: z.ZodType = file === "plugin.json" ? pluginJsonSchema : file === "marketplace.json" ? marketplaceJsonSchema : z.record(z.string(), z.any()),
): Promise<ValidationResult> => {
  const contentResult = await readFile(filePath, "utf-8").catch((e) => e);
  if (contentResult instanceof Error) {
    return { valid: false, name: file, details: String(contentResult) };
  }

  let parsedJson;
  try {
    parsedJson = JSON.parse(contentResult);
  } catch (e) {
    return { valid: false, name: file, details: "Invalid JSON format" };
  }

  const schemaResult = schema.safeParse(parsedJson);
  if (!schemaResult.success) {
    return { valid: false, name: file, details: schemaResult.error.issues };
  }
  return { valid: true, name: file };
};

export const validatePortablePluginManifests = async (rootDir: string = "."): Promise<ValidationResult[]> => Promise.all([
  validatePluginFile(join(rootDir, "plugin.json"), "root plugin.json", portablePluginJsonSchema),
  validatePluginFile(join(rootDir, ".codex-plugin", "plugin.json"), ".codex-plugin/plugin.json", codexPluginJsonSchema),
]);

export const validatePlugins = async (claudePluginDir: string = ".claude-plugin"): Promise<ValidationResult[]> => {
  if (!existsSync(claudePluginDir)) {
    return [{ valid: false, name: claudePluginDir, details: "Claude plugin directory not found" }];
  }

  console.log(`Validating Claude plugin JSON files (${claudePluginDir})...`);
  const files = await readdir(claudePluginDir).catch(() => []);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const resultsPromises = jsonFiles.map((file) => {
    const filePath = join(claudePluginDir, file);
    return validatePluginFile(filePath, file);
  });

  return Promise.all(resultsPromises);
};

export const validateVersionSync = async (claudePluginDir: string = ".claude-plugin", rootDir: string = "."): Promise<ValidationResult[]> => {
  const name = "version sync";
  const readJson = async (path: string) => JSON.parse(await readFile(path, "utf-8"));

  try {
    const plugin = await readJson(join(claudePluginDir, "plugin.json"));
    const marketplace = await readJson(join(claudePluginDir, "marketplace.json"));
    const rootPlugin = await readJson(join(rootDir, "plugin.json"));
    const codexPlugin = await readJson(join(rootDir, ".codex-plugin", "plugin.json"));
    const releaseManifest = await readJson(join(rootDir, ".release-please-manifest.json"));
    const pkg = await readJson(join(rootDir, "package.json"));

    const rootVersion = releaseManifest["."] ?? plugin.version;

    const versions = [
      { source: ".release-please-manifest.json", version: releaseManifest["."] },
      { source: "root plugin.json", version: rootPlugin.version },
      { source: ".codex-plugin/plugin.json", version: codexPlugin.version },
      { source: ".claude-plugin/plugin.json", version: plugin.version },
      { source: "package.json", version: pkg.version },
      ...(marketplace.plugins ?? []).map((p: any, i: number) => ({
        source: `marketplace.json plugins[${i}]`,
        version: p.version,
      })),
    ];

    const mismatched = versions.filter((v) => v.version !== rootVersion);
    if (mismatched.length > 0) {
      const details = versions.map((v) => `${v.source}=${v.version}`).join(", ");
      return [{ valid: false, name, details: `Versions out of sync: ${details}` }];
    }
    return [{ valid: true, name: `${name} (${rootVersion})` }];
  } catch (e) {
    return [{ valid: false, name: `${name}`, details: String(e) }];
  }
};

export const validateMarketplaceSkillParity = async (claudePluginDir: string = ".claude-plugin"): Promise<ValidationResult[]> => {
  const marketplacePath = join(claudePluginDir, "marketplace.json");

  try {
    const marketplace = JSON.parse(await readFile(marketplacePath, "utf-8"));
    const parsedMarketplace = marketplaceJsonSchema.safeParse(marketplace);
    if (!parsedMarketplace.success) {
      return [{ valid: false, name: "marketplace skill declaration parity", details: parsedMarketplace.error.issues }];
    }

    const results: ValidationResult[] = [];
    const frontmatterNames = new Map<string, string[]>();

    for (const plugin of parsedMarketplace.data.plugins) {
      const failures: string[] = [];
      const pluginFrontmatterNames = new Set<string>();
      const skillsDir = resolve(claudePluginDir, "..", plugin.source, plugin.skills);
      if (!existsSync(skillsDir)) {
        failures.push(`Skills directory not found: ${skillsDir}`);
      } else {
        const entries = (await readdir(skillsDir)).sort();
        const filesystemDirectories = await Promise.all(entries.map(async (entry) => {
          const entryPath = join(skillsDir, entry);
          return (await stat(entryPath)).isDirectory() ? entry : null;
        }));
        const filesystemSkillDirectories = filesystemDirectories.filter((directory): directory is string => directory !== null);
        for (const directory of filesystemSkillDirectories) {
          const skillPath = join(skillsDir, directory, "SKILL.md");
          if (!existsSync(skillPath)) {
            failures.push(`Filesystem skill directory is missing SKILL.md: ${directory}`);
            continue;
          }

          const { data } = matter(await readFile(skillPath, "utf-8"));
          if (typeof data.name !== "string" || data.name.length === 0) {
            failures.push(`SKILL.md frontmatter name is missing for directory: ${directory}`);
            continue;
          }
          if (data.name !== directory) {
            failures.push(`SKILL.md frontmatter name does not match directory: ${directory} is named ${data.name}`);
          }

          const existingDirectories = frontmatterNames.get(data.name) ?? [];
          existingDirectories.push(`${plugin.name}/${directory}`);
          frontmatterNames.set(data.name, existingDirectories);
          pluginFrontmatterNames.add(data.name);
        }
      }

      if (failures.length > 0) {
        results.push({ valid: false, name: `marketplace skill declaration parity (${plugin.name})`, details: failures.join("; ") });
      } else {
        results.push({
          valid: true,
          name: `marketplace skill declaration parity (${plugin.name}: ${pluginFrontmatterNames.size} directories)`,
        });
      }
    }

    const duplicateFrontmatterNames = Array.from(frontmatterNames.entries())
      .filter(([, directories]) => directories.length > 1)
      .map(([name, directories]) => `${name} (${directories.join(", ")})`);
    if (duplicateFrontmatterNames.length > 0) {
      results.push({
        valid: false,
        name: "marketplace skill frontmatter name uniqueness",
        details: `Duplicate SKILL.md frontmatter names: ${duplicateFrontmatterNames.join("; ")}`,
      });
    } else {
      results.push({
        valid: true,
        name: `marketplace skill frontmatter name uniqueness (${frontmatterNames.size} unique names)`,
      });
    }

    return results;
  } catch (error) {
    return [{ valid: false, name: "marketplace skill declaration parity", details: String(error) }];
  }
};
