#!/usr/bin/env bash
# 构建（并可选推送）BidGuard 应用镜像，用于自托管分发。
#
# 用法：
#   ./deploy/build-and-push.sh                                # 仅本地构建，标签 bidguard:local
#   ./deploy/build-and-push.sh ghcr.io/<账号>/bidguard:latest # 构建并推送镜像到仓库
set -euo pipefail

IMAGE="${1:-bidguard:local}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 构建镜像：$IMAGE"
docker build -t "$IMAGE" "$ROOT"

if [[ "$IMAGE" != "bidguard:local" ]]; then
  echo "==> 推送镜像：$IMAGE"
  docker push "$IMAGE"
  echo "==> 完成。请把接收方 .env 中的 BIDGUARD_IMAGE 设为：$IMAGE"
else
  echo "==> 本地构建完成。启动：docker compose up -d"
fi
