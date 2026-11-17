#!/usr/bin/env bash
# Собирает C++ программу и копирует бинарник в extension/bin/search
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$ROOT/bin/build"

mkdir -p "$BUILD"
(cd "$BUILD" && cmake -DCMAKE_BUILD_TYPE=Release .. && make)

mkdir -p "$ROOT/extension/bin"
install -m 755 "$BUILD/search" "$ROOT/extension/bin/search"

echo "Бинарник скопирован: $ROOT/extension/bin/search"