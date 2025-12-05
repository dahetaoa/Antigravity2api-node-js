const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function logMessage(level, ...args) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const color = { info: colors.green, warn: colors.yellow, error: colors.red }[level];
  console.log(`${colors.gray}${timestamp}${colors.reset} ${color}[${level}]${colors.reset}`, ...args);
}

function logRequest(method, path, status, duration) {
  const statusColor = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;
  console.log(`${colors.cyan}[${method}]${colors.reset} - ${path} ${statusColor}${status}${colors.reset} ${colors.gray}${duration}ms${colors.reset}`);
}

export const log = {
  info: (...args) => logMessage('info', ...args),
  warn: (...args) => logMessage('warn', ...args),
  error: (...args) => logMessage('error', ...args),
  request: logRequest,
  detail: logDetail
};

function logDetail(data) {
  const { method, path, status, durationMs, request, response, error } = data;
  const statusColor = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;

  console.log('----------------------------------------------------');
  console.log(`${colors.cyan}[${method}]${colors.reset} ${path} ${statusColor}${status}${colors.reset} ${colors.gray}${durationMs}ms${colors.reset}`);

  if (error) {
    console.log(`${colors.red}Error:${colors.reset} ${error}`);
  }

  if (request) {
    console.log(`${colors.cyan}Request Headers:${colors.reset}`);
    console.log(JSON.stringify(request.headers || {}, null, 2));
    if (request.body) {
      console.log(`${colors.cyan}Request Body:${colors.reset}`);
      // 截断太长的 body
      const bodyStr = JSON.stringify(request.body, null, 2);
      console.log(bodyStr.length > 2000 ? bodyStr.substring(0, 2000) + '... (truncated)' : bodyStr);
    }
  }

  if (response) {
    if (response.headers) {
      // console.log(`${colors.green}Response Headers:${colors.reset}`);
      // console.log(JSON.stringify(response.headers, null, 2));
    }
    if (response.body || response.modelOutput) {
      console.log(`${colors.green}Response Output:${colors.reset}`);
      const out = response.modelOutput || response.body;
      const outStr = JSON.stringify(out, null, 2);
      console.log(outStr.length > 2000 ? outStr.substring(0, 2000) + '... (truncated)' : outStr);
    }
  }
  console.log('----------------------------------------------------');
}

export default log;
