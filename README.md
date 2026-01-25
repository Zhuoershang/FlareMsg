# FlareMsg

基于 Cloudflare Workers 的微信消息推送服务，提供简单的 HTTP API 接口，自动管理微信 Access Token，支持发送模版消息。

## 功能特性

- ✅ 无服务器架构，部署在 Cloudflare 边缘网络
- ✅ 自动管理微信 Access Token（KV 缓存 + 自动刷新）
- ✅ Token 失效自动重试机制
- ✅ 支持 GET 和 POST 双重请求方式
- ✅ 支持用户级 Token（sk_ 前缀，无需提供 openid）
- ✅ Web 管理界面，可视化管理用户 Token
- ✅ 支持参数优先级配置（请求参数 > 环境变量 > 默认值）
- ✅ 支持自定义消息内容和跳转链接
- ✅ 完整的鉴权机制（全局 Token + 用户 Token）

## 快速开始

### 1. 前置准备

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 安装 [Node.js](https://nodejs.org/) (推荐 v20+, Wrangler v4 要求)
- 获取微信测试公众号：
  - 访问 [微信公众平台测试号](https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login)
  - 记录 `appID` 和 `appSecret`
  - **创建模版消息**：
    1. 点击"新增测试模版"
    2. 模版标题：随意填写（如"系统通知"）
    3. 模版内容：**必须**使用以下格式
       ```
       {{FROM.DATA}}
       {{DESC.DATA}}
       {{REMARK.DATA}}
       ```
    4. 点击"确定"后，记录生成的 `template_id`（形如 `xBxxxxxxxxxxxxxx`）
  - 关注测试号，获取个人 `openid`

### 2. 安装依赖

```bash
npm install
```

### 3. 配置项目

#### 3.1 创建 KV Namespace

```bash
npx wrangler kv namespace create WECHAT_KV
```

记录返回的 `id`，更新 `wrangler.toml` 中的 `YOUR_KV_NAMESPACE_ID`。

#### 3.2 配置环境变量

编辑 `wrangler.toml`，配置微信模版 ID：

**方式一：直接修改（推荐用于本地部署）**

将 `WECHAT_TEMPLATE_ID` 的值 `YOUR_TEMPLATE_ID` 替换为你的实际模版 ID：

```toml
WECHAT_TEMPLATE_ID = "xBxxxxxxxxxxxxxx"  # 替换为你的模版 ID
```

**方式二：使用 GitHub Actions（推荐用于自动部署）**

保持占位符不变，在 GitHub Secrets 中添加 `WECHAT_TEMPLATE_ID`，部署时会自动替换。

其他可选配置（默认消息内容、颜色等）可根据需要调整。

#### 3.3 设置敏感信息（Secrets）

```bash
npx wrangler secret put WECHAT_APP_ID
# 输入你的微信 AppID

wrangler secret put WECHAT_APP_SECRET
# 输入你的微信 AppSecret

wrangler secret put CLIENT_AUTH_TOKEN
# 输入你自定义的 API 鉴权密钥
```

### 4. 本地开发

```bash
npm run dev
```

访问 `http://localhost:8787` 进行测试。

### 5. 部署到 Cloudflare

```bash
npm run deploy
```

部署成功后，你会得到一个 `*.workers.dev` 的 URL。

## API 使用

### 网页测试界面（推荐用于快速测试）

访问 `https://your-worker.workers.dev/` 即可打开网页测试界面。

**功能特性**：
- 📝 可视化表单，无需编写代码
- 🔒 安全的密码输入框保护 Token
- ⚡ 实时反馈发送结果
- 🎨 精美的暗黑/浅色主题

**使用步骤**：
1. 打开首页，填写以下字段：
   - **鉴权密钥**：输入 `CLIENT_AUTH_TOKEN` 的值（必填）
   - **微信 OpenID**：输入接收者的 OpenID（必填）
   - **消息来源**：例如"系统监控"（可选）
   - **消息内容**：例如"服务器 CPU 使用率过高"（必填）
   - **备注信息**：例如"请及时查看"（可选）
   - **跳转链接**：点击消息后跳转的 URL（可选）
2. 点击"发送消息"按钮
3. 查看发送结果，成功时会显示消息 ID

**重要提示**：
- `消息内容`（desc）是必填字段，这是显示在微信消息中的主要内容
- 如果收到消息但看不到内容，请检查：
  - 模版内容是否为 `{{FROM.DATA}}`、`{{DESC.DATA}}`、`{{REMARK.DATA}}`
  - 发送时是否填写了"消息内容"字段
  - `wrangler.toml` 中是否配置了 `WECHAT_TEMPLATE_ID`

### 鉴权机制

FlareMsg 支持两种 Token 鉴权方式：

#### 1. 全局 Token（原有方式）
- 使用 `CLIENT_AUTH_TOKEN` 环境变量配置的密钥
- 需要同时提供 `openid` 参数
- 适合管理员或系统级别的消息发送

#### 2. 用户 Token（推荐）
- 格式：`sk_` 开头的随机字符串（如 `sk_abc123xyz`）
- 存储在 KV 中，Key 为 token，Value 为对应的 openid
- **无需提供 openid 参数**，系统自动从 KV 获取
- 适合为单个用户或应用分配独立的推送密钥

### 请求格式

#### 方式一：GET 请求

**Endpoint**: `GET /send`

**Query 参数**:

```
token=your_auth_token
&openid=user_openid (可选，使用用户 Token 时不需要)
&from=消息来源
&desc=消息内容
&remark=备注
&url=跳转链接
```

**示例**:

```bash
# 使用全局 Token
curl "https://your-worker.workers.dev/send?token=YOUR_TOKEN&openid=USER_OPENID&desc=测试消息"

# 使用用户 Token（无需 openid）
curl "https://your-worker.workers.dev/send?token=sk_abc123&desc=测试消息"
```

#### 方式二：POST 请求

**Endpoint**: `POST /send`

**Headers**:

```
Content-Type: application/json
```

**Body**:

```json
{
  "token": "your_auth_token",
  "openid": "user_openid",
  "from": "服务器 A",
  "desc": "磁盘使用率达到 90%",
  "remark": "请及时处理",
  "url": "https://console.example.com"
}
```

**参数说明**:

- `token` (必填): API 鉴权密钥
  - 全局 Token：需与 `CLIENT_AUTH_TOKEN` 一致
  - 用户 Token：`sk_` 开头的字符串，自动关联 openid
- `openid` (条件必填): 微信用户的 OpenID
  - 使用全局 Token 时必填
  - 使用用户 Token（`sk_` 开头）时不需要
- `from` (可选): 消息来源/标题
- `desc` (可选): 消息主要内容
- `remark` (可选): 备注信息
- `url` (可选): 点击消息跳转的链接

### 响应格式

**成功**:

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "msgid": 123456789
}
```

**失败**:

```json
{
  "errcode": -1,
  "errmsg": "错误描述"
}
```

### 使用示例

#### cURL

```bash
# 使用全局 Token（需要 openid）
curl -X POST https://your-worker.workers.dev/send \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your_client_auth_token",
    "openid": "oABCD1234567890",
    "from": "监控系统",
    "desc": "服务器 CPU 使用率过高",
    "remark": "当前使用率: 95%",
    "url": "https://monitor.example.com"
  }'

