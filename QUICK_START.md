# 快速开始指南

本文档提供最快速的本地测试步骤。

## 5 分钟快速测试

### 1. 安装依赖（1 分钟）

```bash
npm install
```

### 2. 配置环境变量（2 分钟）

复制示例文件并填入真实值：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入你的微信测试号信息：

```bash
WECHAT_APP_ID=你的微信AppID
WECHAT_APP_SECRET=你的微信AppSecret
CLIENT_AUTH_TOKEN=test123456
```

**获取微信测试号信息**：访问 https://mp.weixin.qq.com/debug/cgi-bin/sandbox?t=sandbox/login

### 3. 配置模版 ID（1 分钟）

编辑 `wrangler.toml`，解除 `WECHAT_TEMPLATE_ID` 的注释并填入你的微信模版 ID：

```toml
# 将这一行的注释解除
WECHAT_TEMPLATE_ID = "你的模版ID"
```

### 4. 启动开发服务器（10 秒）

```bash
npm run dev
```

看到以下输出表示启动成功：

```
⛅️ wrangler 3.x.x
Ready on http://localhost:8787
```

### 5. 发送测试消息（30 秒）

打开新终端，发送测试请求：

```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{
    "token": "test123456",
    "openid": "你的微信openid",
    "desc": "测试消息"
  }'
```

**成功响应**：

```json
{
  "errcode": 0,
  "errmsg": "ok",
  "msgid": 123456789
}
```

检查你的微信，应该收到测试消息！

## 使用测试脚本

运行测试脚本，按提示输入配置：

```bash
./test-local.sh
```

脚本会提示你输入：
- **CLIENT_AUTH_TOKEN**: 你在 `.dev.vars` 中设置的鉴权密钥
- **WECHAT_OPENID**: 你的微信 openid
- **服务地址**: 默认 `http://localhost:8787`，直接回车使用默认值

测试脚本会自动执行 6 个测试用例并显示结果。

## 常见问题

### Q: 如何获取 openid？

A: 关注微信测试号后，在测试号页面的"用户列表"中可以看到你的 openid。

### Q: 如何创建模版消息？

A: 在测试号页面点击"新增测试模版"，模版标题随意填写（如"系统通知"），模版内容：

```
{{FROM.DATA}}
{{DESC.DATA}}
{{REMARK.DATA}}
```

**重要提示**：
- 模版中的字段名（FROM、DESC、REMARK）必须与代码中一致
- 字段名必须大写，后缀必须是 `.DATA`
- 创建后会生成一个模版 ID，复制到 `wrangler.toml` 的 `WECHAT_TEMPLATE_ID` 配置项

### Q: 收到消息但看不到内容怎么办？

A: 如果只显示模板名称但看不到具体内容，可能由以下原因导致：

1. **模版 ID 未配置**
   - 检查 `wrangler.toml` 中是否已解除 `WECHAT_TEMPLATE_ID` 的注释
   - 确保填入的是正确的模版 ID（形如 `xBxxxxxxxxxxxxxx`）

2. **模版字段不匹配**
   - 确保微信后台的模版内容为：`{{FROM.DATA}}`、`{{DESC.DATA}}`、`{{REMARK.DATA}}`
   - 字段名必须大写，与代码中完全一致
   - 如果使用了其他字段名（如 `title.DATA`），需要在请求时传入对应参数

3. **请求参数为空**
   - 发送请求时确保至少提供 `desc` 参数
   - 检查 `.dev.vars` 中的 `DEFAULT_*` 配置是否正确

4. **查看错误日志**
   - 使用 `npx wrangler tail` 查看实时日志
   - 检查微信 API 返回的 `errcode` 和 `errmsg`

### Q: 端口被占用怎么办？

A: 使用其他端口：

```bash
wrangler dev --port 3000
```

### Q: 看不到日志怎么办？

A: 在代码中添加 `console.log`，wrangler dev 会自动显示。

## 下一步

- 查看 [LOCAL_TESTING.md](./LOCAL_TESTING.md) 了解详细测试方法
- 查看 [README.md](../README.md) 了解完整功能
- 准备部署：`wrangler deploy`

## 需要帮助？

- 查看 [CLAUDE.md](../CLAUDE.md) 了解项目架构
- 查看 [.agentdocs/index.md](../.agentdocs/index.md) 了解技术细节
