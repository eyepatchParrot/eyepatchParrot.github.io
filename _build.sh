#!/usr/bin/env bash
set -ex
find _posts -type f | LC_ALL=C sort | xargs cat | tee index.md | tail