# 使用用户 Token（无需 openid）
curl -X POST https://your-worker.workers.dev/send \
  -H "Content-Type: application/json" \
  -d '{
    "token": "sk_abc123xyz",
    "from": "监控系统",
    "desc": "服务器 CPU 使用率过高"
  }'

# GET 请求方式
curl "https://your-worker.workers.dev/send?token=sk_abc123xyz&desc=测试消息&from=API调用"
```

#### Python

```python
import requests

# 使用用户 Token（推荐）
url = "https://your-worker.workers.dev/send"
payload = {
    "token": "sk_abc123xyz",
    "from": "监控系统",
    "desc": "服务器 CPU 使用率过高",
    "remark": "当前使用率: 95%",
    "url": "https://monitor.example.com"
}

response = requests.post(url, json=payload)
print(response.json())
```

#### Node.js

```javascript
// 使用用户 Token（推荐）
const response = await fetch("https://your-worker.workers.dev/send", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    token: "sk_abc123xyz",
    from: "监控系统",
    desc: "服务器 CPU 使用率过高",
    remark: "当前使用率: 95%",
    url: "https://monitor.example.com",
  }),
});

const result = await response.json();
console.log(result);
```

#### JavaScript / Browser

```javascript
// 使用 GET 请求和用户 Token
const url = new URL('https://your-worker.workers.dev/send');
url.searchParams.set('token', 'sk_abc123xyz');
url.searchParams.set('desc', '测试消息');
url.searchParams.set('from', 'Web应用');

fetch(url)
  .then(res => res.json())
  .then(data => console.log(data));
```

## 管理功能

FlareMsg 提供了 Web 管理界面和 REST API，用于管理用户 Token。

### Web 管理界面

访问 `https://your-worker.workers.dev/admin` 即可进入管理页面。

**功能特性**：
- 🔐 安全的登录验证（需要 `CLIENT_AUTH_TOKEN`）
- 📋 查看所有用户 Token（仅 `sk_` 开头的 Token）
- ➕ 添加新 Token（自动生成 `sk_` 前缀的随机 Token）
- 🗑️ 删除指定 Token
- 📋 一键复制 Token 到剪贴板

**使用步骤**：
1. 访问 `/admin` 页面
2. 输入管理员 Token（`CLIENT_AUTH_TOKEN`）
3. 登录后可以：
   - 在"添加用户 Token"区域输入用户的 OpenID
   - 系统自动生成形如 `sk_abc123xyz` 的 Token
   - 查看、复制或删除现有 Token

### 管理 API

#### 列出所有用户 Token

```bash
curl -H "Authorization: Bearer CLIENT_AUTH_TOKEN" \
  https://your-worker.workers.dev/admin/api/tokens
```

**响应**：

```json
{
  "tokens": [
    {
      "key": "sk_abc123xyz",
      "value": "oABCD1234567890"
    },
    {
      "key": "sk_def456uvw",
      "value": "oEFGH9876543210"
    }
  ]
}
```

