"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AgentRunEvent,
  AgentRunRecord,
  AgentRunResult,
  AgentRunSummary,
  PatchApplyResult,
  PatchProposal,
  ValidationCommandName,
  ValidationRunResult
} from "@/lib/agent/types";

const starterGoals = [
  "阅读当前仓库，告诉我下一步最小可实现的 coding-agent 功能。",
  "为这个项目规划 V0.2：如何从只读建议升级到安全写文件。",
  "检查当前 Next/TS 项目结构，指出哪里还不利于学习 agent 开发。"
];

const defaultGoal =
  "我想学习如何做一个简易 agent 编码工具。请先扫描仓库，给出当前架构理解、下一步实现建议和风险点。";

// Main learning workbench: collects goals, runs the server-side agent, and
// displays the trace/result shape that a future TUI can reuse.
export function AgentWorkbench() {
  const [goal, setGoal] = useState(defaultGoal);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AgentRunRecord | null>(null);
  const [resumeRun, setResumeRun] = useState<AgentRunSummary | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentRunEvent[]>([]);
  const [streamText, setStreamText] = useState("");
  const [recentRuns, setRecentRuns] = useState<AgentRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const canRun = useMemo(() => goal.trim().length > 0 && !isRunning, [goal, isRunning]);

  useEffect(() => {
    void loadRecentRuns();
  }, []);

  async function loadRecentRuns() {
    const response = await fetch("/api/runs", {
      cache: "no-store"
    });
    const payload = (await response.json()) as { runs?: AgentRunSummary[] };
    setRecentRuns(payload.runs ?? []);
  }

  async function loadRunRecord(runId: string) {
    const response = await fetch(`/api/runs?id=${encodeURIComponent(runId)}`, {
      cache: "no-store"
    });
    const record = (await response.json()) as AgentRunRecord | { error?: string };

    if (!("result" in record)) {
      throw new Error(record.error ?? "Run record not found");
    }

    setSelectedRecord(record);
    setResult(record.result);
    setResumeRun(null);
    setLiveEvents([]);
    setStreamText("");
    setError(null);
  }

  function continueRun(run: AgentRunSummary) {
    setResumeRun(run);
    setGoal(`继续上一轮任务：${run.goal}\n\n本轮目标：`);
    setSelectedRecord(null);
    setLiveEvents([]);
    setStreamText("");
    setError(null);
  }

  async function handleValidationComplete(runId?: string) {
    await loadRecentRuns();

    if (runId && selectedRecord?.id === runId) {
      await loadRunRecord(runId);
    }
  }

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canRun) {
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);
    setSelectedRecord(null);
    setLiveEvents([]);
    setStreamText("");

    try {
      const response = await fetch("/api/agent/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          goal,
          ...(resumeRun ? { resumeRunId: resumeRun.id } : {})
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await consumeAgentEventStream(response, {
        onEvent: (event) => {
          if (event.type === "model_token") {
            setStreamText((current) => `${current}${event.token}`);
            return;
          }

          setLiveEvents((current) => [...current, event].slice(-30));

          if (event.type === "run_completed") {
            setResult(event.result);
          }
        }
      });
      setResumeRun(null);
      await loadRecentRuns();
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
          {resumeRun ? (
            <div className="resume-banner">
              <span>续接：{resumeRun.title}</span>
              <button className="secondary" type="button" onClick={() => setResumeRun(null)}>
                清除
              </button>
            </div>
          ) : null}

          <div className="actions">
            <button className="primary" type="submit" disabled={!canRun}>
              {isRunning ? "运行中" : "运行 Agent"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setGoal(defaultGoal);
                setResumeRun(null);
              }}
            >
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
              onClick={() => {
                setGoal(starterGoal);
                setResumeRun(null);
              }}
            >
              {starterGoal}
            </button>
          ))}
        </section>

        <RecentRunsPanel
          runs={recentRuns}
          onSelectRun={loadRunRecord}
          onContinueRun={continueRun}
        />

        <div className="status">
          DeepSeek key 通过 <code>DEEPSEEK_API_KEY</code> 读取；没有 key 时会返回本地离线结果。
        </div>

        <ValidationPanel runId={result?.id} onValidationComplete={handleValidationComplete} />
      </aside>

      <section className="workspace">
        {error ? (
          <div className="panel error">{error}</div>
        ) : result ? (
          <AgentResultView result={result} record={selectedRecord} />
        ) : isRunning || liveEvents.length > 0 || streamText ? (
          <LiveRunView events={liveEvents} streamText={streamText} />
        ) : (
          <div className="empty">
            <p>输入任务后运行，右侧会显示 agent 的扫描步骤、建议和后续动作。</p>
          </div>
        )}
      </section>
    </main>
  );
}

