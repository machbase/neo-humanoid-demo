#!/usr/bin/env bash
set -euo pipefail

CATALOG="${1:-data/catalog/humanoid-category-tasks.json}"
DATA_ROOT="${2:-data/raw/humanoid-everyday}"
ARCHIVE_ROOT="${3:-$DATA_ROOT/archives}"
KEEP_NEW_ARCHIVES="${KEEP_NEW_ARCHIVES:-0}"
OVERWRITE="${OVERWRITE:-0}"
LIMIT="${LIMIT:-0}"
START_AT="${START_AT:-0}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 2
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "unzip is required" >&2
  exit 2
fi

mkdir -p "$DATA_ROOT" "$ARCHIVE_ROOT"

safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_'
}

archive_base_from_url() {
  node -e "const path=require('path'); const u=String(process.argv[1]||'').split('?')[0].split('#')[0]; console.log(path.basename(u, '.zip'));" "$1"
}

episode_exists_for_task() {
  local task="$1"
  local url="$2"
  local base
  base="$(archive_base_from_url "$url")"
  local candidates=(
    "$task"
    "$base"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -n "$candidate" ] && [ -d "$DATA_ROOT/$candidate" ]; then
      if find "$DATA_ROOT/$candidate" -maxdepth 5 -path '*/episode_*/data.json' -print -quit | grep -q .; then
        return 0
      fi
    fi
  done
  return 1
}

first_episode_prefix() {
  local zip="$1"
  unzip -Z1 "$zip" | awk -F/ '
    /(^|\/)episode_[0-9]+\/data\.json$/ {
      ep = "";
      for (i = 1; i <= NF; i++) if ($i ~ /^episode_[0-9]+$/) ep = $i;
      if (ep != "") print ep "\t" $0;
    }
  ' | sort -t '_' -k2,2n | head -1 | cut -f2- | sed 's#/data\.json$##'
}

extract_first_episode() {
  local zip="$1"
  local task="$2"
  local prefix
  prefix="$(first_episode_prefix "$zip")"
  if [ -z "$prefix" ]; then
    echo "no episode data.json in $zip" >&2
    return 1
  fi

  local tmp
  tmp="$DATA_ROOT/.extract-${task}-$$"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  unzip -q -o "$zip" "$prefix/*" -d "$tmp"

  local src
  src="$(find "$tmp" -path '*/episode_*/data.json' -print -quit | sed 's#/data\.json$##')"
  if [ -z "$src" ] || [ ! -d "$src" ]; then
    rm -rf "$tmp"
    echo "failed to locate extracted episode from $zip" >&2
    return 1
  fi

  local episode
  episode="$(basename "$src")"
  local target_parent="$DATA_ROOT/$task"
  local target="$target_parent/$episode"
  mkdir -p "$target_parent"
  if [ -e "$target" ] && [ "$OVERWRITE" != "1" ]; then
    echo "episode exists $target"
    rm -rf "$tmp"
    return 0
  fi
  rm -rf "$target"
  mv "$src" "$target"
  rm -rf "$tmp"
  echo "extracted $task/$episode"
}

node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
for (let i = 0; i < items.length; i++) {
  const item = items[i] || {};
  console.log([i, item.category || '', item.task || '', item.url || ''].join('\t'));
}
" "$CATALOG" | while IFS=$'\t' read -r idx category task url; do
  if [ -z "$task" ] || [ -z "$url" ]; then
    continue
  fi
  if [ "$idx" -lt "$START_AT" ]; then
    continue
  fi
  if [ "$LIMIT" -gt 0 ] && [ "$idx" -ge $((START_AT + LIMIT)) ]; then
    break
  fi

  if [ "$OVERWRITE" != "1" ] && episode_exists_for_task "$task" "$url"; then
    echo "skip existing episode [$idx] $category/$task"
    continue
  fi

  archive="$ARCHIVE_ROOT/$(safe_name "$task").zip"
  downloaded=0
  if [ ! -s "$archive" ] || [ "$OVERWRITE" = "1" ]; then
    echo "download [$idx] $category/$task"
    echo "target $archive"
    tmp_archive="${archive}.download"
    rm -f "$tmp_archive"
    curl -L --fail --retry 3 --retry-delay 5 --connect-timeout 30 -o "$tmp_archive" "$url"
    mv "$tmp_archive" "$archive"
    downloaded=1
  else
    echo "use existing archive [$idx] $archive"
  fi

  extract_first_episode "$archive" "$task"

  if [ "$downloaded" = "1" ] && [ "$KEEP_NEW_ARCHIVES" != "1" ]; then
    rm -f "$archive"
    echo "removed new archive $archive"
  fi
done
