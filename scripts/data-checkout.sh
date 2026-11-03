#!/usr/bin/env bash
# Puts the `data` branch in a second working tree (default ./data-repo), so a run can read and write the probe records beside the code.
# The first time there is no data branch: it is created empty (an orphan branch, sharing no history with the code).
set -euo pipefail
dir="${1:-data-repo}"
remote="${FMI_REMOTE:-origin}"

if git ls-remote --exit-code --heads "$remote" data >/dev/null 2>&1; then
  git fetch --quiet --depth=1 "$remote" data
  git worktree add --quiet -B data "$dir" FETCH_HEAD
  echo "data branch checked out in $dir"
else
  git worktree add --quiet --detach "$dir"
  git -C "$dir" checkout --quiet --orphan data
  git -C "$dir" rm -rf --quiet . >/dev/null 2>&1 || true
  echo "no data branch yet: started an empty one in $dir"
fi
