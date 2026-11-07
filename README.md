# InfraVerse

**机房数字孪生与物料管理平台。** 一个单进程、单文件数据库、可自托管的轻量级机房基础设施空间：用 3D 孪生跟踪服务器状态，用结构化物料档案跟踪每一块网卡、DPU、内存和每一根线缆，并内置 MCP Server 供 AI Agent 读写物料。

```
3D 孪生 ←→ 物料台账 ←→ 操作审计
              ↑
           MCP Agent
```

---

## 功能

### 1. 3D 数字孪生

- 浏览器内 3D 机房：机柜、服务器、交换机、PDU 与 U 位占用可视化。
- 鼠标拖拽旋转、滚轮缩放；点击机柜或设备查看详情。
- 服务器状态着色：健康 / 告警 / 严重 / 离线，告警自动汇总到左侧 HUD。
- 点击服务器查看 CPU、内存、温度、运行时长、最后上报时间，以及 BMC / OS 凭据和子物料。
- 快捷指令：连通性检测、定位闪烁、硬件自检、重启、关机、开机。
- 机柜导航、机柜前视图（U 位视图）、视角重置、标签开关、自动旋转。
- 机柜坐标、朝向、U 容量可在「系统设置」中维护，或通过 MCP 增删改。

### 2. 物料管理

- 物料类型：服务器、交换机、网卡、DPU、内存、硬盘、线缆、光模块、PDU、其他。
- 每种类型有专属字段模板（后端驱动，前端动态表单）。
- 服务器字段包含：物料编码、型号、位置（机柜 + U 位 / 槽位）、BMC IP / 账号 / 密码 / 协议、OS 管理 IP / 账号 / 密码 / OS 类型、CPU / 内存 / 磁盘等。
- 服务器上的网卡、DPU、内存、线缆等通过 `parent_id` 挂到服务器下，可无限层级；位置自动归属到所属服务器。
- 物料状态：在用、库存、维护中、故障、已报废。
- 搜索：编码、名称、型号、厂商、序列号、IP、机柜、槽位、备注等全文模糊匹配（空格分隔多关键词）。
- 筛选：类型、状态、机柜、库存 / 未上架、仅顶层物料。
- 物料统计卡片：按类型、库存、故障、在线服务器统计，一键筛选。
- 机柜前视图：查看 U 位占用，点击设备直达详情。
- 「3D 定位」：从物料列表直接跳转到孪生视图并聚焦设备。

### 3. MCP Server（Agent 接入）

