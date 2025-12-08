import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from '../utils/logger.js';

const envPath = '.env';
const defaultEnv = `# 服务器配置
PORT=8045
HOST=0.0.0.0

# API 配置
API_URL=https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse
API_MODELS_URL=https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels
API_NO_STREAM_URL=https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent
API_HOST=daily-cloudcode-pa.sandbox.googleapis.com
API_USER_AGENT=antigravity/1.11.3 windows/amd64

# 默认参数
DEFAULT_TEMPERATURE=1
DEFAULT_TOP_P=0.85
DEFAULT_TOP_K=50
DEFAULT_MAX_TOKENS=8096

# 安全配置
MAX_REQUEST_SIZE=50mb
API_KEY=sk-text

# 其他配置
USE_NATIVE_AXIOS=false
TIMEOUT=180000
# PROXY=http://127.0.0.1:7897
# CREDENTIAL_MAX_USAGE_PER_HOUR 已移除，不再限制调用次数
RETRY_STATUS_CODES=429,500
RETRY_MAX_ATTEMPTS=3


# 系统提示词
SYSTEM_INSTRUCTION=
`;

if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, defaultEnv, 'utf8');
  log.info('✓ 已创建默认 .env 文件');
}

dotenv.config();

const config = {
  server: {
    port: parseInt(process.env.PORT) || 8045,
    host: process.env.HOST || '127.0.0.1'
  },
  api: {
    url: process.env.API_URL || 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:streamGenerateContent?alt=sse',
    modelsUrl: process.env.API_MODELS_URL || 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels',
    noStreamUrl: process.env.API_NO_STREAM_URL || 'https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:generateContent',
    host: process.env.API_HOST || 'daily-cloudcode-pa.sandbox.googleapis.com',
    userAgent: process.env.API_USER_AGENT || 'antigravity/1.11.3 windows/amd64'
  },
  defaults: {
    temperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 1,
    top_p: parseFloat(process.env.DEFAULT_TOP_P) || 0.85,
    top_k: parseInt(process.env.DEFAULT_TOP_K) || 50,
    max_tokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 8096
  },
  security: {
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '50mb',
    apiKey: process.env.API_KEY || null
  },
  // credentials 配置已移除，不再限制调用次数
  retry: {
    statusCodes: (process.env.RETRY_STATUS_CODES || '429,500')
      .split(',')
      .map(code => parseInt(code.trim(), 10))
      .filter(code => !Number.isNaN(code)),
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS, 10) || 3
  },
  useNativeAxios: process.env.USE_NATIVE_AXIOS !== 'false',
  timeout: parseInt(process.env.TIMEOUT) || 30000,
  proxy: process.env.PROXY || null,
  systemInstruction: process.env.SYSTEM_INSTRUCTION || ''
};

// ===== API 端点预设和动态切换 =====

const API_ENDPOINTS = {
  daily: {
    key: 'daily',
    label: 'Daily (Sandbox)',
    host: 'daily-cloudcode-pa.sandbox.googleapis.com'
  },
  autopush: {
    key: 'autopush',
    label: 'Autopush (Sandbox)',
    host: 'autopush-cloudcode-pa.sandbox.googleapis.com'
  },
  production: {
    key: 'production',
    label: 'Production',
    host: 'cloudcode-pa.googleapis.com'
  }
};

// 轮询模式配置
const ROUND_ROBIN_ENDPOINTS = ['daily', 'production']; // 轮询使用的端点
let roundRobinIndex = 0; // 当前轮询索引

// 设置文件路径
const SETTINGS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'settings.json');

// 从设置文件加载配置
function loadSettingsFromFile() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {
    log.warn(`读取设置文件失败: ${e.message}`);
  }
  return {};
}

