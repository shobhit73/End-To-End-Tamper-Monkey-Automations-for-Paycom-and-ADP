---
description: Commit feature-branch work, push it, then fast-forward merge it into main and push main
allowed-tools: Bash, Read, Edit
argument-hint: [optional commit message]
---

You are finishing a work session for the user. They've been working on a feature branch created by `/sync`. Your job: commit their changes, push the feature branch, then merge it into `main` via a fast-forward and push `main`. Multiple developers share this repo, so you must rebase onto the latest `origin/main` before merging — and NEVER force-push.

The optional commit message is: `$ARGUMENTS` (may be empty — if empty, you'll draft one).

Follow these steps strictly and report each one to the user. Stop and ask for guidance if anything looks unexpected.

## Steps

1. **Verify location & branch**
   - Run `git rev-parse --show-toplevel`, `git branch --show-current`, and `git status --short` in parallel.
   - If current branch is `main`, STOP and tell the user: "You're on `main` directly. Run `/sync <branch-name>` first to create a feature branch, then commit your work there." Do NOT continue.
   - Remember the current branch name as `<feature>`.

2. **Inspect changes**
   - Run `git diff --stat` and `git diff --stat --staged` in parallel.
   - If working tree is clean AND staging area is clean AND no local commits ahead of `origin/<feature>` (check with `git rev-list --count origin/<feature>..<feature>` if the remote ref exists, else treat as "all commits are new"), tell the user there's nothing to push and stop.

3. **Stage changes (only if there are uncommitted changes)**
   - List modified/untracked files to the user.
   - Stage explicitly: `git add <file> <file> ...`. Do NOT use `git add -A` / `git add .`.
   - Skip and warn on anything that looks like secrets (`.env`, credentials, tokens, keys). Ask before staging them.

4. **Commit (only if there are staged changes)**
   - If `$ARGUMENTS` is non-empty, use it as the commit message.
   - Otherwise draft a 1-line imperative-mood message focused on WHY, based on the diff. Show it to the user before committing.
   - Commit using a HEREDOC:
     ```
     git commit -m "$(cat <<'EOF'
     <message here>
     EOF
     )"
     ```
   - Do NOT add `Co-Authored-By` lines.
   - Do NOT use `--amend` or `--no-verify`.

5. **Rebase feature branch onto latest origin/main**
   - Run `git fetch origin main`.
   - Run `git rebase origin/main`.
   - If conflicts:
     - Run `git status` and list conflicted files.
     - STOP and ask the user to resolve. Remind them: after fixing, `git add <file>` then `git rebase --continue`. `git rebase --abort` is the safe escape hatch.
     - Do NOT auto-resolve.

6. **Push feature branch**
   - Run `git push -u origin <feature>`.
   - If rejected (someone else pushed to this branch — rare but possible), STOP and ask the user. Do NOT force-push.

7. **Fast-forward merge feature into main**
   - Run `git checkout main`.
   - Run `git pull --ff-only origin main`.
   - Run `git merge --ff-only <feature>`.
     - Because step 5 rebased `<feature>` onto `origin/main`, this MUST be a clean fast-forward.
     - If `--ff-only` fails, it means `origin/main` advanced again between steps 5 and 7. Go back to step 5 and retry, ONCE. If it still fails, STOP and ask the user.

8. **Push main**
   - Run `git push origin main`.
   - If rejected: someone pushed to main between your fetch and push. Run `git pull --ff-only origin main` then re-run step 7's `merge --ff-only <feature>` and push again. Retry ONCE total. If still rejected, STOP.

9. **Offer to delete the feature branch**
   - Ask the user: "Delete the feature branch `<feature>` locally and on origin? (recommended — it's already merged)"
   - If yes:
     - `git branch -d <feature>` (local — uses `-d` not `-D`, so it refuses if not merged; that's a safety feature).
     - `git push origin --delete <feature>` (remote).
   - If no, leave it.

10. **Final report**
    - Run `git status` and `git log --oneline -8` in parallel.
    - Tell the user:
      - The merged commit SHAs and subjects.
      - That `main` is pushed.
      - Whether the feature branch was deleted.

## Hard rules
- NEVER run `git push --force`, `git push -f`, or `git push --force-with-lease`.
- NEVER run `git reset --hard`, `git checkout .`, `git clean -fd`.
- NEVER use `git commit --amend` on already-pushed commits.
- NEVER skip hooks (`--no-verify`).
- NEVER stage with `git add -A` / `git add .`.
- NEVER auto-resolve merge/rebase conflicts.
- NEVER use a non-fast-forward merge (no merge commits on `main`).
- If unsure at any step, STOP and ask the user.
