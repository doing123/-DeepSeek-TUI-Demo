import { execFile } from "child_process";
import type { ValidationCommandName, ValidationRunResult, ValidationTrigger } from "./types";

// Validation commands are intentionally fixed server-side.
// The model and browser can select a known command name, but cannot provide
// arbitrary shell text.
const VALIDATION_COMMANDS: Record<
  ValidationCommandName,
  {
    args: string[];
    displayCommand: string;
    timeoutMs: number;
  }
> = {
  typecheck: {
    args: ["run", "typecheck"],
    displayCommand: "npm run typecheck",
    timeoutMs: 90_000
  },
  build: {
    args: ["run", "build"],
    displayCommand: "npm run build",
    timeoutMs: 180_000
  }
};

export function isValidationCommandName(value: unknown): value is ValidationCommandName {
  return value === "typecheck" || value === "build";
}

export function isValidationTrigger(value: unknown): value is ValidationTrigger {
  return value === "manual" || value === "post_patch";
}

// Runs one whitelisted npm validation command without shell interpolation.
export async function runValidationCommand(
  workspaceRoot: string,
  command: ValidationCommandName,
  options: { trigger?: ValidationTrigger } = {}
): Promise<ValidationRunResult> {
  const startedAt = new Date();
  const definition = VALIDATION_COMMANDS[command];

  return new Promise((resolve) => {
    execFile(
      "npm",
      definition.args,
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          CI: "1"
        },
        timeout: definition.timeoutMs,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        const completedAt = new Date();
        const exitCode = readExitCode(error);

        resolve({
          ok: !error,
          command,
          trigger: options.trigger ?? "manual",
          displayCommand: definition.displayCommand,
          exitCode,
          stdout: trimOutput(stdout),
          stderr: trimOutput(stderr),
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs: completedAt.getTime() - startedAt.getTime()
        });
      }
    );
  });
}

function readExitCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return error ? 1 : 0;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : 1;
}

function trimOutput(value: string) {
  return value.length > 20_000 ? `${value.slice(-20_000)}\n...` : value;
}
