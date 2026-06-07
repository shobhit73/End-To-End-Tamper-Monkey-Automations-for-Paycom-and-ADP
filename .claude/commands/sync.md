---
description: Pull latest main and create a fresh feature branch to start new work
allowed-tools: Bash, Read, Edit
argument-hint: <feature-branch-name>
---

You are starting a new work session for the user. The goal: get `main` up to date with `origin/main`, then create a fresh feature branch off of it so the user never commits directly to `main`. Multiple developers (Shobhit and Rohit) share this repo, so you must NEVER clobber either side's work.

The branch name the user provided is: `$ARGUMENTS` (may be empty).

Follow these steps strictly and report each one to the user as you go. Stop and ask if anything looks unexpected.

## Steps

1. **Verify location**
   - Run `git rev-parse --show-toplevel` to confirm you're inside the repo.
   - Run `git branch --show-current` and `git status --short` and `git config user.name` and `git config user.email` in parallel.

2. **Decide the new branch name**
   - If `$ARGUMENTS` is non-empty, use it as the branch slug. Sanitize it: lowercase, replace spaces and `_` with `-`, strip anything that isn't `[a-z0-9-/]`.
   - If `$ARGUMENTS` is empty, STOP and ask the user: "What should I name this feature branch? (e.g. `paycom-login-fix`)" — do NOT auto-generate a name.
   - Derive a username prefix from `git config user.email` (the part before `@`, lowercased, non-alphanumerics replaced with `-`). Fall back to `git config user.name` if email is empty.
   - Final branch name: `<username>/<slug>` (e.g. `shobhit-sharma/paycom-login-fix`).
   - Check the branch doesn't already exist locally (`git rev-parse --verify <name>`) or on remote (`git ls-remote --exit-code --heads origin <name>`). If it exists, ask the user whether to pick a different name or check out the existing one.

3. **Snapshot and stash any uncommitted work on current branch**
   - If `git status --short` is non-empty:
     - Tell the user what's modified/untracked/staged.
     - Run `git stash push -u -m "auto-sync-stash-$(date +%Y%m%d-%H%M%S)"`.
     - Remember that a stash was created.
   - If working tree is clean, skip stashing.

4. **Switch to main and pull**
   - If current branch is not `main`, run `git checkout main`.
   - Run `git fetch origin main`.
   - Run `git rev-list --left-right --count main...origin/main` to see divergence.
   - If behind == 0: nothing to pull.
   - If ahead == 0 and behind > 0: `git merge --ff-only origin/main`.
   - If main has diverged (ahead > 0 AND behind > 0): STOP and tell the user — `main` should never have local-only commits in this workflow, this means someone committed directly to main. Ask them how to proceed; do NOT auto-rebase main.
   - If pull fails: STOP, show the error, ask the user.

5. **Create the feature branch off of fresh main**
   - Run `git checkout -b <final branch name>`.
   - Confirm with `git branch --show-current`.

6. **Restore the stash on the new branch**
   - If you created a stash in step 3, run `git stash pop`.
   - If `stash pop` produces conflicts, STOP — report the conflicted files. Do not drop the stash.

7. **Final report**
   - Run `git status` and `git log --oneline -5` in parallel.
   - Tell the user:
     - The new branch name (so they can share it with Rohit if needed).
     - How many commits were pulled into main from origin (author + subject lines).
     - Whether their stash was reapplied cleanly.
   - Remind them: "When you're done, run `/merge` to push and merge this branch into main."

## Hard rules
- NEVER run `git reset --hard`, `git checkout .`, `git clean -fd`, or `git push --force`.
- NEVER drop a stash unless `git stash pop` succeeded cleanly.
- NEVER rebase or rewrite `main`.
- NEVER auto-generate a branch name without asking the user.
- If unsure at any step, STOP and ask the user.
