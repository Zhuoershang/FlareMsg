/**
 * FlareMsg - Cloudflare Workers 微信消息推送服务
 *
 * 主要功能：
 * 1. 接收 HTTP POST 请求
 * 2. 自动管理微信 Access Token（KV 缓存 + 自动刷新）
 * 3. 发送微信模版消息
 */

// 环境变量类型定义
interface Env {
  // KV Namespace (动态 binding)
  [key: string]: any;  // 支持动态访问 KV binding

  // Secrets
  WECHAT_APP_ID: string;
  WECHAT_APP_SECRET: string;
  CLIENT_AUTH_TOKEN: string;

  // 配置变量
  WECHAT_TEMPLATE_ID: string;
  KV_BINDING_NAME?: string;  // KV Namespace 的 binding 名称（默认: "WECHAT_KV"）
  DEFAULT_FROM?: string;
  DEFAULT_DESC?: string;
  DEFAULT_REMARK?: string;
  DEFAULT_URL?: string;
  COLOR_FROM?: string;
  COLOR_DESC?: string;
  COLOR_REMARK?: string;
}

// 请求体类型定义
interface RequestBody {
  token?: string;
  openid: string;
  from?: string;
  desc?: string;
  remark?: string;
  url?: string;
}

// 消息 Payload 类型定义
interface MessagePayload {
  openid: string;
  from?: string;
  desc?: string;
  remark?: string;
  url?: string;
}

// 微信 API 响应类型
interface WechatApiResponse {
  errcode: number;
  errmsg: string;
  msgid?: number;
  access_token?: string;
}

// 微信模版消息 Payload 类型
interface WechatTemplatePayload {
  touser: string;
  template_id: string;
  url: string;
  data: {
    FROM: { value: string; color: string };
    DESC: { value: string; color: string };
    REMARK: { value: string; color: string };
  };
}

