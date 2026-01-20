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

// 导入 HTML 模板
import { INDEX_HTML } from './html/index.html';
import { ADMIN_HTML } from './html/admin.html';

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
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 解析请求 URL
    const url = new URL(request.url);
    const path = url.pathname;

    // 根路径返回首页
    if (path === '/') {
      return new Response(INDEX_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    // 管理页面路由
    if (path === '/admin') {
      return new Response(ADMIN_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
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
        return new Response(JSON.stringify({
          errcode: -1,
          errmsg: 'Method not allowed. Use GET or POST'
        }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
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

        // 鉴权：检查 token（支持参数、body 或 header）
        const clientToken = params.token || request.headers.get('Authorization')?.replace('Bearer ', '');

        if (!clientToken) {
          return new Response(JSON.stringify({
            errcode: -1,
            errmsg: 'Unauthorized: Missing token'
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        let actualOpenid = params.openid;

        // 如果 token 以 sk_ 开头，从 KV 获取对应的 openid
        if (clientToken.startsWith('sk_')) {
          try {
            const kv = getKV(env);
            console.log(`[DEBUG] Attempting to get KV key: ${clientToken}`);
            const openidFromKV = await kv.get(clientToken);
            console.log(`[DEBUG] KV result: ${openidFromKV}`);

            if (!openidFromKV) {
              return new Response(JSON.stringify({
                errcode: -1,
                errmsg: 'Unauthorized: Token not found in database'
              }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            actualOpenid = openidFromKV;
          } catch (error) {
            console.error('[ERROR] KV access failed:', error);
            return new Response(JSON.stringify({
              errcode: -1,
              errmsg: `Server error: Failed to access token database - ${error instanceof Error ? error.message : 'Unknown error'}`
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } else {
          // 全局 token 鉴权
          if (clientToken !== env.CLIENT_AUTH_TOKEN) {
            return new Response(JSON.stringify({
              errcode: -1,
              errmsg: 'Unauthorized: Invalid global token'
            }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        // 验证必填参数
        if (!actualOpenid) {
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
          openid: actualOpenid,
          from: params.from,
          desc: params.desc,
          remark: params.remark,
          url: params.url
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

    // 404 - 其他路径
    return new Response(JSON.stringify({
      errcode: -1,
      errmsg: 'Not found. Use / for homepage or /send for message sending'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
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
 * 生成随机 Token
 * @param length - Token 长度（不包括 sk_ 前缀）
 * @returns 随机 Token
 */
function generateToken(length: number = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'sk_' + result;
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
      error: 'Unauthorized: Invalid admin token'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
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
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('[ERROR] Failed to list tokens:', error);
        return new Response(JSON.stringify({
          error: 'Failed to list tokens',
          details: error instanceof Error ? error.message : String(error)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // POST /admin/api/tokens - 添加新的用户 token
    if (path === '/admin/api/tokens' && request.method === 'POST') {
      const body = await request.json() as { openid: string };

      if (!body.openid) {
        return new Response(JSON.stringify({
          error: 'Missing required parameter: openid'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 自动生成 sk_ 开头的 token
      const newToken = generateToken(16);

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
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE /admin/api/tokens?key=xxx - 删除 token
    if (path === '/admin/api/tokens' && request.method === 'DELETE') {
      const key = url.searchParams.get('key');

      if (!key) {
        return new Response(JSON.stringify({
          error: 'Missing required parameter: key'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 只允许删除 sk_ 开头的 token
      if (!key.startsWith('sk_')) {
        return new Response(JSON.stringify({
          error: 'Can only delete user tokens (sk_*)'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      await kv.delete(key);

      return new Response(JSON.stringify({
        success: true,
        message: 'Token deleted successfully'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 未找到的 API 端点
    return new Response(JSON.stringify({
      error: 'API endpoint not found'
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      error: `Server error: ${errorMessage}`
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
