import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { z } from "zod";
import matter from "gray-matter";

const program = new Command();

program
  .name("applyReleaseVersion")
  .description("Applies the new semantic-release version to plugin JSONs and skills")
  .argument("<version>", "The new version to apply")
  .parse(process.argv);

const newVersion = program.args[0];

const PluginSchema = z.object({
  version: z.string(),
}).catchall(z.any());

const MarketplacePluginSchema = z.object({
  version: z.string().optional(),
}).catchall(z.any());

const MarketplaceSchema = z.object({
  plugins: z.array(MarketplacePluginSchema).optional(),
}).catchall(z.any());

const getAllSkillFiles = (dir: string): string[] => {
  let results: string[] = [];
  const list = readdirSync(dir);
  list.forEach(file => {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllSkillFiles(fullPath));
    } else if (file === "SKILL.md") {
      results.push(fullPath);
    }
  });
  return results;
};

const applyVersion = () => {
  const pluginPath = ".claude-plugin/plugin.json";
  const rawPluginData = JSON.parse(readFileSync(pluginPath, "utf-8"));
  const pluginData = PluginSchema.parse(rawPluginData);

  pluginData.version = newVersion;
  writeFileSync(pluginPath, JSON.stringify(pluginData, null, 2) + "\n");
  console.log(`Updated ${pluginPath} to ${newVersion}`);

  const marketPath = ".claude-plugin/marketplace.json";
  const rawMarketData = JSON.parse(readFileSync(marketPath, "utf-8"));
  const marketData = MarketplaceSchema.parse(rawMarketData);

  if (marketData.plugins?.[0]) {
    marketData.plugins[0].version = newVersion;
    writeFileSync(marketPath, JSON.stringify(marketData, null, 2) + "\n");
    console.log(`Updated ${marketPath} to ${newVersion}`);
  }

  const skillFiles = getAllSkillFiles("skills");
  skillFiles.forEach(file => {
    const content = readFileSync(file, "utf-8");
    const parsed = matter(content);

    if (parsed.data && parsed.data.version) {
      parsed.data.version = newVersion;
      const newContent = matter.stringify(parsed.content, parsed.data);
      writeFileSync(file, newContent, "utf-8");
      console.log(`Updated ${file} to ${newVersion}`);
    }
  });
};

applyVersion();