// 保存配置到设置文件
function saveSettingsToFile(updates) {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let settings = loadSettingsFromFile();
    settings = { ...settings, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (e) {
    log.error(`保存设置文件失败: ${e.message}`);
    return false;
  }
}

// 当前配置状态
const settings = loadSettingsFromFile();
let currentEndpointKey = settings.currentEndpoint && API_ENDPOINTS[settings.currentEndpoint]
  ? settings.currentEndpoint
  : 'daily';
let endpointMode = settings.endpointMode || 'fixed'; // 'fixed' | 'round-robin'

// 根据端点 key 构建 URL 配置
function buildUrlsFromEndpoint(endpointKey) {
  const endpoint = API_ENDPOINTS[endpointKey];
  if (!endpoint) return null;

  return {
    url: `https://${endpoint.host}/v1internal:streamGenerateContent?alt=sse`,
    modelsUrl: `https://${endpoint.host}/v1internal:fetchAvailableModels`,
    noStreamUrl: `https://${endpoint.host}/v1internal:generateContent`,
    host: endpoint.host
  };
}

// 应用端点到 config 对象
function applyEndpointToConfig(endpointKey) {
  const urls = buildUrlsFromEndpoint(endpointKey);
  if (urls) {
    config.api.url = urls.url;
    config.api.modelsUrl = urls.modelsUrl;
    config.api.noStreamUrl = urls.noStreamUrl;
    config.api.host = urls.host;
    return true;
  }
  return false;
}

// 初始化时应用端点
applyEndpointToConfig(currentEndpointKey);

// ===== 导出函数 =====

export function getAvailableEndpoints() {
  return Object.values(API_ENDPOINTS);
}

export function getCurrentEndpoint() {
  return {
    key: currentEndpointKey,
    ...API_ENDPOINTS[currentEndpointKey]
  };
}

export function getEndpointMode() {
  return endpointMode;
}

export function setEndpoint(endpointKey) {
  if (!API_ENDPOINTS[endpointKey]) {
    return { success: false, error: `未知的端点: ${endpointKey}` };
  }

  if (applyEndpointToConfig(endpointKey)) {
    currentEndpointKey = endpointKey;
    saveSettingsToFile({ currentEndpoint: endpointKey });
    log.info(`✓ API 端点已切换为: ${API_ENDPOINTS[endpointKey].label} (${API_ENDPOINTS[endpointKey].host})`);
    return { success: true, current: getCurrentEndpoint() };
  }

  return { success: false, error: '切换端点失败' };
}

export function setEndpointMode(mode) {
  if (mode !== 'fixed' && mode !== 'round-robin') {
    return { success: false, error: `未知的模式: ${mode}` };
  }

  endpointMode = mode;
  saveSettingsToFile({ endpointMode: mode });

  if (mode === 'round-robin') {
    log.info(`✓ 端点模式已切换为: 自动轮询 (${ROUND_ROBIN_ENDPOINTS.join(' ↔ ')})`);
  } else {
    log.info(`✓ 端点模式已切换为: 固定端点 (${API_ENDPOINTS[currentEndpointKey].label})`);
  }

  return { success: true, mode: endpointMode };
}

/**
 * 获取当前请求应使用的端点配置
 * - fixed 模式：返回当前固定端点
 * - round-robin 模式：轮询返回 daily/production
 */
export function getActiveEndpointConfig() {
  let activeKey;

  if (endpointMode === 'round-robin') {
    activeKey = ROUND_ROBIN_ENDPOINTS[roundRobinIndex];
    roundRobinIndex = (roundRobinIndex + 1) % ROUND_ROBIN_ENDPOINTS.length;
  } else {
    activeKey = currentEndpointKey;
  }

  const endpoint = API_ENDPOINTS[activeKey];
  const urls = buildUrlsFromEndpoint(activeKey);

  return {
    key: activeKey,
    label: endpoint.label,
    host: endpoint.host,
    ...urls
  };
}

/**
 * 获取端点状态摘要（用于API响应）
 */
export function getEndpointStatus() {
  return {
    mode: endpointMode,
    currentEndpoint: getCurrentEndpoint(),
    roundRobinEndpoints: ROUND_ROBIN_ENDPOINTS.map(k => ({
      key: k,
      label: API_ENDPOINTS[k].label,
      host: API_ENDPOINTS[k].host
    }))
  };
}

log.info('✓ 配置加载成功');
log.info(`✓ 端点模式: ${endpointMode === 'round-robin' ? '自动轮询' : '固定端点'}`);
log.info(`✓ 当前端点: ${API_ENDPOINTS[currentEndpointKey].label}`);

export default config;