function LiveRunView({
  events,
  streamText
}: {
  events: AgentRunEvent[];
  streamText: string;
}) {
  return (
    <div className="output-grid">
      <section className="panel live-run">
        <h2>实时运行</h2>
        <ul className="list">
          {events.map((event, index) => (
            <li key={`${event.type}-${index}`}>
              <span className="step-title">{formatLiveEventTitle(event)}</span>
              <span className="step-meta">{formatLiveEventDetail(event)}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside>
        <section className="panel">
          <h3>模型流</h3>
          <pre className="live-token-stream">{streamText || "等待模型输出..."}</pre>
        </section>
      </aside>
    </div>
  );
}

function formatLiveEventTitle(event: AgentRunEvent) {
  if (event.type === "run_started") {
    return "开始运行";
  }

  if (event.type === "step_started" || event.type === "step_completed") {
    return event.step.title;
  }

  if (event.type === "model_stream_started") {
    return "模型流开始";
  }

  if (event.type === "model_stream_completed") {
    return "模型流完成";
  }

  if (event.type === "tool_call") {
    return `工具调用：${event.call.name}`;
  }

  if (event.type === "run_completed") {
    return "运行完成";
  }

  return "模型输出";
}

function formatLiveEventDetail(event: AgentRunEvent) {
  if (event.type === "run_started") {
    return event.resumeFromRunId
      ? `续接 ${event.resumeFromRunId}`
      : event.goal;
  }

  if (event.type === "step_started" || event.type === "step_completed") {
    return event.step.detail;
  }

  if (event.type === "model_stream_started") {
    return `${event.model} · turn ${event.turn}`;
  }

  if (event.type === "model_stream_completed") {
    return `${event.model} · ${event.contentLength} chars`;
  }

  if (event.type === "tool_call") {
    return JSON.stringify(event.call.input);
  }

  if (event.type === "run_completed") {
    return event.result.id;
  }

  return `${event.token.length} chars`;
}

function RecentRunsPanel({
  runs,
  onSelectRun,
  onContinueRun
}: {
  runs: AgentRunSummary[];
  onSelectRun: (runId: string) => Promise<void>;
  onContinueRun: (run: AgentRunSummary) => void;
}) {
  return (
    <section className="recent-runs" aria-label="最近运行">
      <div className="section-title">最近运行</div>
      {runs.length === 0 ? (
        <p className="recent-runs__empty">还没有保存的运行记录。</p>
      ) : (
        <div className="recent-runs__list">
          {runs.map((run) => (
            <article className="recent-run" key={run.id}>
              <button
                className="recent-run__main"
                type="button"
                onClick={() => void onSelectRun(run.id)}
              >
                <strong>{run.title}</strong>
                <span>{run.goal}</span>
                <small>
                  {run.mode} · {run.toolCallCount} tools · {run.validationCount} checks
                </small>
              </button>
              <button
                className="recent-run__continue"
                type="button"
                onClick={() => onContinueRun(run)}
              >
                继续
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AgentResultView({
  result,
  record
}: {
  result: AgentRunResult;
  record: AgentRunRecord | null;
}) {
  return (
    <div className="output-grid">
      <div>
        <section className="panel">
          <div className="tag-row" aria-label="运行信息">
            <span className={result.mode === "deepseek" ? "tag tag--ok" : "tag tag--warn"}>
              {result.mode}
            </span>
            <span className="tag tag--neutral">{result.model}</span>
            {result.resumeFromRunId ? (
              <span className="tag tag--neutral">continued</span>
            ) : null}
            <span className="tag tag--neutral">{result.workspace.fileCount} files</span>
            {result.contextBudget ? (
              <span className="tag tag--neutral">
                budget {result.contextBudget.maxWorkspaceFiles} files
              </span>
            ) : null}
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

        {record?.patchProposalMeta ? (
          <section className="panel">
            <h3>补丁元信息</h3>
            <p className="summary">{record.patchProposalMeta.summary}</p>
            <div className="tag-row">
              {record.patchProposalMeta.files.map((file) => (
                <span className="tag tag--neutral" key={`${file.action}-${file.path}`}>
                  {file.action}: {file.path}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {record?.validations.length ? (
          <section className="panel">
            <h3>验证历史</h3>
            <ul className="list">
              {record.validations.map((validation) => (
                <li key={`${validation.command}-${validation.startedAt}`}>
                  <span className="step-title">{validation.displayCommand}</span>
                  <span className="step-meta">
                    {validation.ok ? "通过" : "失败"} · {validation.durationMs}ms
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

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

// Human approval boundary for writes. The model can propose file changes, but
// this component requires a user confirmation before calling the apply API.
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

// Manual validation commands mirror real coding-agent workflows: apply a patch,
// then run a known verification command and inspect the output.
function ValidationPanel({
  runId,
  onValidationComplete
}: {
  runId?: string;
  onValidationComplete: (runId?: string) => Promise<void>;
}) {
  const [isRunning, setIsRunning] = useState<ValidationCommandName | null>(null);
  const [result, setResult] = useState<ValidationRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runValidation(command: ValidationCommandName) {
    setIsRunning(command);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ command, runId })
      });

      const payload = (await response.json()) as ValidationRunResult | { error?: string };

      if ("command" in payload) {
        setResult(payload);
        await onValidationComplete(runId);
        return;
      }

      throw new Error(payload.error ?? "Validation failed");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Validation failed");
    } finally {
      setIsRunning(null);
    }
  }

  return (
    <section className="validation-panel" aria-label="验证命令">
      <div className="section-title">验证</div>
      <div className="actions">
        <button
          className="secondary"
          type="button"
          onClick={() => runValidation("typecheck")}
          disabled={Boolean(isRunning)}
        >
          {isRunning === "typecheck" ? "检查中" : "Typecheck"}
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => runValidation("build")}
          disabled={Boolean(isRunning)}
        >
          {isRunning === "build" ? "构建中" : "Build"}
        </button>
      </div>

      {result ? (
        <div className={result.ok ? "validation-result validation-result--ok" : "validation-result"}>
          <strong>{result.displayCommand}</strong>
          <span>{result.ok ? "通过" : `失败 (${result.exitCode ?? "unknown"})`}</span>
          <pre>{formatValidationOutput(result)}</pre>
        </div>
      ) : null}

      {error ? <div className="validation-result">{error}</div> : null}
    </section>
  );
}

async function consumeAgentEventStream(
  response: Response,
  handlers: {
    onEvent: (event: AgentRunEvent) => void;
  }
) {
  if (!response.body) {
    throw new Error("Agent stream response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      handleSseFrame(frame, handlers);
    }
  }

  if (buffer.trim()) {
    handleSseFrame(buffer, handlers);
  }
}

function handleSseFrame(
  frame: string,
  handlers: {
    onEvent: (event: AgentRunEvent) => void;
  }
) {
  const parsed = parseSseFrame(frame);

  if (!parsed) {
    return;
  }

  if (parsed.event === "agent_event") {
    handlers.onEvent(parsed.data as AgentRunEvent);
    return;
  }

  if (parsed.event === "error") {
    const payload = parsed.data as { error?: string };
    throw new Error(payload.error ?? "Agent stream failed");
  }
}

function parseSseFrame(frame: string) {
  const lines = frame.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  return {
    event,
    data: JSON.parse(dataLines.join("\n")) as unknown
  };
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Agent run failed";
  } catch {
    return "Agent run failed";
  }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function previewContent(content: string) {
  return content.length > 6000 ? `${content.slice(0, 6000)}\n...` : content;
}

function formatValidationOutput(result: ValidationRunResult) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return output || `completed in ${result.durationMs}ms`;
}
