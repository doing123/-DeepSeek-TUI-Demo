# Patch Diff Preview

V0.15 adds a server-side diff preview before patch application. The model can
still only propose structured full-file `create` or `replace` actions; local code
turns that proposal into a visible review summary.

## Runtime Flow

1. DeepSeek returns a `final` answer with `patchProposal`.
2. The runner applies local tool policy first.
3. If the proposal is still allowed, the runner calls `previewPatchProposal`.
4. The preview validates the same paths and actions used by patch application.
5. Existing file content is read server-side and compared with proposed content.
6. The run result includes additions, deletions, risk tags, preview lines, and
   validation warnings.
7. Web, CLI, and TUI render the preview before any write happens.

## Preview Shape

The run result stores:

- total added and removed line counts
- per-file added and removed line counts
- per-file risk tags, such as `creates-new-file`, `replaces-full-file`,
  `large-change`, or `large-deletion`
- a compact textual preview with context lines
- path/action validation errors, if any

For normal-sized changed regions, the preview uses an exact line-level diff over
the changed window. Very large regions fall back to a conservative delete/add
summary so review stays fast.

## Safety Boundary

Diff preview does not apply patches. Actual writes still require explicit human
approval through the Web button, CLI `--apply`, or TUI `a` key.

The preview uses the same path validation as patch application, so the user can
spot path/action problems before approving writes.
