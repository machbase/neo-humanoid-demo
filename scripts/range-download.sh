#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <url> <output> <total-bytes> [chunk-mb] [parallel]" >&2
  exit 2
fi

URL="$1"
OUT="$2"
TOTAL="$3"
CHUNK_MB="${4:-512}"
PARALLEL="${5:-8}"
CHUNK=$((CHUNK_MB * 1024 * 1024))
PART_DIR="${OUT}.parts"

mkdir -p "$PART_DIR"
touch "$OUT"

START=$(stat -c '%s' "$OUT")
if [ "$START" -ge "$TOTAL" ]; then
  echo "already complete: $OUT"
  exit 0
fi

echo "output=$OUT"
echo "current=$START total=$TOTAL chunk=$CHUNK parallel=$PARALLEL"

MANIFEST="$PART_DIR/manifest.tsv"
: > "$MANIFEST"

N=0
POS="$START"
while [ "$POS" -lt "$TOTAL" ]; do
  END=$((POS + CHUNK - 1))
  if [ "$END" -ge "$TOTAL" ]; then
    END=$((TOTAL - 1))
  fi
  PART=$(printf '%s/part-%06d' "$PART_DIR" "$N")
  SIZE=$((END - POS + 1))
  if [ -f "$PART" ] && [ "$(stat -c '%s' "$PART")" -eq "$SIZE" ]; then
    :
  else
    rm -f "$PART"
  fi
  printf '%06d\t%s\t%s\t%s\t%s\n' "$N" "$POS" "$END" "$SIZE" "$PART" >> "$MANIFEST"
  N=$((N + 1))
  POS=$((END + 1))
done

export URL

awk -F '\t' '{ if (system("[ -f \"" $5 "\" ]") != 0) print $0 }' "$MANIFEST" |
  xargs -P "$PARALLEL" -n 5 sh -c '
    idx="$0"; start="$1"; end="$2"; size="$3"; part="$4"
    echo "fetch part=$idx bytes=$start-$end"
    curl -L --fail --silent --show-error --range "$start-$end" "$URL" -o "$part"
    actual=$(stat -c "%s" "$part")
    if [ "$actual" -ne "$size" ]; then
      echo "size mismatch part=$idx expected=$size actual=$actual" >&2
      exit 1
    fi
  '

while IFS=$'\t' read -r idx start end size part; do
  actual=$(stat -c '%s' "$OUT")
  if [ "$actual" -ne "$start" ]; then
    echo "append offset mismatch part=$idx expected=$start actual=$actual" >&2
    exit 1
  fi
  cat "$part" >> "$OUT"
  echo "appended part=$idx size=$size"
done < "$MANIFEST"

FINAL=$(stat -c '%s' "$OUT")
if [ "$FINAL" -ne "$TOTAL" ]; then
  echo "download incomplete expected=$TOTAL actual=$FINAL" >&2
  exit 1
fi

echo "complete: $OUT"