// 首页 HTML 页面
const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlareMsg - 微信消息推送</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --wechat-green: #07C160;
            --wechat-green-dark: #06AD56;
            --wechat-green-light: #1DB954;
            --bg-dark: #0D1117;
            --bg-card: #161B22;
            --bg-input: #0D1117;
            --border-color: #30363D;
            --text-primary: #F0F6FC;
            --text-secondary: #8B949E;
            --text-muted: #6E7681;
            --error: #F85149;
            --success: #3FB950;
            --warning: #D29922;
            --glow-green: rgba(7, 193, 96, 0.4);
            --glow-blue: rgba(88, 166, 255, 0.3);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg-dark);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            position: relative;
            overflow-x: hidden;
        }

        /* Animated background particles */
        .particles {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: hidden;
            z-index: 0;
        }

        .particle {
            position: absolute;
            width: 4px;
            height: 4px;
            background: var(--wechat-green);
            border-radius: 50%;
            opacity: 0.3;
            animation: float 15s infinite ease-in-out;
        }

        .particle:nth-child(1) { left: 10%; animation-delay: 0s; }
        .particle:nth-child(2) { left: 20%; animation-delay: 1s; }
        .particle:nth-child(3) { left: 30%; animation-delay: 2s; }
        .particle:nth-child(4) { left: 40%; animation-delay: 3s; }
        .particle:nth-child(5) { left: 50%; animation-delay: 4s; }
        .particle:nth-child(6) { left: 60%; animation-delay: 5s; }
        .particle:nth-child(7) { left: 70%; animation-delay: 6s; }
        .particle:nth-child(8) { left: 80%; animation-delay: 7s; }
        .particle:nth-child(9) { left: 90%; animation-delay: 8s; }

        @keyframes float {
            0%, 100% {
                transform: translateY(100vh) scale(0);
                opacity: 0;
            }
            10% {
                opacity: 0.3;
                transform: translateY(80vh) scale(1);
            }
            90% {
                opacity: 0.3;
                transform: translateY(10vh) scale(1);
            }
            100% {
                transform: translateY(0) scale(0);
                opacity: 0;
            }
        }

        /* Gradient orbs */
        .orb {
            position: fixed;
            border-radius: 50%;
            filter: blur(120px);
            opacity: 0.15;
            z-index: 0;
            animation: orb-pulse 8s infinite ease-in-out;
        }

        .orb-1 {
            width: 400px;
            height: 400px;
            background: var(--wechat-green);
            top: -100px;
            left: -100px;
        }

        .orb-2 {
            width: 300px;
            height: 300px;
            background: #58A6FF;
            bottom: -50px;
            right: -50px;
            animation-delay: -4s;
        }

        @keyframes orb-pulse {
            0%, 100% { transform: scale(1); opacity: 0.15; }
            50% { transform: scale(1.2); opacity: 0.2; }
        }

        /* Main container */
        .container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 520px;
        }

        /* Card with glass effect */
        .card {
            background: rgba(22, 27, 34, 0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 48px 40px;
            box-shadow:
                0 32px 64px rgba(0, 0, 0, 0.4),
                0 0 0 1px rgba(255, 255, 255, 0.05) inset;
        }

        /* Header */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .logo {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, var(--wechat-green) 0%, var(--wechat-green-dark) 100%);
            border-radius: 20px;
            margin-bottom: 20px;
            box-shadow:
                0 8px 32px var(--glow-green),
                0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            animation: logo-glow 3s infinite ease-in-out;
        }

        .logo svg {
            width: 40px;
            height: 40px;
            fill: white;
        }

        @keyframes logo-glow {
            0%, 100% { box-shadow: 0 8px 32px var(--glow-green), 0 0 0 1px rgba(255, 255, 255, 0.1) inset; }
            50% { box-shadow: 0 8px 48px var(--glow-green), 0 0 0 1px rgba(255, 255, 255, 0.1) inset; }
        }

        .header h1 {
            font-family: 'Outfit', sans-serif;
            font-size: 28px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 8px;
            letter-spacing: -0.5px;
        }

        .header p {
            font-family: 'Outfit', sans-serif;
            font-size: 15px;
            color: var(--text-secondary);
            font-weight: 400;
        }

        /* Status indicator */
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(7, 193, 96, 0.1);
            border: 1px solid rgba(7, 193, 96, 0.3);
            border-radius: 20px;
            margin-top: 16px;
            font-size: 12px;
            color: var(--wechat-green);
            font-weight: 500;
        }

        .status-badge::before {
            content: '';
            width: 6px;
            height: 6px;
            background: var(--wechat-green);
            border-radius: 50%;
            animation: pulse-dot 2s infinite;
        }

        @keyframes pulse-dot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
        }

        /* Form */
        .form {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .form-group {
            position: relative;
        }

        .form-group label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: 'Outfit', sans-serif;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-secondary);
            margin-bottom: 10px;
            letter-spacing: 0.3px;
        }

        .form-group label .required {
            color: var(--error);
            font-weight: 600;
        }

        .input-wrapper {
            position: relative;
        }

        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 16px 18px;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            font-family: 'Outfit', sans-serif;
            font-size: 15px;
            color: var(--text-primary);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            letter-spacing: 0.2px;
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
            color: var(--text-muted);
        }

        .form-group input:hover,
        .form-group textarea:hover {
            border-color: rgba(7, 193, 96, 0.4);
        }

        .form-group input:focus,
        .form-group textarea:focus {
            outline: none;
            border-color: var(--wechat-green);
            box-shadow: 0 0 0 4px var(--glow-green);
        }

        .form-group textarea {
            resize: vertical;
            min-height: 120px;
            line-height: 1.6;
        }

        .form-group small {
            display: block;
            margin-top: 8px;
            font-size: 12px;
            color: var(--text-muted);
            font-family: 'Outfit', sans-serif;
        }

        /* Icon inside input */
        .input-icon {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            pointer-events: none;
            transition: color 0.3s;
        }

        .form-group input:focus + .input-icon,
        .input-wrapper:focus-within .input-icon {
            color: var(--wechat-green);
        }

        /* Submit button */
        .btn-submit {
            position: relative;
            width: 100%;
            padding: 18px 24px;
            background: linear-gradient(135deg, var(--wechat-green) 0%, var(--wechat-green-dark) 100%);
            color: white;
            border: none;
            border-radius: 14px;
            font-family: 'Outfit', sans-serif;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            overflow: hidden;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            margin-top: 8px;
            letter-spacing: 0.5px;
        }

        .btn-submit::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.5s;
        }

        .btn-submit:hover::before {
            left: 100%;
        }

        .btn-submit:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px var(--glow-green);
        }

        .btn-submit:active {
            transform: translateY(0);
        }

        .btn-submit:disabled {
            background: var(--border-color);
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }

        .btn-submit:disabled::before {
            display: none;
        }

        .btn-submit .spinner {
            display: none;
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
        }

        .btn-submit.loading .spinner {
            display: inline-block;
        }

        .btn-submit.loading .btn-text {
            opacity: 0.8;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* Alert */
        .alert {
            padding: 16px 20px;
            border-radius: 12px;
            display: none;
            align-items: flex-start;
            gap: 12px;
            animation: alert-slide 0.3s ease-out;
        }

        @keyframes alert-slide {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .alert.show {
            display: flex;
        }

        .alert.success {
            background: rgba(63, 185, 80, 0.1);
            border: 1px solid rgba(63, 185, 80, 0.3);
            color: var(--success);
        }

        .alert.error {
            background: rgba(248, 81, 73, 0.1);
            border: 1px solid rgba(248, 81, 73, 0.3);
            color: var(--error);
        }

        .alert-icon {
            flex-shrink: 0;
            width: 20px;
            height: 20px;
        }

        .alert.success .alert-icon {
            fill: var(--success);
        }

        .alert.error .alert-icon {
            fill: var(--error);
        }

        .alert-content {
            flex: 1;
        }

        .alert-title {
            font-weight: 600;
            margin-bottom: 4px;
            font-family: 'Outfit', sans-serif;
        }

        .alert-message {
            font-size: 14px;
            opacity: 0.9;
            font-family: 'Outfit', sans-serif;
        }

        /* Footer */
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid var(--border-color);
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 24px;
        }

        .footer-links a {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 13px;
            font-family: 'Outfit', sans-serif;
            transition: color 0.3s;
        }

        .footer-links a:hover {
            color: var(--wechat-green);
        }

        .footer-links a svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }

        .copyright {
            margin-top: 16px;
            font-size: 12px;
            color: var(--text-muted);
            font-family: 'Outfit', sans-serif;
        }

        /* Quick preset buttons */
        .preset-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .preset-btn {
            padding: 6px 12px;
            background: rgba(7, 193, 96, 0.1);
            border: 1px solid rgba(7, 193, 96, 0.2);
            border-radius: 8px;
            color: var(--wechat-green);
            font-size: 12px;
            font-family: 'Outfit', sans-serif;
            cursor: pointer;
            transition: all 0.3s;
        }

        .preset-btn:hover {
            background: rgba(7, 193, 96, 0.2);
            border-color: rgba(7, 193, 96, 0.4);
        }

        /* Responsive */
        @media (max-width: 640px) {
            .card {
                padding: 32px 24px;
            }

            .header h1 {
                font-size: 24px;
            }

            .logo {
                width: 60px;
                height: 60px;
            }

            .logo svg {
                width: 32px;
                height: 32px;
            }

            .footer-links {
                flex-direction: column;
                gap: 12px;
            }
        }
    </style>
