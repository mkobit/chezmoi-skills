import { existsSync } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import matter from "gray-matter";
import { encode } from "gpt-tokenizer";
import type { SkillTokenStats } from "./types";
import { getMarkdownFiles, getSkillsDirectories } from "./skills";

export const countTokens = (text: string): number => {
  const { content } = matter(text);
  return encode(content).length;
};

export const reportTokenEfficiency = async (claudePluginDir: string = ".claude-plugin"): Promise<SkillTokenStats[]> => {
  const allSkillsDirs = await getSkillsDirectories(claudePluginDir);
  const allStats: SkillTokenStats[] = [];

  for (const skillsDir of allSkillsDirs) {
    if (!existsSync(skillsDir)) continue;
    const files = await readdir(skillsDir).catch(() => []);
    const dirsPromises = files.map(async (file) => {
      const isDir = await stat(join(skillsDir, file)).then((s) => s.isDirectory()).catch(() => false);
      return isDir ? file : null;
    });
    const dirs = (await Promise.all(dirsPromises)).filter(Boolean) as string[];

    for (const dir of dirs) {
      const skillMdPath = join(skillsDir, dir, "SKILL.md");
      let l1l2Tokens = 0;
      if (existsSync(skillMdPath)) {
        const content = await readFile(skillMdPath, "utf-8").catch(() => "");
        l1l2Tokens = countTokens(content);
      }

      const mdFiles = await getMarkdownFiles(join(skillsDir, dir));
      let l3Tokens = 0;

      for (const file of mdFiles) {
        if (file !== skillMdPath) {
          const content = await readFile(file, "utf-8").catch(() => "");
          l3Tokens += countTokens(content);
        }
      }

      allStats.push({
        skillName: dir,
        l1l2Tokens,
        l3Tokens,
        totalTokens: l1l2Tokens + l3Tokens,
        fileCount: mdFiles.length,
      });
    }
  }

  if (allStats.length > 0) {
    console.log("\n📊 Skill token efficiency benchmark report:");
    console.log("┌───────────────────────┬───────────────┬───────────────┬───────────────┬───────────┐");
    console.log("│ Skill Name            │ L1/L2 (SKILL) │ L3 (Refs)     │ Total Tokens  │ MD Files  │");
    console.log("├───────────────────────┼───────────────┼───────────────┼───────────────┼───────────┤");
    for (const s of allStats) {
      const nameCol = s.skillName.padEnd(21);
      const l1l2Col = String(s.l1l2Tokens).padStart(13);
      const l3Col = String(s.l3Tokens).padStart(13);
      const totalCol = String(s.totalTokens).padStart(13);
      const filesCol = String(s.fileCount).padStart(9);
      console.log(`│ ${nameCol} │ ${l1l2Col} │ ${l3Col} │ ${totalCol} │ ${filesCol} │`);
    }
    console.log("└───────────────────────┴───────────────┴───────────────┴───────────────┴───────────┘\n");
  }

  return allStats;
};
