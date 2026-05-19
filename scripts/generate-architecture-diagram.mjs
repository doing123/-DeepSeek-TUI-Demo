import { mkdir, readFile, writeFile } from "fs/promises";

const packageJson = JSON.parse(await readTextJson("package.json"));
const plan = JSON.parse(await readTextJson("docs/project-plan.json"));
const version = packageJson.version;
const outDir = "docs/architecture";
const versionedPath = `${outDir}/architecture-v${version}.svg`;
const latestPath = `${outDir}/architecture-latest.svg`;

const svg = buildSvg({
  title: plan.title,
  version,
  environment: plan.environment,
  features: pickFeatureHighlights(plan.currentFeatures),
  roadmap: plan.roadmap
});

await mkdir(outDir, { recursive: true });
await writeFile(versionedPath, svg, "utf8");
await writeFile(latestPath, svg, "utf8");

console.log(`Generated ${versionedPath}`);
console.log(`Generated ${latestPath}`);

async function readTextJson(path) {
  return readFile(path, "utf8");
}

function buildSvg({ title, version, environment, features, roadmap }) {
  const nodes = [
    {
      id: "ui",
      label: "Next.js Workbench",
      detail: "任务输入 / trace 展示 / 后续 CLI-TUI 外壳",
      x: 70,
      y: 170,
      w: 260,
      h: 92,
      accent: "#0f8b8d"
    },
    {
      id: "api",
      label: "POST /api/agent",
      detail: "服务端入口 / 保护 API key / macOS workspace",
      x: 430,
      y: 170,
      w: 260,
      h: 92,
      accent: "#2f6f9f"
    },
    {
      id: "runner",
      label: "Agent Runner",
      detail: "目标理解 / 工具循环 / 上限控制 / final answer",
      x: 790,
      y: 170,
      w: 300,
      h: 92,
      accent: "#476a42"
    },
    {
      id: "provider",
      label: "DeepSeek Provider",
      detail: "OpenAI-compatible chat completions",
      x: 1160,
      y: 170,
      w: 260,
      h: 92,
      accent: "#8a5a16"
    },
    {
      id: "prompt",
      label: "Prompt Protocol",
      detail: "tool_call / final JSON / 高层步骤摘要",
      x: 790,
      y: 345,
      w: 300,
      h: 92,
      accent: "#6c5b9a"
    },
    {
      id: "tools",
      label: "Read-only Tools",
      detail: "list_files / read_file / search_text",
      x: 430,
      y: 345,
      w: 260,
      h: 92,
      accent: "#13795b"
    },
    {
      id: "workspace",
      label: "Workspace Guard",
      detail: "路径校验 / 忽略 .env / 文本文件索引",
      x: 70,
      y: 345,
      w: 260,
      h: 92,
      accent: "#5b6f82"
    },
    {
      id: "docs",
      label: "Run History + Docs",
      detail: ".agent-runs / README / CHANGELOG / SVG",
      x: 70,
      y: 535,
      w: 360,
      h: 92,
      accent: "#985f6f"
    },
    {
      id: "next",
      label: "Next Version",
      detail: nextRoadmapText(roadmap, version),
      x: 520,
      y: 535,
      w: 390,
      h: 92,
      accent: "#a3562a"
    },
    {
      id: "safety",
      label: "Validation Commands",
      detail: "typecheck / build / 白名单执行",
      x: 1000,
      y: 535,
      w: 420,
      h: 92,
      accent: "#9a5b13"
    }
  ];

  const edges = [
    ["ui", "api"],
    ["api", "runner"],
    ["runner", "provider"],
    ["runner", "prompt"],
    ["runner", "tools"],
    ["tools", "workspace"],
    ["runner", "safety"],
    ["docs", "ui"],
    ["next", "runner"]
  ];

  const featureLines = features
    .map((feature, index) => {
      const column = index < 4 ? 0 : 1;
      const row = index % 4;
      const x = column === 0 ? 80 : 760;
      const y = 724 + row * 24;
      return `<tspan x="${x}" y="${y}">${escapeXml(feature)}</tspan>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="900" viewBox="0 0 1500 900" role="img" aria-label="${escapeXml(title)} architecture diagram">
  <defs>
    <marker id="arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
      <path d="M 0 0 L 12 6 L 0 12 z" fill="#61706a"/>
    </marker>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#1c2824" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="1500" height="900" fill="#f7f8f6"/>
  <rect x="40" y="36" width="1420" height="804" rx="18" fill="#ffffff" stroke="#d9dfd9"/>

  <text x="70" y="88" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="32" font-weight="800" fill="#17211b">${escapeXml(title)} Architecture</text>
  <text x="70" y="122" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="16" fill="#5d6a63">Version v${escapeXml(version)} · ${escapeXml(environment)} · generated snapshot</text>

  ${edges.map(([from, to]) => renderEdge(node(nodes, from), node(nodes, to))).join("\n  ")}
  ${nodes.map(renderNode).join("\n  ")}

  <g>
    <text x="70" y="690" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="800" fill="#17211b">Current Capabilities</text>
    <text x="80" y="724" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="15" fill="#46534d">${featureLines}</text>
  </g>

  <text x="70" y="812" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#7a857f">Generated by scripts/generate-architecture-diagram.mjs. Commit the versioned SVG to compare architecture changes over time.</text>
</svg>
`;
}

function renderNode(item) {
  return `<g filter="url(#shadow)">
    <rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="10" fill="#fbfcfb" stroke="#d9dfd9"/>
    <rect x="${item.x}" y="${item.y}" width="8" height="${item.h}" rx="4" fill="${item.accent}"/>
    <text x="${item.x + 24}" y="${item.y + 34}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" font-weight="800" fill="#17211b">${escapeXml(item.label)}</text>
    <text x="${item.x + 24}" y="${item.y + 62}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="14" fill="#5d6a63">${escapeXml(item.detail)}</text>
  </g>`;
}

function renderEdge(from, to) {
  const start = {
    x: from.x + from.w,
    y: from.y + from.h / 2
  };
  const end = {
    x: to.x,
    y: to.y + to.h / 2
  };

  if (Math.abs(start.y - end.y) < 4 && start.x < end.x) {
    return `<path d="M ${start.x + 12} ${start.y} L ${end.x - 12} ${end.y}" fill="none" stroke="#61706a" stroke-width="2" marker-end="url(#arrow)"/>`;
  }

  const midX = (start.x + end.x) / 2;
  return `<path d="M ${start.x + 12} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x - 12} ${end.y}" fill="none" stroke="#61706a" stroke-width="2" marker-end="url(#arrow)"/>`;
}

function node(nodes, id) {
  const found = nodes.find((item) => item.id === id);

  if (!found) {
    throw new Error(`Missing node ${id}`);
  }

  return found;
}

function nextRoadmapText(roadmap, version) {
  const currentMinor = version.split(".").slice(0, 2).join(".");
  const currentLabel = `V${currentMinor}`;
  const currentIndex = roadmap.findIndex((item) => item.version === currentLabel);
  const next = roadmap[currentIndex + 1] ?? roadmap[0];
  return `${next.version} ${next.theme}`;
}

function pickFeatureHighlights(features) {
  const important = features.filter((feature) =>
    [
      "服务端 API",
      "只读工具循环",
      "工具 trace",
      "补丁预览",
      "人工审批",
      "运行记录",
      "验证关联",
      "版本架构图",
      "自动文档生成"
    ].some((keyword) => feature.includes(keyword))
  );

  return important.slice(0, 8);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