</head>
<body>
    <!-- Animated background -->
    <div class="particles">
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
        <div class="particle"></div>
    </div>

    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>

    <div class="container">
        <div class="card">
            <div class="header">
                <div class="logo">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.326-1.233a.492.492 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122zm-3.798 3.387a.68.68 0 0 0-.68-.68.68.68 0 0 0-.68.68.68.68 0 0 0 .68.68.68.68 0 0 0 .68-.68zm4.742 0a.68.68 0 0 0-.68-.68.68.68 0 0 0-.68.68.68.68 0 0 0 .68.68.68.68 0 0 0 .68-.68z"/>
                    </svg>
                </div>
                <h1>FlareMsg</h1>
                <p>微信消息推送服务</p>
                <div class="status-badge">就绪</div>
            </div>

            <div id="alert" class="alert">
                <svg class="alert-icon" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <div class="alert-content">
                    <div class="alert-title"></div>
                    <div class="alert-message"></div>
                </div>
            </div>

            <form id="messageForm">
                <div class="preset-bar">
                    <button type="button" class="preset-btn" data-preset="system">系统通知</button>
                    <button type="button" class="preset-btn" data-preset="alert">告警消息</button>
                    <button type="button" class="preset-btn" data-preset="info">信息推送</button>
                </div>

                <div class="form-group">
                    <label for="token">鉴权密钥 <span class="required">*</span></label>
                    <div class="input-wrapper">
                        <input type="password" id="token" name="token" required placeholder="请输入 CLIENT_AUTH_TOKEN">
                        <svg class="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                </div>

                <div class="form-group">
                    <label for="openid">微信 OpenID <span class="required">*</span></label>
                    <div class="input-wrapper">
                        <input type="text" id="openid" name="openid" required placeholder="请输入接收者的微信 OpenID">
                        <svg class="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                    </div>
                    <small>消息接收者的微信 OpenID，可在测试号页面获取</small>
                </div>

                <div class="form-group">
                    <label for="from">消息来源</label>
                    <div class="input-wrapper">
                        <input type="text" id="from" name="from" placeholder="例如：系统监控">
                        <svg class="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                            <polyline points="9,22 9,12 15,12 15,22"/>
                        </svg>
                    </div>
                </div>

                <div class="form-group">
                    <label for="desc">消息内容 <span class="required">*</span></label>
                    <textarea id="desc" name="desc" required placeholder="请输入要发送的消息内容..."></textarea>
                    <small>消息的主要内容，将显示在模版消息的正文部分</small>
                </div>

                <div class="form-group">
                    <label for="remark">备注信息</label>
                    <div class="input-wrapper">
                        <input type="text" id="remark" name="remark" placeholder="例如：请及时查看处理">
                        <svg class="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14,2 14,8 20,8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                    </div>
                </div>

                <div class="form-group">
                    <label for="url">跳转链接</label>
                    <div class="input-wrapper">
                        <input type="url" id="url" name="url" placeholder="https://example.com">
                        <svg class="input-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                        </svg>
                    </div>
                    <small>点击消息卡片后跳转的链接，可留空</small>
                </div>

                <button type="submit" class="btn-submit" id="submitBtn">
                    <span class="spinner"></span>
                    <span class="btn-text">发送消息</span>
                </button>
            </form>

            <div class="footer">
                <div class="footer-links">
                    <a href="https://github.com/sarices/FlareMsg" target="_blank">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        GitHub
                    </a>
                    <a href="https://github.com/sarices/FlareMsg/issues" target="_blank">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                        反馈问题
                    </a>
                </div>
                <p class="copyright">Powered by Cloudflare Workers</p>
            </div>
        </div>
    </div>

    <script>
        const form = document.getElementById('messageForm');
        const submitBtn = document.getElementById('submitBtn');
        const alertEl = document.getElementById('alert');

        // Preset configurations
        const presets = {
            system: { from: '系统通知', remark: '来自系统自动推送' },
            alert: { from: '⚠️ 告警通知', remark: '请立即处理！' },
            info: { from: '信息推送', remark: '' }
        };

        // Load saved credentials
        window.addEventListener('DOMContentLoaded', () => {
            const savedToken = localStorage.getItem('flaremsg_token');
            const savedOpenid = localStorage.getItem('flaremsg_openid');
            if (savedToken) document.getElementById('token').value = savedToken;
            if (savedOpenid) document.getElementById('openid').value = savedOpenid;

            document.querySelectorAll('.preset-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const preset = presets[btn.dataset.preset];
                    if (preset.from) document.getElementById('from').value = preset.from;
                    if (preset.remark) document.getElementById('remark').value = preset.remark;
                });
            });
        });

        // Show alert
        function showAlert(title, message, type) {
            const iconPath = type === 'success'
                ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z'
                : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';
            alertEl.innerHTML = '<svg class="alert-icon" viewBox="0 0 24 24"><path d="' + iconPath + '"/></svg><div class="alert-content"><div class="alert-title">' + title + '</div><div class="alert-message">' + message + '</div></div>';
            alertEl.className = 'alert ' + type + ' show';
            setTimeout(() => alertEl.classList.remove('show'), 5000);
        }

        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            submitBtn.classList.add('loading');
            submitBtn.querySelector('.btn-text').textContent = '发送中...';
            submitBtn.disabled = true;

            const data = {
                token: document.getElementById('token').value,
                openid: document.getElementById('openid').value,
                from: document.getElementById('from').value || undefined,
                desc: document.getElementById('desc').value,
                remark: document.getElementById('remark').value || undefined,
                url: document.getElementById('url').value || undefined
            };

            localStorage.setItem('flaremsg_token', data.token);
            localStorage.setItem('flaremsg_openid', data.openid);

            try {
                const response = await fetch('/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (response.ok && result.errcode === 0) {
                    showAlert('消息发送成功！', '消息 ID: ' + result.msgid, 'success');
                    document.getElementById('desc').value = '';
                } else {
                    showAlert('发送失败', result.errmsg || '未知错误', 'error');
                }
            } catch (error) {
                showAlert('网络错误', error.message, 'error');
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.querySelector('.btn-text').textContent = '发送消息';
                submitBtn.disabled = false;
            }
        });
    </script>