- 内置 **Streamable HTTP MCP**（`/mcp`）和 **stdio MCP** 两种接入方式。
- 使用 API Token 认证，所有写操作自动记录到操作日志，操作人可追溯到 Token 所属用户。
- 支持物料搜索 / 查看 / 新增 / 修改 / 删除，机柜 CRUD，服务器遥测上报，指令下发 / 队列 / 确认，操作日志读取。
- 详见 [MCP 接入](#mcp-接入)。

### 4. 账号与审计

- 登录、注册；**所有用户均为管理员**，拥有全部权限。
- 所有成员均可查看全系统操作记录（物料变更、登录、指令、Token、机柜、Agent 上报等）。
- 列表接口自动掩码密码字段，详情页可一键显示 / 隐藏；审计日志不记录密码值。
- 支持修改密码、API Token 创建 / 删除。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 运行时 | Node.js ≥ 22.13（使用内置 `node:sqlite`，**无需原生编译**） |
| 后端 | Express 5 + SQLite（WAL） |
| 前端 | React 19 + Vite + Three.js |
| 认证 | JWT（Web）+ Bearer API Token（Agent / MCP） |
| MCP | `@modelcontextprotocol/sdk`，Streamable HTTP + stdio |
| 部署 | 单进程同时提供 API / MCP / 静态前端；Docker 多阶段构建 |

默认端口 `8787`，数据目录 `./data`：

```
data/
├── infraverse.db      # SQLite（物料、用户、日志、指令……）
├── infraverse.db-wal
├── infraverse.db-shm
└── secret.key         # 未配置 JWT_SECRET 时自动生成的 JWT 密钥
```

---

## 快速开始

要求：**Node.js ≥ 22.13**、npm。

```bash
npm install

# 开发模式：后端 8787 + 前端 5173（自动代理 /api 与 /mcp）
npm run dev

# 生产模式
npm run build
npm start
```

打开 <http://localhost:8787>。

首次启动会自动建库并写入演示数据：

- 默认管理员：`admin` / `admin123`（请登录后尽快修改）
- B02-B06 五个机柜、22 台服务器（21 台上架 + 1 台备用）、7 台交换机、5 台 PDU，以及网卡 / DPU / 内存 / 线缆等部件和库存物料
- 所有演示数据只会在**第一次启动**时写入

重置演示数据（会删除全部数据）：

```bash
# 停止服务后执行
rm -f data/infraverse.db data/infraverse.db-wal data/infraverse.db-shm
npm start
```

### 数据备份

`data/` 目录包含全部物料、凭据、用户与操作记录，**不要提交到 Git**。备份时建议先停止服务，复制整个 `data/` 目录：

```bash
docker compose stop
tar czf infraverse-backup-$(date +%F).tar.gz data/
docker compose start
```

或使用 SQLite 在线备份：

```bash
sqlite3 data/infraverse.db ".backup 'backup.db'"
```

### 环境变量

复制 `.env.example` 为 `.env`，或直接通过环境变量注入。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP 端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | SQLite 与密钥目录 |
| `JWT_SECRET` | 自动生成 | JWT 签名密钥；不配置时持久化到 `data/secret.key` |
| `JWT_EXPIRES_IN` | `12h` | Web 登录有效期 |
| `SIMULATE_COMMANDS` | `true` | 演示模式：指令下发后几秒自动模拟完成；接真实 Agent 时设为 `false` |
| `ALLOW_REGISTER` | `true` | 是否开放注册 |

---

## Docker 部署

```bash
docker compose up -d --build
# 访问 http://localhost:8787
```

- 数据持久化在 `./data`（容器内 `/app/data`）。
- 修改 `docker-compose.yml` 中的环境变量即可调整演示模式、注册开关与 JWT 密钥。
- 生产环境建议放在 Nginx / Caddy 后面启用 HTTPS，并只在内网或 VPN 中暴露。

单容器手动构建：

```bash
docker build -t infraverse .
docker run -d --name infraverse -p 8787:8787 -v ./data:/app/data \
  -e SIMULATE_COMMANDS=false -e JWT_SECRET='change-me' infraverse
```

---

## 数据模型

### 物料

| 字段 | 说明 |
| --- | --- |
| `code` | 物料编码，全局唯一 |
| `name` / `type` / `status` | 名称、类型、状态 |
| `model` / `vendor` / `serial` | 型号、厂商、序列号 |
| `rack_id` / `position_u` / `u_height` / `slot` | 机柜、起始 U 位（1 为最底部）、占用 U 数、机柜内编号 / 槽位 |
| `parent_id` | 所属设备（如服务器下的网卡、DPU、内存、线缆） |
| `spec` | 类型专属字段（JSON），可扩展自定义键值 |
| `note` | 备注 |

位置规则：

- 顶层设备：`机柜 + U位`，例如 `B02 · U2-U3`。
- 子物料：自动显示为 `B02 · U2 · SRV-B02-01 · PCIe Slot 3`。
- 无 `rack_id` 且无父物料：`库存 / 未上架`。
- 同一机柜的 U 位不能重叠；接口会返回 409 与冲突物料。

### 物料类型与专属字段

| 类型 | 专属字段（`spec`） |
| --- | --- |
| `server` | CPU、CPU 数量、内存总量、磁盘、电源；BMC IP / 协议 / 账号 / 密码；OS IP / 账号 / 密码 / 类型 / 主机名 |
| `switch` | 端口、管理 IP / 账号 / 密码 / 协议、上联、固件 |
| `nic` | 接口、速率、MAC、PCIe 槽位、固件 |
| `dpu` | 模式、管理 IP / 账号 / 密码、PCIe 槽位、固件 |
| `memory` | 容量、类型、频率、DIMM 槽位、Rank |
| `disk` | 容量、类型、接口、盘位 |
| `cable` | 线缆类型、长度、A 端设备 / 端口、B 端设备 / 端口 |
| `sfp` | 封装、速率、波长、接口 |
| `pdu` | 输入、输出口、额定功率、管理 IP / 账号 / 密码 |
| `other` | 自由扩展 |

`spec` 中未在模板内的键会作为「扩展字段」展示，可通过 Web 表单或 MCP 写入。

### 服务器状态

| 字段 | 说明 |
| --- | --- |
| `power_state` | `on` / `off` / `unknown` |
| `health` | `ok` / `warning` / `critical` / `offline` / `unknown` |
| `cpu_pct` / `mem_pct` / `temp_c` | CPU、内存、温度 |
| `uptime_s` / `last_seen` | 运行时长、最后上报时间 |
| `metrics` | 任意扩展指标 JSON |

演示数据内置了健康、告警、严重、离线等状态。平台本身不直接轮询 BMC / OS（避免依赖机房网络与凭据外发），由部署在机房侧的 Agent 通过 MCP 或 HTTP 主动上报遥测与指令结果。接入真实 Agent 后建议设置 `SIMULATE_COMMANDS=false`。

---

## MCP 接入

### 1. 创建 API Token

登录 Web →「系统设置」→「API Token 与 MCP 接入」→ 输入名称 → 创建。

Token 以 `iv_` 开头，**仅显示一次**。删除后立即失效。

### 2. HTTP MCP（推荐，远程 Agent）

```bash
# Claude Code CLI
claude mcp add --transport http infraverse http://<server>:8787/mcp \
  --header "Authorization: Bearer iv_xxxxxxxx"
```

Cursor / 通用 HTTP MCP 客户端：

```json
{
  "mcpServers": {
    "infraverse": {
      "url": "http://<server>:8787/mcp",
      "headers": {
        "Authorization": "Bearer iv_xxxxxxxx"
      }
    }
  }
}
```

传输方式：**Streamable HTTP**（无状态），JSON 响应。

### 3. stdio MCP（Agent 与服务同机）

```bash
INFRAVERSE_TOKEN=iv_xxxxxxxx npm run mcp
```

Claude Desktop 配置（路径按实际部署替换）：

```json
{
  "mcpServers": {
    "infraverse": {
      "command": "node",
      "args": ["/绝对路径/InfraVerse/server/mcp-stdio.js"],
      "env": {
        "INFRAVERSE_TOKEN": "iv_xxxxxxxx"
      }
    }
  }
}
```

> stdio 模式直接访问本机 SQLite，适合 Agent 与 InfraVerse 部署在同一台机器；跨机器请使用 HTTP MCP。

### 4. MCP 工具

| 工具 | 说明 |
| --- | --- |
| `whoami` | 当前 Token 对应的用户 |
| `material_types` | 物料类型、字段、状态、健康值、指令说明 |
| `materials_search` | 搜索物料（密码字段掩码） |
| `materials_get` | 查看完整物料（含真实凭据、子物料、服务器状态） |
| `materials_create` | 新增物料 |
| `materials_update` | 修改物料（`spec` 合并语义） |
| `materials_delete` | 删除物料（`confirm=true`，子物料需 `cascade=true`） |
| `racks_list` | 机柜列表、占用率 |
| `racks_create` / `racks_update` / `racks_delete` | 机柜 CRUD |
| `dashboard_overview` | 物料统计、服务器在线 / 健康、告警 |
| `server_status_get` | 查看服务器状态 |
| `server_status_report` | 上报遥测（CPU / 内存 / 温度 / 健康 / 物料状态） |
| `commands_send` | 下发服务器指令 |
| `commands_list` | 查看指令队列 |
| `commands_ack` | Agent 回写指令执行结果 |
| `logs_list` | 查看全系统操作记录 |

示例对话：

> “查一下 B02 机柜里所有服务器的 BMC 密码。”
>
> Agent：调用 `materials_search` → `materials_get`，返回带凭据的物料详情。
>
> “给 SRV-B02-01 加一块 Intel E810 网卡，槽位 Slot 6。”
>
> Agent：调用 `materials_create`，`type=nic, parent=SRV-B02-01, slot=PCIe Slot 6, spec={...}`。

所有 MCP 写操作都会进入操作日志，来源标记为 `MCP`。

### 5. 项目级 Pi Agent（本仓库内置）

仓库已提供 `.pi/mcp.json`：在项目根目录启动 pi 并授予项目信任后，pi 会自动加载 `infraverse` MCP（stdio），通过本项目自己的 SQLite 直接读写物料，**无需保持 HTTP 服务运行**。

首次使用或重置数据库后：

```bash
npm run mcp:setup
```

该命令会：

- 以 admin 身份创建或复用 API Token
- 将 Token 写入 `.pi/token`（已加入 `.gitignore`，不会提交）
- 写入一条「创建项目级 pi Agent Token」操作记录
- 在控制台提示下一步

然后在项目目录启动 pi：

```bash
pi
```

首次会询问项目信任，选择 **Trust**。如果 pi 已在运行，先执行 `/trust` 保存信任，再执行 `/reload`。检查连接：

```bash
pi mcp list          # 已信任项目时
```

或在 pi 会话内使用 `/mcp` 查看。工具以 `mcp__infraverse__*` 提供，默认 `exposure: codemode`；需要直接暴露给模型时可在 `.pi/mcp.json` 中改为 `"exposure": "direct"`。

Token 轮换：

```bash
rm .pi/token
npm run mcp:setup
```

旧 Token 仍显示在「系统设置 → API Token」中，可手动删除。`.pi/token` 等同于密码，请勿提交、分享或打进 Docker 镜像（`.dockerignore` 已排除 `.pi`）。

Token 解析顺序：`INFRAVERSE_TOKEN` → `INFRAVERSE_API_TOKEN` → `INFRAVERSE_TOKEN_FILE` → `.pi/token`。因此远程/CI 环境也可以直接注入环境变量，无需项目 Token 文件。

---

## Agent 集成（状态 / 指令）

除了 MCP，也可以直接使用 HTTP API。API Token 可用于所有 `/api` 接口。

### 上报服务器遥测

```bash
curl -X POST http://localhost:8787/api/telemetry \
  -H "Authorization: Bearer iv_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "material": "SRV-B02-01",
    "health": "ok",
    "power_state": "on",
    "cpu_pct": 42.5,
    "mem_pct": 63.1,
    "temp_c": 54,
    "uptime_s": 864000,
    "metrics": { "net_rx_mbps": 320, "net_tx_mbps": 180 }
  }'
```

`material` 可传物料编码或 ID；只传变化的字段即可。

### 指令队列

当 `SIMULATE_COMMANDS=false` 时，指令保持 `pending`，由 Agent 拉取执行：

```bash
# 拉取待执行指令
curl "http://localhost:8787/api/commands?status=pending" \
  -H "Authorization: Bearer iv_xxxxxxxx"

# 回写执行结果
curl -X POST http://localhost:8787/api/commands/1/ack \
  -H "Authorization: Bearer iv_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"status":"done","result":"BMC reset command accepted"}'
```

支持的指令：`ping`、`locate`、`selftest`、`restart`、`power_off`、`power_on`。

---

## API 摘要

所有 `/api`（除登录 / 注册 / 健康检查）均需要：

```
Authorization: Bearer <JWT 或 API Token>
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 注册（注册后即管理员） |
| `POST` | `/api/auth/login` | 登录，返回 JWT |
| `GET` | `/api/auth/me` | 当前用户 |
| `POST` | `/api/auth/change-password` | 修改密码 |
| `GET` | `/api/meta` | 类型模板、状态、指令、房间信息、统计 |
| `GET` | `/api/materials` | 搜索 / 分页物料 |
| `POST` | `/api/materials` | 新增物料 |
| `GET` | `/api/materials/:ref` | 详情（ref 为 ID 或编码） |
| `PATCH` | `/api/materials/:ref` | 修改物料 |
| `DELETE` | `/api/materials/:ref` | 删除（`?cascade=1`） |
| `GET` | `/api/materials/:ref/commands` | 指令记录 |
| `POST` | `/api/materials/:ref/commands` | 下发指令 |
| `GET` | `/api/racks` | 机柜列表 |
| `GET` | `/api/racks/:rack/elevation` | 机柜 U 位视图 |
| `GET` | `/api/twin` | 3D 孪生数据 |
| `GET` | `/api/dashboard` | 统计与告警 |
| `POST` | `/api/telemetry` | 上报服务器遥测 |
| `GET` | `/api/commands` | 指令队列 |
| `POST` | `/api/commands/:id/ack` | 确认指令 |
| `GET` | `/api/logs` | 操作记录 |
| `GET` | `/api/tokens` / `POST` / `DELETE` | API Token 管理 |
| `GET` | `/api/health` | 健康检查（无需认证） |

物料列表查询参数：`q`、`type`、`status`、`rack`、`parent_id`、`root_only`、`unplaced`、`page`、`page_size`、`sort`、`order`。

---

## 项目结构

```
InfraVerse/
├── server/
│   ├── index.js        # Express 应用、路由、MCP HTTP 端点、静态资源
│   ├── db.js           # SQLite 初始化、迁移、种子数据入口
│   ├── seed.js         # 演示数据
│   ├── auth.js         # JWT / API Token / 密码
│   ├── materials.js    # 物料服务
│   ├── racks.js        # 机柜服务
│   ├── status.js       # 状态、孪生、指令
│   ├── audit.js        # 操作日志
│   ├── mcp.js          # MCP 工具定义
│   ├── mcp-stdio.js    # stdio MCP 入口
│   ├── types.js        # 物料类型模板
│   ├── config.js
│   └── crypto.js
├── src/
│   ├── three/TwinScene.jsx    # Three.js 场景
│   ├── pages/                 # 登录 / 孪生 / 物料 / 日志 / 设置
│   ├── components/            # 物料详情、表单、机柜视图等
│   └── styles.css
├── scripts/
│   └── pi-mcp-setup.mjs       # 项目级 pi MCP Token 初始化
├── .pi/
│   └── mcp.json               # 项目级 pi Agent MCP 配置
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## 安全说明

- **权限模型是刻意的**：所有注册用户都是管理员，都能查看全部操作记录。请只在可信内网使用，或配合统一身份网关。
- 生产环境务必修改默认密码，设置固定 `JWT_SECRET`，并通过 HTTPS 访问。
- BMC / OS / DPU 密码以 JSON 形式保存在 SQLite 的 `materials.spec` 中（未做数据库级加密）。请限制 `data/` 目录权限，并保护备份文件。
- 列表 API 自动掩码密码字段；详情接口会返回真实值；审计日志只记录变更字段名，不记录密码值。
- API Token 只显示一次，服务端仅保存 SHA-256 哈希；请像对待密码一样保管。
- 所有写操作通过统一审计上下文记录操作人、IP、来源（Web / MCP / Agent / 系统）。

---

## License

MIT
