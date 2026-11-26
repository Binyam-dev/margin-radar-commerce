#!/usr/bin/env bash
set -euo pipefail
cd /home/binyam/margin-radar-commerce
set -a
source /home/binyam/.config/margin-radar/cj.env
set +a
mkdir -p /home/binyam/.local/share/margin-radar
flock -n /home/binyam/.local/share/margin-radar/scan.lock timeout 300 node integrations/margin-radar/run.mjs --once >> /home/binyam/.local/share/margin-radar/scan.log 2>&1
