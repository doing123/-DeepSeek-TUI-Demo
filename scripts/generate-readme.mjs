import { readFile, writeFile } from "fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const plan = JSON.parse(await readFile("docs/project-plan.json", "utf8"));

const readme = `# ${plan.title}

${plan.tagline}

> Environment: ${plan.environment}

## Purpose

${toBullets(plan.purpose)}

## Quick Start

\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`

Open http://localhost:3000 and run a goal from the workbench.

## Architecture

${plan.architecture.map((item) => `- **${item.name}**: ${item.description}`).join("\n")}

## Current Features

${toBullets(plan.currentFeatures)}

## DeepSeek

- Base URL: \`${plan.deepseek.baseUrl}\`
- Default model: \`${plan.deepseek.defaultModel}\`

${toBullets(plan.deepseek.notes)}

Sources:
${toBullets(plan.deepseek.sources)}

## Implementation Thinking

${toBullets(plan.thinkingLog)}

## Development Context

${plan.contextDocuments
  .map((item) => `- \`${item.path}\`: ${item.description}`)
  .join("\n")}

## Roadmap

${plan.roadmap
  .map(
    (release) =>
      `### ${release.version} · ${release.theme}\n\n${toBullets(release.items)}`
  )
  .join("\n\n")}

## Scripts

${Object.entries(packageJson.scripts)
  .map(([name, command]) => `- \`${name}\`: \`${command}\``)
  .join("\n")}

## README Automation

This README is generated from \`docs/project-plan.json\` and \`package.json\`.

The repository uses \`.githooks/pre-commit\` to run:

\`\`\`bash
npm run readme:generate
git add README.md
\`\`\`

If hooks are not active after cloning, run:

\`\`\`bash
npm run hooks:install
\`\`\`
`;

await writeFile("README.md", `${readme.trim()}\n`, "utf8");

function toBullets(items) {
  return items.map((item) => `- ${item}`).join("\n");
}