#### 添加新用户 Token

```bash
curl -X POST https://your-worker.workers.dev/admin/api/tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer CLIENT_AUTH_TOKEN" \
  -d '{"openid": "oABCD1234567890"}'
```

**响应**：

```json
{
  "success": true,
  "key": "sk_abc123xyz",
  "value": "oABCD1234567890"
}
```

#### 删除用户 Token

```bash
curl -X DELETE "https://your-worker.workers.dev/admin/api/tokens?key=sk_abc123xyz" \
  -H "Authorization: Bearer CLIENT_AUTH_TOKEN"
```

**响应**：

```json
{
  "success": true,
  "message": "Token deleted successfully"
}
```

### 安全建议

1. **保护管理员 Token**
   - `CLIENT_AUTH_TOKEN` 应该妥善保管
   - 不要在前端代码中暴露
   - 定期更换

2. **用户 Token 分配**
   - 为不同的用户/应用分配独立的 Token
   - Token 泄露时只需删除对应的 Token，不影响其他用户
   - 定期审计 Token 使用情况

3. **访问控制**
   - 管理页面应该通过 IP 白名单或 VPN 限制访问
   - 可以通过 Cloudflare Workers 的 Access 功能添加额外保护

## 配置说明

### 参数优先级

所有消息字段都遵循三级优先级：

```
HTTP 请求参数 > 环境变量默认值 > 代码内置默认值
```

例如，`from` 字段的取值逻辑：

1. 如果请求中提供了 `from`，使用请求值
2. 否则使用 `wrangler.toml` 中的 `DEFAULT_FROM`
3. 否则使用代码默认值 `"系统通知"`

### 环境变量列表

| 变量名               | 类型   | 必填 | 说明                                              |
| -------------------- | ------ | ---- | ------------------------------------------------- |
| `WECHAT_APP_ID`      | Secret | 是   | 微信公众号 AppID                                  |
| `WECHAT_APP_SECRET`  | Secret | 是   | 微信公众号 AppSecret                              |
| `WECHAT_TEMPLATE_ID` | Var    | 是   | 微信消息模版 ID                                   |
| `CLIENT_AUTH_TOKEN`  | Secret | 是   | API 调用鉴权密钥                                  |
| `KV_BINDING_NAME`    | Var    | 否   | KV Namespace 的 binding 名称（默认: "WECHAT_KV"） |
| `DEFAULT_FROM`       | Var    | 否   | 默认来源标题                                      |
| `DEFAULT_DESC`       | Var    | 否   | 默认消息内容                                      |
| `DEFAULT_REMARK`     | Var    | 否   | 默认备注                                          |
| `DEFAULT_URL`        | Var    | 否   | 默认跳转链接                                      |
| `COLOR_FROM`         | Var    | 否   | 标题颜色（十六进制）                              |
| `COLOR_DESC`         | Var    | 否   | 内容颜色（十六进制）                              |
| `COLOR_REMARK`       | Var    | 否   | 备注颜色（十六进制）                              |

## 技术架构

### 核心流程

1. **请求验证**: 检查 HTTP Method 和鉴权 Token
2. **参数解析**: 提取消息内容和目标用户
3. **Token 管理**: 从 KV 读取或刷新 Access Token
4. **消息发送**: 调用微信 API 发送模版消息
5. **自动重试**: Token 失效时自动刷新并重试

### Token 管理机制

- Access Token 缓存在 Cloudflare KV 中
- TTL 设置为 7000 秒（略低于微信官方 7200 秒）
- 检测到 `errcode: 40001` 时自动删除缓存并重试
- 避免频繁调用微信 Token 接口
- 支持自定义 KV Namespace binding 名称，避免与现有项目冲突
  - 默认使用 `WECHAT_KV` binding
  - 可通过 `KV_BINDING_NAME` 环境变量指定其他 binding 名称

## 故障排查

### 常见错误

**401 Unauthorized**

- 检查 `CLIENT_AUTH_TOKEN` 是否正确设置
- 确认请求中的 `token` 参数与环境变量一致

**400 Missing required parameter: openid**

- 确保请求中包含 `openid` 字段

**Token 获取失败**

- 检查 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 是否正确
- 确认微信公众号状态正常

**消息发送失败 (errcode: 40001)**

- 系统会自动重试一次
- 如果持续失败，检查微信公众号配置

### 查看日志

```bash
npx wrangler tail
```

## 项目文档

以下是本项目的详细文档：

- **[README.md](README.md)** - 项目主文档，包含完整的使用说明
- **[CONFIG.md](CONFIG.md)** - 配置说明，本地开发和 CI/CD 配置指南
- **[QUICK_START.md](QUICK_START.md)** - 快速开始指南，5分钟快速测试步骤
- **[LOCAL_TESTING.md](LOCAL_TESTING.md)** - 详细的本地测试指南
- **[GITHUB_DEPLOYMENT.md](GITHUB_DEPLOYMENT.md)** - GitHub 自动部署配置指南

## 许可证

[MIT License](LICENSE)
