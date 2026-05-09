import { execFileSync } from "child_process";
import { existsSync } from "fs";

if (!existsSync(".git")) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "inherit"
  });
  console.log("Git hooks path set to .githooks");
} catch (error) {
  console.warn("Unable to configure git hooks automatically.");
  console.warn(error instanceof Error ? error.message : error);
}
