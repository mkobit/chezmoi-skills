import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Command, Option } from "commander";
import { z } from "zod";
import matter from "gray-matter";

const program = new Command();

program
  .name("applyReleaseVersion")
  .description("Applies the new semantic-release version to plugin JSONs and skills")
  .argument("<version>", "The new version to apply")
  .addOption(new Option("--dry-run", "Print changes without modifying files").default(false))
  .parse(process.argv);

const newVersion = program.args[0];
const isDryRun = program.opts().dryRun;

const PluginSchema = z.object({
  version: z.string(),
}); // loose by default now, will avoid explicit method entirely

const MarketplacePluginSchema = z.object({
  version: z.string().optional(),
});

const MarketplaceSchema = z.object({
  plugins: z.array(MarketplacePluginSchema).optional(),
});

const getAllSkillFiles = (dir: string): readonly string[] => {
  const entries = readdirSync(dir);

  return entries.reduce((acc, file) => {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);

    if (stat && stat.isDirectory()) {
      return [...acc, ...getAllSkillFiles(fullPath)];
    }

    if (file === "SKILL.md") {
      return [...acc, fullPath];
    }

    return acc;
  }, [] as readonly string[]);
};

const applyVersion = () => {
  const pluginPath = ".claude-plugin/plugin.json";
  const rawPluginData = JSON.parse(readFileSync(pluginPath, "utf-8"));

  // Directly spread the parsed object alongside the original unparsed source to guarantee we keep all keys
  const pluginData = PluginSchema.parse(rawPluginData);
  const updatedPluginData = {
    ...rawPluginData,
    ...pluginData,
    version: newVersion
  };

  if (!isDryRun) {
    writeFileSync(pluginPath, JSON.stringify(updatedPluginData, null, 2) + "\n");
  }
  console.log(`[${isDryRun ? "DRY-RUN" : "UPDATED"}] ${pluginPath} to ${newVersion}`);

  const marketPath = ".claude-plugin/marketplace.json";
  const rawMarketData = JSON.parse(readFileSync(marketPath, "utf-8"));
  const marketData = MarketplaceSchema.parse(rawMarketData);

  const updatedMarketData = {
    ...rawMarketData,
    ...marketData,
    plugins: rawMarketData.plugins?.map((plugin: any, idx: number) => {
       const validatedPlugin = marketData.plugins?.[idx];
       return {
         ...plugin,
         ...validatedPlugin,
         version: newVersion
       };
    })
  };

  if (!isDryRun) {
    writeFileSync(marketPath, JSON.stringify(updatedMarketData, null, 2) + "\n");
  }
  console.log(`[${isDryRun ? "DRY-RUN" : "UPDATED"}] ${marketPath} to ${newVersion}`);

  const skillFiles = getAllSkillFiles("skills");

  skillFiles.forEach(file => {
    const content = readFileSync(file, "utf-8");
    const parsed = matter(content);

    if (parsed.data && parsed.data.version) {
      const updatedData = {
        ...parsed.data,
        version: newVersion
      };
      if (!isDryRun) {
        const newContent = matter.stringify(parsed.content, updatedData);
        writeFileSync(file, newContent, "utf-8");
      }
      console.log(`[${isDryRun ? "DRY-RUN" : "UPDATED"}] ${file} to ${newVersion}`);
    }
  });
};

applyVersion();
