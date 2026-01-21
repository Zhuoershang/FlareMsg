/**
 * FlareMsg - Cloudflare Workers 微信消息推送服务
 *
 * 主要功能：
 * 1. 接收 HTTP GET/POST 请求
 * 2. 自动管理微信 Access Token（KV 缓存 + 自动刷新）
 * 3. 发送微信模版消息
 *
 * 鉴权机制：
 * - 全局 Token：使用 CLIENT_AUTH_TOKEN 进行全局鉴权，需提供 openid 参数
 * - 用户 Token：sk_XXX 形式的 token，存储在 KV 中，值为对应的 openid，无需提供 openid 参数
 */

// 首页 HTML 常量
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
        /* 暗黑主题（默认） */
        :root {
            --wechat-green: #07C160;
            --wechat-green-dark: #06AD56;
            --wechat-green-light: #1DB954;
            --bg-primary: #0D1117;
            --bg-secondary: #161B22;
            --bg-tertiary: #21262D;
            --bg-input: #0D1117;
            --border-color: #30363D;
            --border-hover: #8B949E;
            --text-primary: #F0F6FC;
            --text-secondary: #8B949E;
            --text-muted: #6E7681;
            --error: #F85149;
            --success: #3FB950;
            --warning: #D29922;
            --glow-green: rgba(7, 193, 96, 0.4);
            --glow-blue: rgba(88, 166, 255, 0.3);
            --shadow-card: 0 32px 64px rgba(0, 0, 0, 0.4);
            --shadow-button: 0 12px 40px var(--glow-green);
        }

        /* 浅色主题 */
        .light-mode {
            --bg-primary: #FFFFFF;
            --bg-secondary: #F6F8FA;
            --bg-tertiary: #EAECEF;
            --bg-input: #FFFFFF;
            --border-color: #D0D7DE;
            --border-hover: #57606A;
            --text-primary: #24292F;
            --text-secondary: #57606A;
            --text-muted: #8B949E;
            --shadow-card: 0 2px 16px rgba(0, 0, 0, 0.08);
            --shadow-button: 0 4px 24px rgba(7, 193, 96, 0.3);
        }

        /* 主题切换按钮 */
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 1000;
            box-shadow: var(--shadow);
        }

        .theme-toggle:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        }

        .theme-toggle svg {
            width: 20px;
            height: 20px;
            transition: transform 0.3s ease;
        }

        .theme-toggle .sun-icon {
            display: none;
        }

        .theme-toggle .moon-icon {
            display: block;
        }

        .light-mode .theme-toggle .sun-icon {
            display: block;
        }

        .light-mode .theme-toggle .moon-icon {
            display: none;
        }

        @media (max-width: 768px) {
            .theme-toggle {
                top: 12px;
                right: 12px;
                width: 40px;
                height: 40px;
            }

            .theme-toggle svg {
                width: 18px;
                height: 18px;
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            position: relative;
            overflow-x: hidden;
            transition: background 0.3s ease, color 0.3s ease;
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
            background: var(--bg-secondary);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 48px 40px;
            box-shadow: var(--shadow-card);
            transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
        }

        @media (max-width: 768px) {
            .card {
                padding: 32px 24px;
                border-radius: 20px;
            }
        }

        @media (max-width: 480px) {
            .card {
                padding: 24px 16px;
                border-radius: 16px;
            }
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

        /* Responsive Design */
        @media (max-width: 768px) {
            body {
                padding: 12px;
            }

            .card {
                padding: 32px 24px;
                border-radius: 20px;
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

            .preset-bar {
                flex-direction: column;
                gap: 8px;
            }

            .preset-btn {
                width: 100%;
                text-align: center;
            }
        }

        @media (max-width: 480px) {
            body {
                padding: 8px;
            }

            .card {
                padding: 24px 16px;
                border-radius: 16px;
            }

            .header h1 {
                font-size: 22px;
            }

            .header p {
                font-size: 14px;
            }

            .btn-submit {
                padding: 16px 20px;
                font-size: 15px;
            }

            .form-group input,
            .form-group textarea {
                padding: 14px 16px;
                font-size: 14px;
            }

            .footer-links {
                flex-direction: column;
                gap: 12px;
            }

            .footer-links a {
                justify-content: center;
            }
        }

        /* 触摸优化 */
        @media (hover: none) and (pointer: coarse) {
            .btn-submit:hover {
                transform: none;
            }

            .btn-submit:active {
                transform: scale(0.98);
            }

            .preset-btn:hover {
                background: rgba(7, 193, 96, 0.1);
                border-color: rgba(7, 193, 96, 0.2);
            }

            .preset-btn:active {
                background: rgba(7, 193, 96, 0.2);
                transform: scale(0.98);
            }
        }
    </style>
</head>
<body>
    <!-- Theme Toggle Button -->
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="切换主题">
        <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
        <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    </button>

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
                <div style="margin-top: 16px; font-size: 13px; color: #8b949e;">
                    <strong>API 端点:</strong> GET/POST <code style="background: #30363d; padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">/send</code>
                    <span style="margin: 0 8px;">|</span>
                    <a href="/admin" style="color: #58a6ff; text-decoration: none;">管理页面 →</a>
                </div>
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
                    <a href="/admin" target="_blank">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        管理页面
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

        // 主题切换功能
        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'light') {
                document.body.classList.add('light-mode');
            }
        }

        function toggleTheme() {
            const isLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }

        // 页面加载时初始化主题
        initTheme();

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

            // 清空现有内容
            alertEl.innerHTML = '';

            // 创建 icon SVG
            const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            iconSvg.setAttribute('class', 'alert-icon');
            iconSvg.setAttribute('viewBox', '0 0 24 24');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', iconPath);
            iconSvg.appendChild(path);

            // 创建内容容器
            const contentDiv = document.createElement('div');
            contentDiv.className = 'alert-content';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'alert-title';
            titleDiv.textContent = title;

            const messageDiv = document.createElement('div');
            messageDiv.className = 'alert-message';
            messageDiv.textContent = message;

            contentDiv.appendChild(titleDiv);
            contentDiv.appendChild(messageDiv);

            alertEl.appendChild(iconSvg);
            alertEl.appendChild(contentDiv);

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
                const response = await fetch('/send', {
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
</html>

`;

// 管理页面 HTML 常量
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Token 管理 - FlareMsg</title>
    <style>
        /* 暗黑主题（默认） */
        :root {
            --bg-primary: #0D1117;
            --bg-secondary: #161B22;
            --bg-tertiary: #21262D;
            --bg-input: #0D1117;
            --border-color: #30363D;
            --border-hover: #8B949E;
            --text-primary: #F0F6FC;
            --text-secondary: #8B949E;
            --text-muted: #6E7681;
            --primary: #07C160;
            --primary-hover: #06AD56;
            --danger: #DA3633;
            --danger-hover: #F85149;
            --success: #3FB950;
            --error: #F85149;
            --shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        /* 浅色主题 */
        .light-mode {
            --bg-primary: #FFFFFF;
            --bg-secondary: #F6F8FA;
            --bg-tertiary: #EAECEF;
            --bg-input: #FFFFFF;
            --border-color: #D0D7DE;
            --border-hover: #57606A;
            --text-primary: #24292F;
            --text-secondary: #57606A;
            --text-muted: #8B949E;
            --shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        /* 主题切换按钮 */
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            z-index: 1000;
            box-shadow: var(--shadow);
        }

        .theme-toggle:hover {
            transform: scale(1.05);
        }

        .theme-toggle svg {
            width: 20px;
            height: 20px;
            transition: transform 0.3s ease;
        }

        .theme-toggle .sun-icon {
            display: none;
        }

        .theme-toggle .moon-icon {
            display: block;
        }

        .light-mode .theme-toggle .sun-icon {
            display: block;
        }

        .light-mode .theme-toggle .moon-icon {
            display: none;
        }

        @media (max-width: 768px) {
            .theme-toggle {
                top: 12px;
                right: 12px;
                width: 40px;
                height: 40px;
            }

            .theme-toggle svg {
                width: 18px;
                height: 18px;
            }
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            padding: 20px;
            transition: background 0.3s ease, color 0.3s ease;
        }

        @media (max-width: 768px) {
            body {
                padding: 12px;
            }
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border-color);
            transition: border-color 0.3s ease;
        }

        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            transition: color 0.3s ease;
        }

        .header a {
            color: var(--primary);
            text-decoration: none;
            transition: color 0.3s ease;
        }

        .header a:hover {
            text-decoration: underline;
        }

        .auth-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 30px;
            transition: background 0.3s ease, border-color 0.3s ease;
        }

        @media (max-width: 768px) {
            .auth-section {
                padding: 20px;
                border-radius: 10px;
            }
        }

        .auth-section h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: var(--text-primary);
        }

        .input-group {
            margin-bottom: 16px;
        }

        .input-group label {
            display: block;
            margin-bottom: 8px;
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            background: var(--bg-input);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--text-primary);
            font-size: 15px;
            transition: all 0.2s ease;
        }

        input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(7, 193, 96, 0.1);
        }

        @media (max-width: 768px) {
            input[type="text"],
            input[type="password"] {
                font-size: 16px; /* 防止 iOS 自动缩放 */
            }
        }

        button {
            padding: 12px 24px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        button:hover {
            background: var(--primary-hover);
            transform: translateY(-1px);
            box-shadow: var(--shadow);
        }

        button:active {
            transform: translateY(0);
        }

        button:disabled {
            background: var(--border-color);
            cursor: not-allowed;
            transform: none;
        }

        @media (hover: none) {
            button:hover {
                transform: none;
            }

            button:active {
                transform: scale(0.98);
            }
        }

        button.danger {
            background: var(--danger);
        }

        button.danger:hover {
            background: var(--danger-hover);
        }

        .content {
            display: none;
        }

        .content.visible {
            display: block;
        }

        .add-token-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 30px;
            transition: background 0.3s ease, border-color 0.3s ease;
        }

        @media (max-width: 768px) {
            .add-token-section {
                padding: 20px;
            }
        }

        .add-token-section h2 {
            font-size: 18px;
            margin-bottom: 12px;
            color: var(--text-primary);
        }

        .add-token-section p {
            color: var(--text-secondary);
            margin-bottom: 16px;
            font-size: 14px;
            line-height: 1.5;
        }

        .token-list {
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            transition: background 0.3s ease, border-color 0.3s ease;
        }

        @media (max-width: 768px) {
            .token-list {
                padding: 20px;
            }
        }

        .token-list h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: var(--text-primary);
        }

        .token-item {
            display: flex;
            align-items: center;
            padding: 16px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 12px;
            transition: background 0.3s ease, border-color 0.3s ease;
        }

        @media (max-width: 768px) {
            .token-item {
                flex-direction: column;
                align-items: flex-start;
                gap: 12px;
                padding: 12px;
            }

            .token-info {
                margin-right: 0 !important;
                width: 100% !important;
            }

            .token-actions {
                width: 100%;
                flex-direction: column;
                gap: 8px;
            }

            .token-actions button {
                width: 100%;
            }
        }

        .token-info {
            flex: 1;
            margin-right: 20px;
            min-width: 0;
        }

        .token-key {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 15px;
            margin-bottom: 6px;
            color: var(--primary);
            word-break: break-all;
        }

        .token-value {
            font-size: 13px;
            color: var(--text-secondary);
            word-break: break-all;
        }

        .token-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }

        @media (max-width: 480px) {
            .token-actions {
                flex-direction: column;
                width: 100%;
            }

            .token-actions button {
                width: 100%;
            }
        }

        .alert {
            padding: 14px 18px;
            border-radius: 8px;
            margin-bottom: 20px;
            display: none;
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
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
            display: block;
        }

        .alert.success {
            background: rgba(63, 185, 80, 0.1);
            border: 1px solid rgba(63, 185, 80, 0.3);
            color: var(--success);
        }

        .alert.error {
            background: rgba(218, 54, 51, 0.1);
            border: 1px solid rgba(218, 54, 51, 0.3);
            color: var(--error);
        }

        .empty-state {
            text-align: center;
            padding: 48px 24px;
            color: var(--text-secondary);
        }

        @media (max-width: 768px) {
            .empty-state {
                padding: 32px 16px;
            }
        }

        /* 触摸优化 */
        @media (hover: none) and (pointer: coarse) {
            button {
                min-height: 44px; /* 推荐的触摸目标最小尺寸 */
                font-size: 16px;
            }

            button:active {
                transform: scale(0.98);
            }
        }
    </style>
</head>
<body>
    <!-- Theme Toggle Button -->
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="切换主题">
        <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
        <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    </button>

    <div class="container">
        <div class="header">
            <h1>🔑 Token 管理</h1>
            <a href="/">← 返回首页</a>
        </div>

        <div id="authSection" class="auth-section">
            <h2>身份验证</h2>
            <div class="input-group">
                <label for="adminToken">管理员 Token (CLIENT_AUTH_TOKEN)</label>
                <input type="password" id="adminToken" placeholder="请输入管理员 Token">
            </div>
            <button onclick="login()">登录</button>
        </div>

        <div id="content" class="content">
            <div id="alert" class="alert"></div>

            <div class="add-token-section">
                <h2>添加用户 Token</h2>
                <p style="color: #8b949e; margin-bottom: 15px;">输入用户的 OpenID，系统将自动生成 sk_ 开头的 Token</p>
                <div class="input-group">
                    <label for="openid">用户 OpenID</label>
                    <input type="text" id="openid" placeholder="例如：oxxxxxxxxxxxxxxxxxxxxxxx">
                </div>
                <button onclick="addToken()">添加 Token</button>
            </div>

            <div class="token-list">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h2 style="margin: 0;">用户 Token 列表</h2>
                    <button onclick="loadTokens()" style="padding: 8px 16px; font-size: 14px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; color: var(--text-primary);">🔄 刷新</button>
                </div>
                <div id="tokenStats" style="color: var(--text-secondary); font-size: 13px; margin-bottom: 10px;"></div>
                <div id="tokenList"></div>
            </div>
        </div>
    </div>

    <script>
        // 主题切换功能
        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'light') {
                document.body.classList.add('light-mode');
            }
        }

        function toggleTheme() {
            const isLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        }

        // 页面加载时初始化主题
        initTheme();

        let authToken = '';

        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.textContent = message;
            alert.className = 'alert ' + type + ' show';
            setTimeout(() => alert.classList.remove('show'), 5000);
        }

        async function login() {
            const token = document.getElementById('adminToken').value.trim();
            if (!token) {
                showAlert('请输入管理员 Token', 'error');
                return;
            }

            try {
                const response = await fetch('/admin/api/tokens', {
                    headers: {
                        'Authorization': 'Bearer ' + token
                    }
                });

                if (response.ok) {
                    authToken = token;
                    document.getElementById('authSection').style.display = 'none';
                    document.getElementById('content').classList.add('visible');
                    loadTokens();
                } else {
                    const data = await response.json();
                    showAlert(data.error || '认证失败', 'error');
                }
            } catch (error) {
                showAlert('网络错误: ' + error.message, 'error');
            }
        }

        async function loadTokens() {
            const container = document.getElementById('tokenList');
            const stats = document.getElementById('tokenStats');

            // 显示加载状态
            container.textContent = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'empty-state';
            loadingDiv.textContent = '⏳ 正在加载...';
            container.appendChild(loadingDiv);
            stats.textContent = '';

            try {
                console.log('[DEBUG] Fetching tokens from /admin/api/tokens');
                const response = await fetch('/admin/api/tokens', {
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
                });

                console.log('[DEBUG] Response status:', response.status);
                console.log('[DEBUG] Response ok:', response.ok);

                if (response.ok) {
                    const data = await response.json();
                    console.log('[DEBUG] Response data:', data);
                    displayTokens(data.tokens);
                    stats.textContent = '共找到 ' + data.tokens.length + ' 个 Token';
                } else {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    console.error('[ERROR] Failed to load tokens:', errorData);
                    showAlert('加载 Token 列表失败', 'error');
                    container.textContent = '';
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'empty-state';
                    errorDiv.textContent = '❌ 加载失败';
                    container.appendChild(errorDiv);
                }
            } catch (error) {
                console.error('[ERROR] Network error:', error);
                showAlert('网络错误', 'error');
                container.textContent = '';
                const errorDiv = document.createElement('div');
                errorDiv.className = 'empty-state';
                errorDiv.textContent = '❌ 网络错误';
                container.appendChild(errorDiv);
            }
        }

        function displayTokens(tokens) {
            const container = document.getElementById('tokenList');

            if (tokens.length === 0) {
                container.textContent = '';
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-state';
                emptyDiv.textContent = '暂无用户 Token';
                container.appendChild(emptyDiv);
                return;
            }

            // 清空容器并使用 DOM 操作创建元素
            container.textContent = '';

            tokens.forEach(token => {
                // 创建 token-item 容器
                const itemDiv = document.createElement('div');
                itemDiv.className = 'token-item';

                // 创建 token-info 容器
                const infoDiv = document.createElement('div');
                infoDiv.className = 'token-info';

                const keyDiv = document.createElement('div');
                keyDiv.className = 'token-key';
                keyDiv.textContent = token.key;

                const valueDiv = document.createElement('div');
                valueDiv.className = 'token-value';
                valueDiv.textContent = token.value;

                infoDiv.appendChild(keyDiv);
                infoDiv.appendChild(valueDiv);

                // 创建 token-actions 容器
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'token-actions';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'danger';
                deleteBtn.textContent = '删除';
                deleteBtn.onclick = () => deleteToken(token.key);

                const copyBtn = document.createElement('button');
                copyBtn.textContent = '复制 Token';
                copyBtn.onclick = () => copyToClipboard(token.key);

                actionsDiv.appendChild(deleteBtn);
                actionsDiv.appendChild(copyBtn);

                itemDiv.appendChild(infoDiv);
                itemDiv.appendChild(actionsDiv);

                container.appendChild(itemDiv);
            });
        }

        async function addToken() {
            const openid = document.getElementById('openid').value.trim();
            if (!openid) {
                showAlert('请输入用户 OpenID', 'error');
                return;
            }

            try {
                const response = await fetch('/admin/api/tokens', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ openid })
                });

                if (response.ok) {
                    const data = await response.json();
                    showAlert('Token 添加成功: ' + data.key, 'success');
                    document.getElementById('openid').value = '';
                    loadTokens();
                } else {
                    const data = await response.json();
                    showAlert(data.error || '添加失败', 'error');
                }
            } catch (error) {
                showAlert('网络错误: ' + error.message, 'error');
            }
        }

        async function deleteToken(key) {
            if (!confirm('确定要删除这个 Token 吗？')) return;

            try {
                const response = await fetch('/admin/api/tokens?' + new URLSearchParams({ key }), {
                    method: 'DELETE',
                    headers: {
                        'Authorization': 'Bearer ' + authToken
                    }
                });

                if (response.ok) {
                    showAlert('Token 删除成功', 'success');
                    loadTokens();
                } else {
                    const data = await response.json();
                    showAlert(data.error || '删除失败', 'error');
                }
            } catch (error) {
                showAlert('网络错误: ' + error.message, 'error');
            }
        }

        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                showAlert('Token 已复制到剪贴板', 'success');
            }).catch(() => {
                showAlert('复制失败', 'error');
            });
        }

        // 支持回车登录
        document.getElementById('adminToken').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });

        // 支持回车添加 Token
        document.getElementById('openid').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addToken();
        });
    </script>
</body>
</html>

`;

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
  RATE_LIMIT_RPM?: number;  // 全局 RPM 限制（每分钟请求数），0 或未设置表示不限制
  ALLOWED_ORIGIN?: string;  // CORS 允许的来源（默认: "*"）
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

// 安全常量
const SECURITY_CONSTANTS = {
  // 输入长度限制
  MAX_INPUT_LENGTH: 2000,
  MAX_OPENID_LENGTH: 100,
  MAX_URL_LENGTH: 500,

  // 安全响应头
  SECURITY_HEADERS: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  },

  // CORS 响应头
  CORS_HEADERS: {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }
};

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

/**
 * 创建安全的响应头
 * @param env - 环境变量
 * @param contentType - Content-Type
 * @param additionalHeaders - 额外的响应头
 * @returns 响应头对象
 */
function createSecureHeaders(
  env: Env,
  contentType: string = 'application/json',
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    ...SECURITY_CONSTANTS.SECURITY_HEADERS,
    ...additionalHeaders
  };

  // 添加 CORS 头（如果配置了允许的来源）
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';
  headers['Access-Control-Allow-Origin'] = allowedOrigin;
  Object.assign(headers, SECURITY_CONSTANTS.CORS_HEADERS);

  // 为 HTML 添加 CSP
  if (contentType.includes('text/html')) {
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'"
    ].join('; ');
  }

  return headers;
}

