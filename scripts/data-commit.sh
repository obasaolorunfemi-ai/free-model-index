#!/usr/bin/env bash
# Commits whatever changed in the data working tree and pushes it to the `data` branch. If another run pushed first, it rebases and tries again.
#   scripts/data-commit.sh data-repo "probes"
set -euo pipefail
dir="${1:-data-repo}"
what="${2:-data}"
remote="${FMI_REMOTE:-origin}"
cd "$dir"

git add -A
if git diff --cached --quiet; then
  echo "nothing new to commit"
  exit 0
fi

git -c user.name="${FMI_GIT_NAME:-free-model-index[bot]}" -c user.email="${FMI_GIT_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}" \
  commit --quiet -m "data: ${what} $(date -u +%Y-%m-%dT%H:%MZ)"

for attempt in 1 2 3 4; do
  if git push --quiet "$remote" HEAD:data; then
    echo "pushed to data (attempt $attempt)"
    exit 0
  fi
  echo "push refused (someone else pushed first); rebasing, attempt $attempt"
  git fetch --quiet "$remote" data
  git -c user.name=bot -c user.email=bot@example.invalid rebase --quiet FETCH_HEAD
done
echo "could not push the data after 4 attempts" >&2
exit 1
