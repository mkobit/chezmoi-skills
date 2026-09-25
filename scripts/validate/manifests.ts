import { existsSync } from "fs";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
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

export const marketplaceJsonSchema = z.object({
  name: z.string().min(1, "name is required"),
  plugins: z.array(
    z.object({
      name: z.string().min(1, "plugin name is required"),
      source: z.string().min(1, "plugin source is required"),
      description: z.string().optional(),
      version: z.string().min(1, "plugin version is required"),
    }).passthrough(),
  ).min(1, "at least one plugin entry is required"),
}).passthrough();

export const validatePluginFile = async (filePath: string, file: string): Promise<ValidationResult> => {
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

  const schema = file === "plugin.json"
    ? pluginJsonSchema
    : file === "marketplace.json"
    ? marketplaceJsonSchema
    : z.record(z.string(), z.any());

  const schemaResult = schema.safeParse(parsedJson);
  if (!schemaResult.success) {
    return { valid: false, name: file, details: schemaResult.error.errors };
  }
  return { valid: true, name: file };
};

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

export const validateVersionSync = async (claudePluginDir: string = ".claude-plugin"): Promise<ValidationResult[]> => {
  const name = "version sync";
  const readJson = async (path: string) => JSON.parse(await readFile(path, "utf-8"));

  try {
    const plugin = await readJson(join(claudePluginDir, "plugin.json"));
    const marketplace = await readJson(join(claudePluginDir, "marketplace.json"));
    const releaseManifest = await readJson(".release-please-manifest.json");
    const pkg = await readJson("package.json");

    const rootVersion = releaseManifest["."] ?? plugin.version;

    const versions = [
      { source: ".release-please-manifest.json", version: releaseManifest["."] },
      { source: "plugin.json", version: plugin.version },
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