/**
 * 创建错误响应
 * @param message - 错误消息（对外显示的通用消息）
 * @param status - HTTP 状态码
 * @param env - 环境变量（可选）
 * @returns Response 对象
 */
function createErrorResponse(
  message: string,
  status: number,
  env?: Env
): Response {
  // 只返回通用错误信息，不暴露系统细节
  const errorMap: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error'
  };

  const publicMessage = errorMap[status] || 'Error';

  return new Response(JSON.stringify({
    errcode: -1,
    errmsg: publicMessage
  }), {
    status,
    headers: env
      ? createSecureHeaders(env, 'application/json')
      : { 'Content-Type': 'application/json' }
  });
}

/**
 * 验证输入参数
 * @param params - 请求参数
 * @returns 验证结果 { valid: boolean, error?: string }
 */
function validateInput(params: RequestBody): { valid: boolean; error?: string } {
  const { openid, from, desc, remark, url } = params;

  // 验证 openid
  if (openid && openid.length > SECURITY_CONSTANTS.MAX_OPENID_LENGTH) {
    return { valid: false, error: 'Invalid openid length' };
  }

  // 验证长度
  if (from && from.length > SECURITY_CONSTANTS.MAX_INPUT_LENGTH) {
    return { valid: false, error: 'From field too long' };
  }

  if (desc && desc.length > SECURITY_CONSTANTS.MAX_INPUT_LENGTH) {
    return { valid: false, error: 'Description field too long' };
  }

  if (remark && remark.length > SECURITY_CONSTANTS.MAX_INPUT_LENGTH) {
    return { valid: false, error: 'Remark field too long' };
  }

  if (url && url.length > SECURITY_CONSTANTS.MAX_URL_LENGTH) {
    return { valid: false, error: 'URL too long' };
  }

  // 验证 URL 格式（如果提供）
  if (url && url.trim() !== '') {
    try {
      new URL(url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  return { valid: true };
}


// 首页 HTML 页面
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 解析请求 URL
    const url = new URL(request.url);
    const path = url.pathname;

    // 配置验证：检查必需的环境变量
    if (!env.WECHAT_TEMPLATE_ID) {
      return createErrorResponse('Server configuration error: Missing WECHAT_TEMPLATE_ID', 500);
    }

    if (!env.CLIENT_AUTH_TOKEN) {
      return createErrorResponse('Server configuration error: Missing CLIENT_AUTH_TOKEN', 500);
    }

    // 根路径返回首页
    if (path === '/') {
      return new Response(INDEX_HTML, {
        status: 200,
        headers: createSecureHeaders(env, 'text/html; charset=utf-8', {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
      });
    }

    // 管理页面路由
    if (path === '/admin') {
      return new Response(ADMIN_HTML, {
        status: 200,
        headers: createSecureHeaders(env, 'text/html; charset=utf-8', {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
      });
    }

    // 处理 OPTIONS 请求（CORS 预检）
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: createSecureHeaders(env)
      });
    }

    // 全局 RPM 限制检查（对所有 API 接口生效）
    const rateLimitPassed = await checkRateLimit(env);
    if (!rateLimitPassed) {
      return new Response(JSON.stringify({
        errcode: -2,
        errmsg: 'Too Many Requests'
      }), {
        status: 429,
        headers: {
          ...createSecureHeaders(env, 'application/json'),
          'Retry-After': '60'
        }
      });
    }

    // 管理 API 路由
    if (path.startsWith('/admin/api/')) {
      return handleAdminAPI(request, env, url);
    }

    // /send 路径处理消息发送
    if (path === '/send') {
      // 支持 GET 和 POST 方法
      if (request.method !== 'GET' && request.method !== 'POST') {
        return createErrorResponse('Method not allowed', 405, env);
      }

      try {
        let params: RequestBody;

        // GET 请求：从 URL query 参数获取
        if (request.method === 'GET') {
          params = {
            token: url.searchParams.get('token') || undefined,
            openid: url.searchParams.get('openid') || '',
            from: url.searchParams.get('from') || undefined,
            desc: url.searchParams.get('desc') || undefined,
            remark: url.searchParams.get('remark') || undefined,
            url: url.searchParams.get('url') || undefined
          };
        } else {
          // POST 请求：从请求体获取
          params = await request.json() as RequestBody;
        }

        // 输入验证
        const validation = validateInput(params);
        if (!validation.valid) {
          return createErrorResponse(validation.error || 'Invalid input', 400, env);
        }

        // 鉴权：检查 token（支持参数、body 或 header）
        const clientToken = params.token || request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!clientToken) {
          return createErrorResponse('Unauthorized', 401, env);
        }

        let actualOpenid = params.openid;

        // 如果 token 以 sk_ 开头，从 KV 获取对应的 openid
        if (clientToken.startsWith('sk_')) {
          try {
            const kv = getKV(env);
            const openidFromKV = await kv.get(clientToken);

            if (!openidFromKV) {
              return createErrorResponse('Unauthorized', 401, env);
            }

            actualOpenid = openidFromKV;
          } catch (error) {
            console.error('[ERROR] KV access failed:', error);
            return createErrorResponse('Internal Server Error', 500, env);
          }
        } else {
          // 全局 token 鉴权
          if (clientToken !== env.CLIENT_AUTH_TOKEN) {
            return createErrorResponse('Unauthorized', 401, env);
          }
        }

        // 验证必填参数
        if (!actualOpenid) {
          return createErrorResponse('Bad Request', 400, env);
        }

        // 调用发送消息函数
        const result = await sendWechatMessage(env, {
          openid: actualOpenid,
          from: params.from,
          desc: params.desc,
          remark: params.remark,
          url: params.url
        });

        return new Response(JSON.stringify(result), {
          status: result.errcode === 0 ? 200 : 500,
          headers: createSecureHeaders(env, 'application/json')
        });

      } catch (error) {
        console.error('[ERROR] Message send failed:', error);
        return createErrorResponse('Internal Server Error', 500, env);
      }
    }

    // 404 - 其他路径
    return createErrorResponse('Not Found', 404, env);
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
    // 不暴露具体的 binding 名称
    throw new Error('KV Namespace not configured');
  }

  return kv;
}

/**
 * 检查全局 RPM 限制（改进的 fail-closed 策略）
 * @param env - 环境变量
 * @returns 是否通过限制检查（true 表示通过，false 表示超过限制或 KV 故障）
 */
async function checkRateLimit(env: Env): Promise<boolean> {
  const rpmLimit = env.RATE_LIMIT_RPM || 0;

  // 如果设置为 0 或未设置，表示不限制
  if (rpmLimit <= 0) {
    return true;
  }

  try {
    const kv = getKV(env);

    // 计算当前分钟的时间戳（从 Unix epoch 开始的分钟数）
    const currentMinute = Math.floor(Date.now() / 60000);
    const rateLimitKey = `rate_limit:${currentMinute}`;

    // 获取当前分钟的计数
    const currentCount = await kv.get(rateLimitKey);
    const count = currentCount ? parseInt(currentCount, 10) : 0;

    // 检查是否超过限制
    if (count >= rpmLimit) {
      console.warn(`[WARN] Rate limit exceeded: ${count}/${rpmLimit}`);
      return false;
    }

    // 增加计数，并设置 TTL 为 60 秒（自动过期）
    await kv.put(rateLimitKey, String(count + 1), {
      expirationTtl: 60
    });

    return true;
  } catch (error) {
    // KV 访问失败时，采用 fail-closed 策略，拒绝请求以保护系统
    console.error('[ERROR] Rate limit check failed (fail-closed):', error instanceof Error ? error.message : 'Unknown error');

    // 如果 RPM 限制已启用，KV 故障时拒绝请求
    // 这样可以在 KV 不可用时保护系统免受滥用
    return false;
  }
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
    try {
      const cachedToken = await kv.get(KV_KEY);
      if (cachedToken) {
        return cachedToken;
      }
    } catch (error) {
      // KV 读取失败（本地开发环境可能 KV 为空），忽略并继续请求新 token
      console.log('KV read failed, requesting new token:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // 请求新的 Access Token
  const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`;

  const response = await fetch(tokenUrl);
  const data = await response.json() as WechatApiResponse;

  if (data.access_token) {
    // 存入 KV，TTL 设置为 7000 秒（略低于微信官方的 7200 秒）
    try {
      await kv.put(KV_KEY, data.access_token, {
        expirationTtl: 7000
      });
    } catch (error) {
      // KV 写入失败不影响主流程，仅在本地开发时发生
      console.log('KV write failed (non-critical):', error instanceof Error ? error.message : 'Unknown error');
    }
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

/**
 * 生成随机 Token（使用加密安全的随机数生成器）
 * @param length - Token 长度（字节数，不包括 sk_ 前缀）
 * @returns 随机 Token
 */
function generateToken(length: number = 32): string {
  // 使用加密安全的随机数生成器
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  // 转换为十六进制字符串
  const hexString = Array.from(array, byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');

  return 'sk_' + hexString;
}

/**
 * 处理管理 API 请求
 * @param request - 请求对象
 * @param env - 环境变量
 * @param url - URL 对象
 * @returns API 响应
 */
async function handleAdminAPI(request: Request, env: Env, url: URL): Promise<Response> {
  // 验证管理员 Token
  const authHeader = request.headers.get('Authorization');
  const adminToken = authHeader?.replace('Bearer ', '');

  if (!adminToken || adminToken !== env.CLIENT_AUTH_TOKEN) {
    return new Response(JSON.stringify({
      error: 'Unauthorized'
    }), {
      status: 401,
      headers: createSecureHeaders(env, 'application/json')
    });
  }

  const kv = getKV(env);
  const path = url.pathname;

  try {
    // GET /admin/api/tokens - 列出所有 sk_ 开头的 token
    if (path === '/admin/api/tokens' && request.method === 'GET') {
      const tokens: { key: string; value: string }[] = [];
      let cursor: string | undefined = undefined;

      try {
        // 使用循环处理分页，确保获取所有 keys
        do {
          const listResult = await kv.list({ cursor }) as { keys: Array<{ name: string }>, list_complete: boolean, cursor?: string };
          console.log(`[DEBUG] KV list result: keys=${listResult.keys.length}, list_complete=${listResult.list_complete}, cursor=${listResult.cursor ? 'exists' : 'none'}`);

          for (const key of listResult.keys) {
            if (key.name.startsWith('sk_')) {
              const value = await kv.get(key.name);
              if (value) {
                tokens.push({ key: key.name, value });
                console.log(`[DEBUG] Found token: ${key.name} -> ${value}`);
              }
            }
          }

          // 如果还有更多数据，继续获取
          cursor = listResult.list_complete ? undefined : listResult.cursor;
        } while (cursor);

        console.log(`[DEBUG] Total tokens found: ${tokens.length}`);

        return new Response(JSON.stringify({ tokens }), {
          status: 200,
          headers: createSecureHeaders(env, 'application/json')
        });
      } catch (error) {
        console.error('[ERROR] Failed to list tokens:', error);
        return createErrorResponse('Internal Server Error', 500, env);
      }
    }

    // POST /admin/api/tokens - 添加新的用户 token
    if (path === '/admin/api/tokens' && request.method === 'POST') {
      const body = await request.json() as { openid: string };

      if (!body.openid) {
        return new Response(JSON.stringify({
          error: 'Bad Request'
        }), {
          status: 400,
          headers: createSecureHeaders(env, 'application/json')
        });
      }

      // 自动生成 sk_ 开头的 token（修改为 32 字节，更安全）
      const newToken = generateToken(32);

      // 检查 token 是否已存在
      const existing = await kv.get(newToken);
      if (existing) {
        // 极低概率的冲突，重新生成
        return await handleAdminAPI(request, env, url);
      }

      // 存储 token -> openid 映射
      await kv.put(newToken, body.openid);

      return new Response(JSON.stringify({
        success: true,
        key: newToken,
        value: body.openid
      }), {
        status: 200,
        headers: createSecureHeaders(env, 'application/json')
      });
    }

    // DELETE /admin/api/tokens?key=xxx - 删除 token
    if (path === '/admin/api/tokens' && request.method === 'DELETE') {
      const key = url.searchParams.get('key');

      if (!key) {
        return new Response(JSON.stringify({
          error: 'Bad Request'
        }), {
          status: 400,
          headers: createSecureHeaders(env, 'application/json')
        });
      }

      // 只允许删除 sk_ 开头的 token
      if (!key.startsWith('sk_')) {
        return new Response(JSON.stringify({
          error: 'Bad Request'
        }), {
          status: 400,
          headers: createSecureHeaders(env, 'application/json')
        });
      }

      await kv.delete(key);

      return new Response(JSON.stringify({
        success: true
      }), {
        status: 200,
        headers: createSecureHeaders(env, 'application/json')
      });
    }

    // 未找到的 API 端点
    return createErrorResponse('Not Found', 404, env);

  } catch (error) {
    console.error('[ERROR] Admin API error:', error);
    return createErrorResponse('Internal Server Error', 500, env);
  }
}
