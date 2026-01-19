# FlareMsg

基于 Cloudflare Workers 的微信消息推送服务，提供简单的 HTTP API 接口，自动管理微信 Access Token，支持发送模版消息。

## 功能特性

- ✅ 无服务器架构，部署在 Cloudflare 边缘网络
- ✅ 自动管理微信 Access Token（KV 缓存 + 自动刷新）
- ✅ Token 失效自动重试机制
- ✅ 支持参数优先级配置（请求参数 > 环境变量 > 默认值）
- ✅ 支持自定义消息内容和跳转链接
- ✅ 完整的鉴权机制

## 快速开始

### 1. 前置准备

- 注册 [Cloudflare 账号](https://dash.cloudflare.com/sign-up)
- 安装 [Node.js](https://nodejs.org/) (推荐 v18+)
- 获取微信测试公众号：
  - 访问 [微信公众平台测试号](https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login)
  - 记录 `appID` 和 `appSecret`
  - 创建模版消息，记录 `template_id`
  - 关注测试号，获取个人 `openid`

### 2. 安装依赖

```bash
cd src
npm install
```

### 3. 配置项目

#### 3.1 创建 KV Namespace

```bash
cd src
wrangler kv:namespace create WECHAT_KV
```

记录返回的 `id`，更新 `src/wrangler.toml` 中的 `YOUR_KV_NAMESPACE_ID`。

#### 3.2 配置环境变量

编辑 `src/wrangler.toml`，填入：
- `WECHAT_TEMPLATE_ID`: 你的微信模版 ID
- 其他可选配置（默认消息内容、颜色等）

#### 3.3 设置敏感信息（Secrets）

```bash
cd src
wrangler secret put WECHAT_APP_ID
# 输入你的微信 AppID

wrangler secret put WECHAT_APP_SECRET
# 输入你的微信 AppSecret

wrangler secret put CLIENT_AUTH_TOKEN
# 输入你自定义的 API 鉴权密钥
```

### 4. 本地开发

```bash
cd src
npm run dev
```

访问 `http://localhost:8787` 进行测试。

### 5. 部署到 Cloudflare

```bash
cd src
npm run deploy
```

部署成功后，你会得到一个 `*.workers.dev` 的 URL。

## API 使用

### 请求格式

**Endpoint**: `POST /`

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
- `token` (必填): API 鉴权密钥，需与 `CLIENT_AUTH_TOKEN` 一致
- `openid` (必填): 微信用户的 OpenID
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
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "token": "your_auth_token",
    "openid": "oABCD1234567890",
    "from": "监控系统",
    "desc": "服务器 CPU 使用率过高",
    "remark": "当前使用率: 95%",
    "url": "https://monitor.example.com"
  }'
```

#### Python
```python
import requests

url = "https://your-worker.workers.dev"
payload = {
    "token": "your_auth_token",
    "openid": "oABCD1234567890",
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
const response = await fetch('https://your-worker.workers.dev', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    token: 'your_auth_token',
    openid: 'oABCD1234567890',
    from: '监控系统',
    desc: '服务器 CPU 使用率过高',
    remark: '当前使用率: 95%',
    url: 'https://monitor.example.com'
  })
});

const result = await response.json();
console.log(result);
```

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

| 变量名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `WECHAT_APP_ID` | Secret | 是 | 微信公众号 AppID |
| `WECHAT_APP_SECRET` | Secret | 是 | 微信公众号 AppSecret |
| `WECHAT_TEMPLATE_ID` | Var | 是 | 微信消息模版 ID |
| `CLIENT_AUTH_TOKEN` | Secret | 是 | API 调用鉴权密钥 |
| `KV_BINDING_NAME` | Var | 否 | KV Namespace 的 binding 名称（默认: "WECHAT_KV"） |
| `DEFAULT_FROM` | Var | 否 | 默认来源标题 |
| `DEFAULT_DESC` | Var | 否 | 默认消息内容 |
| `DEFAULT_REMARK` | Var | 否 | 默认备注 |
| `DEFAULT_URL` | Var | 否 | 默认跳转链接 |
| `COLOR_FROM` | Var | 否 | 标题颜色（十六进制） |
| `COLOR_DESC` | Var | 否 | 内容颜色（十六进制） |
| `COLOR_REMARK` | Var | 否 | 备注颜色（十六进制） |

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
cd src
wrangler tail
```

## 项目文档

- `docs/需求文档.md`: 完整功能需求
- `docs/设计文档.md`: 系统架构设计
- `docs/实现计划.md`: 开发任务清单
- `CLAUDE.md`: AI 开发指南

## 许可证

MIT License
