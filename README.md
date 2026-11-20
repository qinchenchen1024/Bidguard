# BidGuard 标智核

> 招标 / 投标文件智能校验平台 · AI-powered Tender & Bid Document Compliance Checker
>
> **中文** | [English](#english)

BidGuard 标智核是一套面向招投标场景的智能校验工具：上传招标与投标文件后，由大模型（LLM）
自动完成**完整性核验、条款合规性核验、投标响应性核验、雷同检测与串标嫌疑识别**，并生成可导出的
分析报告。它支持**自带密钥（BYOK）**与**本地免费智能体（Ollama）**，数据可完全不出本机。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始（Docker 一键部署）](#快速开始docker-一键部署)
- [配置智能体（大模型）](#配置智能体大模型)
- [使用流程](#使用流程)
- [环境变量](#环境变量)
- [数据与运维](#数据与运维)
- [常见问题](#常见问题)
- [发布与分发](#发布与分发)
- [许可证](#许可证)

---

## 功能特性

按固定顺序执行的五类校验：

1. **招标文件完整性核验** — 检查招标文件是否缺章少项（如缺投标人须知、评标办法、合同条款等）。
2. **条款合规性核验** — 对照现行法律法规（如《招标投标法》）与真实案例，判断招标条款是否违规。
3. **投标响应性核验** — 招标 ↔ 投标对照，包含两个层面：
   - **分条对比**：拆解为 Requirement–Response（要求–响应）对照表；
   - **整体逻辑性对比**：评估投标文件的整体叙述自洽性与逻辑性。
4. **雷同检测（投标 ↔ 投标）** — 采用确定性算法（字符 n-gram + 相似度），满足审计取证的非随机性要求。
5. **串标嫌疑识别** — 基于元数据与文本比对识别异常（如多家投标人共用联系方式等），引用法条与案例论证风险。

此外还提供：

- **法规案例检索**：智能体自动检索并引用相关法条与案例；
- **知识库自学习**：从校验与报告中自动提取法规、案例并沉淀入库，越用越准；
- **分析报告生成**：汇总各维度校验结果，生成结构化报告，支持导出 PDF。

> 数据安全：智能体配置（API Key / Base URL / 模型名）默认仅保存于**浏览器 localStorage**，
> 以请求头透传给服务端，**不落库、不上传**。

## 技术栈

- **前端 / 后端**：Next.js 14（App Router）+ TypeScript + Tailwind CSS
- **数据库**：PostgreSQL + PostgREST（通过内置 nginx 网关以 Supabase 兼容接口访问）
- **大模型**：任意 OpenAI 兼容接口（Ollama / DeepSeek / OpenAI / 自定义端点）
- **部署**：Docker Compose 一体化（含数据库、接口网关、应用、Ollama）

## 快速开始（Docker 一键部署）

### 前置要求

- Docker（macOS / Windows 用 Docker Desktop，Linux 用 Docker Engine）
- Docker Compose v2（`docker compose` 子命令）
- Node.js 18+（仅用于生成密钥；也可手动填写 `.env`）

### 方式 A：从源码启动

```bash
git clone <你的仓库地址> bidguard
cd bidguard

node deploy/gen-keys.mjs > .env      # 生成含随机密钥的 .env
docker compose up -d --build         # 构建并启动全部服务
docker compose exec ollama ollama pull qwen2.5:7b   # 首次拉取本地免费模型
```

浏览器打开 **http://localhost:3000** 即可使用。

### 方式 B：从发布压缩包启动（使用预构建镜像）

```bash
tar -xzf bidguard-v0.1.0.tar.gz
cd bidguard-v0.1.0

node deploy/gen-keys.mjs > .env      # 本机无 Node 时：cp .env.example .env 后手动填写
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b
```

> 该方式无需源码与 Node 环境（生成密钥可选），也无需改 `BIDGUARD_IMAGE`——分发包已预设镜像地址。

## 配置智能体（大模型）

支持两种配置方式，**界面配置优先于服务端默认**：

### 方式一：界面配置（推荐，适合每个使用者用自己的密钥）

1. 打开应用，点击右上角 **「模型设置」**（首次进入若未配置会自动弹出引导）；
2. 选择模型来源并填写，点击「测试连接」确认后保存。

| 来源 | Base URL | 模型名 | 是否需要 Key |
| --- | --- | --- | --- |
| 本地 Ollama（免费） | `http://ollama:11434/v1`（容器内）/ `http://localhost:11434/v1`（本机） | `qwen2.5:7b` | 否 |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` | 是（`sk-...`） |
| OpenAI | 留空（官方默认） | `gpt-4o` | 是 |
| 自定义（OpenAI 兼容） | 自行填写 | 自行填写 | 视情况 |

### 方式二：服务端默认（适合自托管统一预置）

在 `.env` 中设置（用户界面未配置时作为兜底），随后重启：

```bash
# 本地 Ollama
LLM_PROVIDER=ollama
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b

# 或 DeepSeek
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=sk-xxxx
```

> **重要**：本项目要求模型支持结构化 JSON 输出（`response_format=json_object`）。
> 请使用 `deepseek-chat`，**不要**用 `deepseek-reasoner`；自定义端点同样需支持该能力。

## 使用流程

1. 在首页 **新建校验项目**（填写项目名称、招标人等）；
2. 进入项目工作区，**上传文件**，为每个文件设定角色（招标文件 / 投标文件）及投标人信息，支持多文件批量上传；
3. 依次点击触发五类校验（完整性 → 合规性 → 响应性 → 雷同检测 → 串标嫌疑）；
4. 查看结果，进入 **报告** 页生成分析报告并可导出 PDF。

> 单文件上传上限默认 **200MB**（自托管环境），由 `.env` 的 `MAX_UPLOAD_MB` 控制。

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | 内置数据库密码 | 由 `gen-keys.mjs` 生成 |
| `JWT_SECRET` | 接口鉴权签名密钥（HS256） | 由 `gen-keys.mjs` 生成 |
| `ANON_KEY` | 匿名访问令牌（JWT） | 由 `gen-keys.mjs` 生成 |
| `SERVICE_ROLE_KEY` | 服务端访问令牌（JWT） | 由 `gen-keys.mjs` 生成 |
| `MAX_UPLOAD_MB` | 单文件上传上限（MB） | `200` |
| `BIDGUARD_IMAGE` | 应用镜像地址（仅用预构建镜像时） | 本地构建 `bidguard:local` |
| `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | 服务端默认大模型 | 内置 Ollama |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | 云端模型密钥（可选） | 空 |

## 数据与运维

- 数据持久化于命名卷：`db-data`（数据库）、`ollama-models`（模型）。
- 停止：`docker compose stop`；更新镜像后重启：`docker compose pull && docker compose up -d`。
- **切勿执行 `docker compose down -v`**，会连同数据库与模型一并删除。
- 修改 `.env` 后需重启服务才生效。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 智能校验报 JSON 相关错误 | 模型不支持结构化 JSON 输出，改用 `deepseek-chat` 等支持 `response_format=json_object` 的模型 |
| 未配置大模型 / 校验报错 | 点击右上角「模型设置」或在 `.env` 配置 `LLM_*`，改完重启 |
| 无法连接本地 Ollama | 容器内应使用 `http://ollama:11434/v1`；访问宿主机 Ollama 用 `http://host.docker.internal:11434/v1` |
| 网页报数据库 / 鉴权错误 | `.env` 中 `JWT_SECRET` 与两个 KEY 不配套，或改完未重启 |
| 上传大文件失败 | 确认 `MAX_UPLOAD_MB` 设置，并重新构建/重启 |

## 发布与分发

- 发布者：见 [RELEASE.md](./RELEASE.md)。推送 `v*` 标签会由 GitHub Actions 自动构建多架构镜像、
  生成分发包并创建 Release。
- 接收者：见 [RELEASE.md](./RELEASE.md) 第二节，或直接使用 Release 附件中的压缩包。

## 许可证

仅供学习与内部使用，请遵循相关法律法规使用。

---
---

<a name="english"></a>

# BidGuard

> AI-powered Tender & Bid Document Compliance Checker
>
> [中文](#bidguard-标智核) | **English**

BidGuard is an intelligent verification toolkit for tender & bidding scenarios. After uploading
tender and bid documents, a large language model (LLM) automatically performs **completeness
checks, clause-compliance checks, bid responsiveness analysis, similarity detection, and bid
collusion screening**, then generates an exportable analysis report. It supports **bring-your-own-key
(BYOK)** and **local free agents (Ollama)** — your data can stay entirely on your machine.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start (One-Click Docker)](#quick-start-one-click-docker)
- [Configuring the Agent (LLM)](#configuring-the-agent-llm)
- [Workflow](#workflow)
- [Environment Variables](#environment-variables)
- [Data & Operations](#data--operations)
- [FAQ](#faq)
- [Release & Distribution](#release--distribution)
- [License](#license)

---

## Features

Five verification types, executed in a fixed order:

1. **Tender completeness check** — detects missing chapters/sections (e.g. instructions to bidders,
   evaluation methods, contract terms).
2. **Clause compliance check** — verifies tender clauses against current laws (e.g. the Bidding Law)
   and real cases.
3. **Bid responsiveness check** — tender ↔ bid comparison on two levels:
   - **Item-by-item comparison**: a Requirement–Response matching table;
   - **Overall logical coherence**: evaluates the self-consistency of the bid document.
4. **Similarity detection (bid ↔ bid)** — deterministic algorithm (character n-gram + similarity),
   meeting the non-randomness requirement for audit/forensics.
5. **Collusion screening** — metadata and text comparison to flag anomalies (e.g. shared contact
   details among bidders), citing legal clauses and cases.

Also provided:

- **Regulation & case retrieval**: the agent automatically retrieves and cites relevant laws and cases;
- **Self-learning knowledge base**: extracts and persists regulations/cases over time — the more you use it, the sharper it gets;
- **Report generation**: aggregates all verification results into a structured report, exportable to PDF.

> Data safety: agent settings (API key / base URL / model) are stored by default only in the
> **browser's localStorage** and sent to the server via request headers — **never persisted or uploaded**.

## Tech Stack

- **Frontend / Backend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Database**: PostgreSQL + PostgREST (exposed via a built-in nginx gateway with a Supabase-compatible API)
- **LLM**: any OpenAI-compatible endpoint (Ollama / DeepSeek / OpenAI / custom)
- **Deployment**: all-in-one Docker Compose (database, API gateway, app, Ollama)

## Quick Start (One-Click Docker)

### Prerequisites

- Docker (Docker Desktop on macOS/Windows, Docker Engine on Linux)
- Docker Compose v2 (the `docker compose` subcommand)
- Node.js 18+ (only for key generation; you may fill `.env` manually instead)

### Option A: From source

```bash
git clone <your-repo-url> bidguard
cd bidguard

node deploy/gen-keys.mjs > .env      # generate .env with random secrets
docker compose up -d --build         # build and start all services
docker compose exec ollama ollama pull qwen2.5:7b   # pull the local free model
```

Open **http://localhost:3000** in your browser.

### Option B: From a release bundle (prebuilt image)

```bash
tar -xzf bidguard-v0.1.0.tar.gz
cd bidguard-v0.1.0

node deploy/gen-keys.mjs > .env      # no Node? cp .env.example .env and edit manually
docker compose up -d
docker compose exec ollama ollama pull qwen2.5:7b
```

> No source code or Node environment required (key generation optional), and no need to change
> `BIDGUARD_IMAGE` — the bundle already points to the published image.

## Configuring the Agent (LLM)

Two ways to configure. The **in-app setting takes precedence** over the server default.

### Option 1: In-app (recommended; each user brings their own key)

1. Open the app and click **"Model Settings"** in the top-right corner (a guide pops up automatically on first use if unconfigured).
2. Choose a provider, fill in the fields, click **"Test Connection"**, then save.

| Provider | Base URL | Model | Key required |
| --- | --- | --- | --- |
| Local Ollama (free) | `http://ollama:11434/v1` (in container) / `http://localhost:11434/v1` (host) | `qwen2.5:7b` | No |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` | Yes (`sk-...`) |
| OpenAI | leave blank (official default) | `gpt-4o` | Yes |
| Custom (OpenAI-compatible) | your own | your own | depends |

### Option 2: Server default (for self-hosted preset)

Set in `.env` (used as a fallback when the UI is unconfigured), then restart:

```bash
# Local Ollama
LLM_PROVIDER=ollama
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b

# or DeepSeek
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=sk-xxxx
```

> **Important**: this project requires structured JSON output (`response_format=json_object`).
> Use `deepseek-chat`, **not** `deepseek-reasoner`; custom endpoints must support it as well.

## Workflow

1. On the home page, **create a verification project** (name, tenderer, etc.).
2. Enter the project workspace, **upload files**, and assign each file a role (tender / bid) plus bidder
   info; batch upload of multiple files is supported.
3. Trigger the five checks in order (completeness → compliance → responsiveness → similarity → collusion).
4. Review results, then open the **Report** page to generate an analysis report and export it to PDF.

> Default per-file upload limit is **200 MB** (self-hosted), controlled by `MAX_UPLOAD_MB` in `.env`.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Built-in database password | generated by `gen-keys.mjs` |
| `JWT_SECRET` | API auth signing secret (HS256) | generated by `gen-keys.mjs` |
| `ANON_KEY` | Anonymous access token (JWT) | generated by `gen-keys.mjs` |
| `SERVICE_ROLE_KEY` | Server access token (JWT) | generated by `gen-keys.mjs` |
| `MAX_UPLOAD_MB` | Per-file upload limit (MB) | `200` |
| `BIDGUARD_IMAGE` | App image (only when using a prebuilt image) | locally built `bidguard:local` |
| `LLM_PROVIDER` / `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | Server-side default LLM | built-in Ollama |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | Cloud model keys (optional) | empty |

## Data & Operations

- Data is persisted in named volumes: `db-data` (database) and `ollama-models` (models).
- Stop: `docker compose stop`. Update and restart: `docker compose pull && docker compose up -d`.
- **Never run `docker compose down -v`** — it deletes both the database and models.
- Changes to `.env` take effect only after a restart.

## FAQ

| Symptom | Cause & Fix |
| --- | --- |
| JSON-related error during checks | Model lacks structured JSON output; switch to a model supporting `response_format=json_object` (e.g. `deepseek-chat`) |
| "LLM not configured" / check fails | Set it via **Model Settings** or `LLM_*` in `.env`, then restart |
| Cannot reach local Ollama | Use `http://ollama:11434/v1` inside Docker; use `http://host.docker.internal:11434/v1` to reach host Ollama |
| Database / auth error in the page | `JWT_SECRET` and the two keys in `.env` don't match, or you didn't restart after editing |
| Large file upload fails | Verify `MAX_UPLOAD_MB`, then rebuild/restart |

## Release & Distribution

- Publishers: see [RELEASE.md](./RELEASE.md). Pushing a `v*` tag makes GitHub Actions build
  multi-arch images, generate the bundle, and create a Release.
- Recipients: see section 2 of [RELEASE.md](./RELEASE.md), or just use the bundle attached to a Release.

## License

For learning and internal use only. Please comply with applicable laws and regulations.
