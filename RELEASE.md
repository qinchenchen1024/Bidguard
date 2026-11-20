# BidGuard 标智核 · 发布与使用说明

面向两类读者：

- **发布者**：把本工具打包、构建镜像并对外发布的人（第一节）
- **接收者**：拿到分发包或镜像地址后自行部署使用的人（第二节）

> **为什么自托管**：本项目需处理百 MB 级上传文件与长耗时校验任务，超出 Vercel 等
> Serverless 平台的能力边界（请求体 4.5MB、函数时长受限），因此设计为
> 本机 / VPS / 内网自托管。

---

## 一、发布前准备工作（发布者）

### 1. 环境要求

- Docker（含 Buildx）
- Docker Compose v2（`docker compose` 子命令）
- Node.js 18+（仅用于生成密钥、本地构建脚本）
- 一个启用了 Actions 的 GitHub 仓库；发布镜像需 ghcr.io 写权限

### 2. 配置本地环境变量

在项目根目录生成含随机密钥的 `.env`：

```bash
node deploy/gen-keys.mjs > .env
```

会自动生成 `POSTGRES_PASSWORD`、`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY`，
并写好默认 Ollama 配置。也可手动 `cp .env.example .env` 后填写
（`JWT_SECRET` 与两个 KEY 必须配套）。

> 该文件已在 `.gitignore` 中忽略，**切勿提交或外泄**；改动 `.env` 后需重启服务才生效。

### 3. 本地构建与自测

```bash
./deploy/build-and-push.sh                          # 仅本地构建，标签 bidguard:local
docker compose up -d --build                        # 启动全部服务
docker compose exec ollama ollama pull qwen2.5:7b   # 首次拉取本地模型
```

浏览器打开 http://localhost:3000，用「新建校验项目 → 上传文件 → 智能校验」跑通后再发布。

### 4. 发布方式 A：手动推送镜像

```bash
./deploy/build-and-push.sh ghcr.io/<账号>/bidguard:latest
```

推送成功后，把镜像地址告知接收者，让其填入 `.env` 的 `BIDGUARD_IMAGE`。

### 5. 发布方式 B：GitHub Actions 自动发布（推荐）

流水线文件：`.github/workflows/release.yml`

- **打标签即触发**：

  ```bash
  git tag v0.1.0
  git push origin v0.1.0
  ```

- **或手动触发**：Actions → Release → Run workflow，填写版本号

流水线会自动完成：多架构（amd64 + arm64）构建 → 推送 `ghcr.io/<仓库>` →
生成 `dist/bidguard-<版本>.tar.gz` → 创建 Release 并附上该压缩包。

**首次使用前需设置两处**：

1. 仓库 `Settings → Actions → General → Workflow permissions` 选择
   **Read and write permissions**（否则无法创建 Release / 推镜像）。
2. 首次发布后，到仓库 **Packages** 页面把 ghcr 包可见性设为 **Public**，
   否则接收方拉取镜像需登录。

### 6. 本地手动生成分发包（可选）

```bash
./deploy/make-bundle.sh ghcr.io/<账号>/bidguard v0.1.0
# 产物：dist/bidguard-v0.1.0.tar.gz
```

脚本会自动去掉 compose 里的 `build:` 段，并把默认镜像替换为发布地址。

### 7. 发布前检查清单

- [ ] `.env` 未提交、密钥未外泄
- [ ] 生成密钥后 `docker compose config` 校验通过
- [ ] 流水线 YAML 与 `make-bundle.sh` 已通过验证
- [ ] Release 附件包含 `bidguard-<版本>.tar.gz`
- [ ] ghcr 包已设为 Public
- [ ] 发布/升级过程中不要执行 `docker compose down -v`（会删库）

---

## 二、接收者使用说明

### 1. 环境要求

- Docker Desktop（macOS / Windows）或 Docker Engine（Linux）
- Docker Compose v2
- **无需源码、无需 Node.js**

### 2. 方式 A：使用发布压缩包（推荐）

```bash
tar -xzf bidguard-v0.1.0.tar.gz
cd bidguard-v0.1.0

# 生成密钥与配置（本机无 Node 时，改为 cp .env.example .env 并手动填写四项）
node deploy/gen-keys.mjs > .env

docker compose up -d
```

> 分发包已把镜像地址预设为发布者提供的地址，**无需再改 `BIDGUARD_IMAGE`**。
> 请务必保留 `docker-compose.yml`、`.env`、`deploy/`、`supabase/migrations/`
> 这些文件——数据库首次启动要用到。

### 3. 方式 B：从镜像仓库手动部署

需要 `docker-compose.yml` 以及 `deploy/`、`supabase/migrations/` 目录。
在 `.env` 中至少设置以下五项：

```
BIDGUARD_IMAGE=ghcr.io/<账号>/bidguard:latest
POSTGRES_PASSWORD=<自定义密码>
JWT_SECRET=<随机串>
ANON_KEY=<JWT>
SERVICE_ROLE_KEY=<JWT>
```

可用 `node deploy/gen-keys.mjs > .env` 一步生成后，再追加 `BIDGUARD_IMAGE` 一行。
然后：

```bash
docker compose pull
docker compose up -d
```

### 4. 首次拉取本地模型

```bash
docker compose exec ollama ollama pull qwen2.5:7b
```

不拉取也能启动页面，但本地智能体需模型就绪后才能分析。

### 5. 打开与配置

- 打开 http://localhost:3000
- 若系统检测到尚未配置模型，会自动弹出「模型设置」引导（右上角亦可随时打开）
- 可选模型来源：
  - **本地 Ollama（默认，免费）**：`http://ollama:11434/v1`，模型 `qwen2.5:7b`
  - **DeepSeek**：`https://api.deepseek.com`，模型 `deepseek-chat`（需 API Key）
  - **OpenAI 或任意兼容端点**：填 Base URL + 模型 + API Key
- 客户端填写的 Key 仅存于浏览器 `localStorage`，不上传、不落库

### 6. 数据与运维

- 数据持久化在命名卷 `db-data`（数据库）与 `ollama-models`（模型）
- 停止：`docker compose stop`
- 更新镜像后重启：`docker compose pull && docker compose up -d`
- **切勿随意执行 `docker compose down -v`**，会连同数据库与模型一并删除
- 单文件上传上限由 `.env` 的 `MAX_UPLOAD_MB` 控制（默认 200）

### 7. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 拉取镜像报未授权 / 404 | 发布者未把 ghcr 包设为 Public，或标签不存在 |
| 网页报数据库连接 / 鉴权错误 | `.env` 中 `JWT_SECRET` 与 `ANON_KEY`/`SERVICE_ROLE_KEY` 不配套；或改完 `.env` 未重启 |
| 智能校验报 JSON 相关错误 | 所用模型不支持结构化 JSON 输出，改用支持 `response_format=json_object` 的模型（如 `deepseek-chat`，勿用 `deepseek-reasoner`） |
| 上传大文件失败 | 确认 `MAX_UPLOAD_MB`；本项目在自托管环境已放开至 200MB |
| 首次启动初始化报错 | 需保留 `deploy/init/` 与 `supabase/migrations/`；若数据卷已存在则不重跑初始化，可 `docker compose down -v` 后重建（会清空数据） |