</body>
</html>`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // GET 请求返回首页
    if (request.method === 'GET') {
      return new Response(INDEX_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // POST 请求处理消息发送
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({
        errcode: -1,
        errmsg: 'Only GET and POST methods are allowed'
      }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // 解析请求体
      const body = await request.json() as RequestBody;

      // 鉴权：检查 token（支持 body 或 header）
      const clientToken = body.token || request.headers.get('Authorization')?.replace('Bearer ', '');
      if (!clientToken || clientToken !== env.CLIENT_AUTH_TOKEN) {
        return new Response(JSON.stringify({
          errcode: -1,
          errmsg: 'Unauthorized: Invalid token'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 验证必填参数
      if (!body.openid) {
        return new Response(JSON.stringify({
          errcode: -1,
          errmsg: 'Missing required parameter: openid'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 调用发送消息函数
      const result = await sendWechatMessage(env, {
        openid: body.openid,
        from: body.from,
        desc: body.desc,
        remark: body.remark,
        url: body.url
      });

      return new Response(JSON.stringify(result), {
        status: result.errcode === 0 ? 200 : 500,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(JSON.stringify({
        errcode: -1,
        errmsg: `Server error: ${errorMessage}`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

/**
 * 获取 KV Namespace 实例
 * @param env - 环境变量
 * @returns KV Namespace 实例
 */
function getKV(env: Env): KVNamespace {
  const bindingName = env.KV_BINDING_NAME || 'WECHAT_KV';
  const kv = env[bindingName] as KVNamespace;

  if (!kv) {
    throw new Error(`KV Namespace binding "${bindingName}" not found. Please check your wrangler.toml configuration.`);
  }

  return kv;
}

/**
 * 获取微信 Access Token
 * @param env - 环境变量
 * @param forceRefresh - 是否强制刷新
 * @returns Access Token
 */
async function getAccessToken(env: Env, forceRefresh: boolean = false): Promise<string> {
  const kv = getKV(env);
  const KV_KEY = 'access_token';

  // 如果不强制刷新，先尝试从 KV 读取
  if (!forceRefresh) {
    const cachedToken = await kv.get(KV_KEY);
    if (cachedToken) {
      return cachedToken;
    }
  }

  // 请求新的 Access Token
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`;

  const response = await fetch(tokenUrl);
  const data = await response.json() as WechatApiResponse;

  if (data.access_token) {
    // 存入 KV，TTL 设置为 7000 秒（略低于微信官方的 7200 秒）
    await kv.put(KV_KEY, data.access_token, {
      expirationTtl: 7000
    });
    return data.access_token;
  } else {
    throw new Error(`Failed to get access token: ${data.errmsg || 'Unknown error'}`);
  }
}

