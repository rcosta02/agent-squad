#!/bin/bash
# Copies whisper-cli and its dylibs from Homebrew into resources/whisper/ with relative install names,
# so the packaged app runs transcription without the user installing anything.
set -euo pipefail
OUT="$(dirname "$0")/../resources/whisper"
WC="$(brew --prefix whisper-cpp)"; GG="$(brew --prefix ggml)"; OMP="$(brew --prefix libomp)"
rm -rf "$OUT"; mkdir -p "$OUT"
cp "$WC/bin/whisper-cli" "$OUT/"
cp "$WC/lib/libwhisper.1.dylib" "$GG/lib/libggml.0.dylib" "$GG/lib/libggml-base.0.dylib" "$OMP/lib/libomp.dylib" "$OUT/"
chmod u+w "$OUT"/*
for f in "$OUT"/*; do
  name="$(basename "$f")"
  [[ "$name" == *.dylib ]] && install_name_tool -id "@rpath/$name" "$f" 2>/dev/null
  # rewrite every absolute Homebrew reference to @rpath/<basename>
  otool -L "$f" | awk 'NR>1 {print $1}' | grep -E '^/opt/homebrew|^@rpath' | while read -r dep; do
    install_name_tool -change "$dep" "@rpath/$(basename "$dep")" "$f" 2>/dev/null || true
  done
  install_name_tool -add_rpath "@loader_path" "$f" 2>/dev/null || true
  codesign --force --sign - "$f" >/dev/null 2>&1 || true
done
"$OUT/whisper-cli" --help >/dev/null 2>&1 || { echo "bundled whisper-cli failed to start"; exit 1; }
echo "bundled: $(ls "$OUT" | tr '\n' ' ')"
