#!/usr/bin/env bash
# 生成面向使用者的分发压缩包（本地与 CI 通用）。
#
# 用法：
#   ./deploy/make-bundle.sh <镜像地址前缀> <版本>
#   例：./deploy/make-bundle.sh ghcr.io/acme/bidguard v0.1.0
#
# 产物：dist/bidguard-<版本>.tar.gz
#   内含使用者启动所需的全部文件（一体化 compose + 内置库初始化 + 网关配置 + 密钥脚本），
#   无需本地源码与 Node 环境，仅依赖 Docker / Docker Compose。
set -euo pipefail

IMAGE_PREFIX="${1:?用法: make-bundle.sh <镜像地址前缀> <版本>}"
VERSION="${2:?用法: make-bundle.sh <镜像地址前缀> <版本>}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist/bidguard-$VERSION"
BUNDLE="$ROOT/dist/bidguard-$VERSION.tar.gz"

rm -rf "$OUT_DIR" "$BUNDLE"
mkdir -p "$OUT_DIR/deploy/init" "$OUT_DIR/supabase/migrations"

# 1) 使用者版 compose：
#    - 去掉 build 段（无需源码构建）
#    - 默认镜像指向本次发布的镜像，接收方无需再改 BIDGUARD_IMAGE
awk -v repl="${IMAGE_PREFIX}:${VERSION}" '
  /^[[:space:]]*build:[[:space:]]*\.$/ { next }
  /BIDGUARD_IMAGE:-bidguard:local/ { sub(/bidguard:local/, repl) }
  { print }
' "$ROOT/docker-compose.yml" > "$OUT_DIR/docker-compose.yml"

# 2) 复制运行所需文件
cp "$ROOT/.env.example" "$OUT_DIR/.env.example"
cp "$ROOT/README.md" "$OUT_DIR/README.md"
cp "$ROOT/RELEASE.md" "$OUT_DIR/RELEASE.md"
cp "$ROOT/deploy/gen-keys.mjs" "$OUT_DIR/deploy/gen-keys.mjs"
cp "$ROOT/deploy/nginx.conf" "$OUT_DIR/deploy/nginx.conf"
cp "$ROOT/deploy/init/00-roles.sql" "$OUT_DIR/deploy/init/00-roles.sql"
cp "$ROOT"/supabase/migrations/*.sql "$OUT_DIR/supabase/migrations/"

# 3) 打包
tar -czf "$BUNDLE" -C "$ROOT/dist" "bidguard-$VERSION"

echo "已生成分发包：$BUNDLE"