/**
 * 发送微信模版消息
 * @param env - 环境变量
 * @param payload - 消息内容 {openid, from, desc, remark, url}
 * @param isRetry - 是否为重试请求
 * @returns 微信 API 响应
 */
async function sendWechatMessage(
  env: Env,
  payload: MessagePayload,
  isRetry: boolean = false
): Promise<WechatApiResponse> {
  // 获取 Access Token
  const accessToken = await getAccessToken(env, false);

  // 应用三级优先级：请求参数 > 环境变量 > 默认值
  const from = payload.from || env.DEFAULT_FROM || '系统通知';
  const desc = payload.desc || env.DEFAULT_DESC || '无内容';
  const remark = payload.remark || env.DEFAULT_REMARK || '';
  const url = payload.url || env.DEFAULT_URL || '';

  // 构造微信模版消息 payload
  const wechatPayload: WechatTemplatePayload = {
    touser: payload.openid,
    template_id: env.WECHAT_TEMPLATE_ID,
    url: url,
    data: {
      FROM: {
        value: from,
        color: env.COLOR_FROM || '#173177'
      },
      DESC: {
        value: desc,
        color: env.COLOR_DESC || '#000000'
      },
      REMARK: {
        value: remark,
        color: env.COLOR_REMARK || '#888888'
      }
    }
  };

  // 调用微信 API
  const apiUrl = `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${accessToken}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(wechatPayload)
  });

  const result = await response.json() as WechatApiResponse;

  // Token 失效自动重试逻辑
  if (result.errcode === 40001 && !isRetry) {
    // Token 无效，删除 KV 缓存并重试
    const kv = getKV(env);
    await kv.delete('access_token');
    return await sendWechatMessage(env, payload, true);
  }

  return result;
}
