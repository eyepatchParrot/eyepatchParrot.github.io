#!/usr/bin/env bash
set -ex
find _posts -type f | LC_ALL=C sort -r | xargs cat | tee index.md | tail
