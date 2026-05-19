"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AgentRunResult, PatchApplyResult, PatchProposal } from "@/lib/agent/types";

const starterGoals = [
  "阅读当前仓库，告诉我下一步最小可实现的 coding-agent 功能。",
  "为这个项目规划 V0.2：如何从只读建议升级到安全写文件。",
  "检查当前 Next/TS 项目结构，指出哪里还不利于学习 agent 开发。"
];

const defaultGoal =
  "我想学习如何做一个简易 agent 编码工具。请先扫描仓库，给出当前架构理解、下一步实现建议和风险点。";

export function AgentWorkbench() {
  const [goal, setGoal] = useState(defaultGoal);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const canRun = useMemo(() => goal.trim().length > 0 && !isRunning, [goal, isRunning]);

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRun) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ goal })
      });

      const payload = (await response.json()) as AgentRunResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : "Agent run failed");
      }

      setResult(payload as AgentRunResult);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Agent run failed");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__eyebrow">macOS · Next.js · DeepSeek</span>
          <h1>DeepSeek TUI Demo</h1>
          <p>一个用 TypeScript 学 agent 编码工具的最小工作台。</p>
        </div>

        <form className="composer" onSubmit={runAgent}>
          <label htmlFor="goal">任务目标</label>
          <textarea
            id="goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="描述你希望 agent 处理的编码任务"
          />

          <div className="actions">
            <button className="primary" type="submit" disabled={!canRun}>
              {isRunning ? "运行中" : "运行 Agent"}
            </button>
            <button className="secondary" type="button" onClick={() => setGoal(defaultGoal)}>
              重置
            </button>
          </div>
        </form>

        <section className="presets" aria-label="任务模板">
          <div className="section-title">任务模板</div>
          {starterGoals.map((starterGoal) => (
            <button
              className="preset"
              type="button"
              key={starterGoal}
              onClick={() => setGoal(starterGoal)}
            >
              {starterGoal}
            </button>
          ))}
        </section>

        <div className="status">
          DeepSeek key 通过 <code>DEEPSEEK_API_KEY</code> 读取；没有 key 时会返回本地离线结果。
        </div>
      </aside>

      <section className="workspace">
        {error ? (
          <div className="panel error">{error}</div>
        ) : result ? (
          <AgentResultView result={result} />
        ) : (
          <div className="empty">
            <p>输入任务后运行，右侧会显示 agent 的扫描步骤、建议和后续动作。</p>
          </div>
        )}
      </section>
    </main>
  );
}

function AgentResultView({ result }: { result: AgentRunResult }) {
  return (
    <div className="output-grid">
      <div>
        <section className="panel">
          <div className="tag-row" aria-label="运行信息">
            <span className={result.mode === "deepseek" ? "tag tag--ok" : "tag tag--warn"}>
              {result.mode}
            </span>
            <span className="tag tag--neutral">{result.model}</span>
            <span className="tag tag--neutral">{result.workspace.fileCount} files</span>
            <span className="tag tag--neutral">{result.toolCallCount} tools</span>
          </div>
          <h2>{result.answer.title}</h2>
          <p className="summary">{result.answer.summary}</p>
        </section>

        <section className="panel">
          <h3>实现步骤摘要</h3>
          <ul className="list">
            {result.answer.plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>建议改动</h3>
          <ul className="list">
            {result.answer.proposedChanges.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {result.answer.patchProposal ? (
          <PatchPreview proposal={result.answer.patchProposal} />
        ) : null}

        {result.rawText ? (
          <section className="panel">
            <h3>模型原始输出</h3>
            <pre className="code-block">{result.rawText}</pre>
          </section>
        ) : null}
      </div>

      <aside>
        <section className="panel">
          <h3>Agent Trace</h3>
          <ul className="list">
            {result.steps.map((step) => (
              <li key={`${step.title}-${step.startedAt}`}>
                <div className="step-head">
                  <span className="step-title">{step.title}</span>
                  {step.kind ? <span className="step-kind">{step.kind}</span> : null}
                </div>
                <span className="step-meta">{step.detail}</span>
                {step.toolInput ? (
                  <pre className="trace-code">{formatJson(step.toolInput)}</pre>
                ) : null}
                {step.toolOutput ? <pre className="trace-code">{step.toolOutput}</pre> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>相关文件</h3>
          <div className="tag-row">
            {result.answer.filesToInspect.map((file) => (
              <span className="tag tag--neutral" key={file}>
                {file}
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>风险点</h3>
          <ul className="list">
            {result.answer.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h3>下一步</h3>
          <ul className="list">
            {result.answer.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function PatchPreview({ proposal }: { proposal: PatchProposal }) {
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<PatchApplyResult | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  async function applyPatch() {
    const confirmed = window.confirm(
      `确认应用这个补丁吗？将写入 ${proposal.files.length} 个文件。`
    );

    if (!confirmed) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const response = await fetch("/api/patch/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ patchProposal: proposal })
      });

      const payload = (await response.json()) as PatchApplyResult | { error?: string };

      if ("ok" in payload) {
        setApplyResult(payload);
        return;
      }

      throw new Error(payload.error ?? "Patch apply failed");
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : "Patch apply failed");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="panel">
      <div className="patch-heading">
        <div>
          <h3>补丁预览</h3>
          <p className="summary">{proposal.summary}</p>
        </div>
        <button
          className="primary"
          type="button"
          onClick={applyPatch}
          disabled={isApplying || applyResult?.ok}
        >
          {isApplying ? "应用中" : applyResult?.ok ? "已应用" : "应用补丁"}
        </button>
      </div>

      <div className="patch-files">
        {proposal.files.map((file) => (
          <article className="patch-file" key={`${file.action}-${file.path}`}>
            <div className="patch-file__head">
              <span className="tag tag--neutral">{file.action}</span>
              <strong>{file.path}</strong>
            </div>
            {file.explanation ? <p className="step-meta">{file.explanation}</p> : null}
            <pre className="code-block">{previewContent(file.content)}</pre>
          </article>
        ))}
      </div>

      {applyResult ? (
        <div className={applyResult.ok ? "apply-result apply-result--ok" : "apply-result"}>
          <strong>{applyResult.ok ? "补丁已应用" : "补丁未应用"}</strong>
          {applyResult.appliedFiles.length > 0 ? (
            <p>{applyResult.appliedFiles.join(", ")}</p>
          ) : null}
          {applyResult.errors.length > 0 ? <p>{applyResult.errors.join("; ")}</p> : null}
        </div>
      ) : null}

      {applyError ? <div className="apply-result">{applyError}</div> : null}
    </section>
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function previewContent(content: string) {
  return content.length > 6000 ? `${content.slice(0, 6000)}\n...` : content;
}
