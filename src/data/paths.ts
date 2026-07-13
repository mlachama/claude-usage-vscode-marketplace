import * as os from "os";
import * as path from "path";

/** Expand a leading `~` and environment variables in a user-supplied path. */
export function expandPath(input: string): string {
  let p = input.trim();
  if (p.startsWith("~")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  p = p.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? "")
       .replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name) => process.env[name] ?? "");
  return path.normalize(p);
}

/**
 * Resolve the Claude data directory. Empty override → `~/.claude`.
 */
export function resolveClaudeDir(override: string | undefined): string {
  if (override && override.trim().length > 0) {
    return expandPath(override);
  }
  return path.join(os.homedir(), ".claude");
}

/** The projects directory that holds per-project session logs. */
export function resolveProjectsDir(claudeDir: string): string {
  return path.join(claudeDir, "projects");
}

/**
 * Best-effort de-sanitize of a project directory name for display when no cwd
 * is available in the file. This is lossy (a literal `-` is indistinguishable
 * from a path separator) and is only used as a fallback label.
 */
export function desanitizeProjectKey(key: string): string {
  // Windows drive form: "D--Projects-foo" → "D:\Projects\foo"
  const driveMatch = /^([A-Za-z])--(.*)$/.exec(key);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const rest = driveMatch[2].replace(/-/g, "\\");
    return `${drive}:\\${rest}`;
  }
  // POSIX form: leading dash means absolute path
  if (key.startsWith("-")) {
    return "/" + key.slice(1).replace(/-/g, "/");
  }
  return key.replace(/-/g, "/");
}

/** Human label for a resolved project path (its basename). */
export function projectLabelFromPath(projectPath: string): string {
  const base = path.basename(projectPath.replace(/[\\/]+$/, ""));
  return base.length > 0 ? base : projectPath;
}
