#!/bin/bash

set -euo pipefail

# Usage check
if [ $# -lt 1 ] || [ $# -gt 3 ]; then
  echo "Usage: $0 <input.mkv> [start_seconds] [end_seconds]"
  echo "  start_seconds: optional, start time in seconds (default: 0)"
  echo "  end_seconds:   optional, end time in seconds (default: end of file)"
  echo ""
  echo "Outputs two files:"
  echo "  <input>.webm - optimized for web embedding"
  echo "  <input>.gif  - high-quality GIF for HackMD"
  exit 1
fi

INPUT="$1"
START="${2:-}"
END="${3:-}"

# Check input file exists and is readable
if [ ! -f "$INPUT" ]; then
  echo "Error: file '$INPUT' does not exist." >&2
  exit 1
fi

if [ ! -r "$INPUT" ]; then
  echo "Error: file '$INPUT' is not readable." >&2
  exit 1
fi

# Validate start/end are non-negative numbers if provided
number_re='^[0-9]+([.][0-9]+)?$'

if [ -n "$START" ] && ! [[ "$START" =~ $number_re ]]; then
  echo "Error: start_seconds must be a non-negative number, got '$START'." >&2
  exit 1
fi

if [ -n "$END" ] && ! [[ "$END" =~ $number_re ]]; then
  echo "Error: end_seconds must be a non-negative number, got '$END'." >&2
  exit 1
fi

# If both provided, ensure end > start
if [ -n "$START" ] && [ -n "$END" ]; then
  if (( $(echo "$END <= $START" | bc -l) )); then
    echo "Error: end_seconds ($END) must be greater than start_seconds ($START)." >&2
    exit 1
  fi
fi

# Build trim args (input seeking — must come before -i)
TRIM_ARGS=()
if [ -n "$START" ]; then
  TRIM_ARGS+=(-ss "$START")
fi
if [ -n "$END" ]; then
  TRIM_ARGS+=(-to "$END")
fi

# Derive output filenames from input
BASENAME="$(basename "$INPUT")"
STEM="${BASENAME%.*}"
WEBM_OUT="${STEM}.webm"
GIF_OUT="${STEM}.gif"
PALETTE_TMP="$(mktemp --suffix=.png)"

# Cleanup palette on exit
trap 'rm -f "$PALETTE_TMP"' EXIT

# Confirm overwrite if either output exists
for f in "$WEBM_OUT" "$GIF_OUT"; do
  if [ -e "$f" ]; then
    read -r -p "Output '$f' exists. Overwrite both outputs? [y/N] " reply
    if [[ ! "$reply" =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
    break
  fi
done

# === Pass 1: WebM (optimized for web) ===
echo ""
echo "[1/3] Encoding WebM: $WEBM_OUT"
ffmpeg -y -hide_banner -loglevel warning -stats \
  "${TRIM_ARGS[@]}" -i "$INPUT" \
  -c:v libvpx-vp9 \
  -crf 32 \
  -b:v 0 \
  -pix_fmt yuv420p \
  -vf "scale=1280:-2:flags=lanczos,fps=30" \
  -row-mt 1 \
  -tile-columns 2 \
  -threads 4 \
  -an \
  "$WEBM_OUT"

# === Pass 2: Generate palette for GIF ===
echo ""
echo "[2/3] Generating GIF palette"
ffmpeg -y -hide_banner -loglevel warning \
  "${TRIM_ARGS[@]}" -i "$INPUT" \
  -vf "fps=15,scale=800:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$PALETTE_TMP"

# === Pass 3: Build GIF using palette ===
echo ""
echo "[3/3] Encoding GIF: $GIF_OUT"
ffmpeg -y -hide_banner -loglevel warning -stats \
  "${TRIM_ARGS[@]}" -i "$INPUT" \
  -i "$PALETTE_TMP" \
  -lavfi "fps=15,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
  "$GIF_OUT"

# Report sizes
echo ""
echo "Done."
echo "  WebM: $WEBM_OUT ($(du -h "$WEBM_OUT" | cut -f1))"
echo "  GIF:  $GIF_OUT ($(du -h "$GIF_OUT" | cut -f1))"
