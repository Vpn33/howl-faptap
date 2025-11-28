// 默认配置
const DEFAULT_CONFIG = {
  serverIp: '127.0.0.1',
  syncDelay: 500
};

const REMOTE_PORT = 4695;
let currentConfig = { ...DEFAULT_CONFIG };

// 从Chrome存储加载配置
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverAddress', 'syncDelay'], (result) => {
      // 统一使用serverAddress字段，并确保默认值为http://127.0.0.1
      const defaultConfig = {
        serverAddress: 'http://127.0.0.1',
        syncDelay: 500
      };
      // 合并配置，确保即使result中没有serverAddress，也会使用默认值
      const mergedConfig = {
        ...defaultConfig,
        ...result,
        // 再次确保serverAddress有值
        serverAddress: result.serverAddress || defaultConfig.serverAddress
      };
      resolve(mergedConfig);
    });
  });
}

// 保存配置到Chrome存储
async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(config, () => {
      resolve(true);
    });
  });
}

// 调用Howl服务的API
async function callHowlApi(endpoint, data = {}, port = 4695, method = 'POST') {
  try {
    const config = await loadConfig();
    // 确保serverAddress存在，如果不存在则使用默认值
    const serverAddress = config.serverAddress || 'http://127.0.0.1';
    const url = `${serverAddress}:${port}${endpoint}`;

    console.log(`调用Howl API: ${url}, 方法: ${method}, 数据:`, data);

    const headers = {
      'Content-Type': 'application/json',
      // 添加CORS相关头部
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
    };

    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(data) : undefined,
      credentials: 'include', // 包含凭证信息
      mode: 'cors' // 设置为cors模式
    });

    // 检查响应状态
    if (!response.ok) {
      const errorMessage = `HTTP错误状态码: ${response.status}`;
      console.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }

    // 先读取响应内容
    const text = await response.text();

    // 尝试解析JSON响应
    try {
      const result = JSON.parse(text);
      return {
        success: true,
        data: result
      };
    } catch (jsonError) {
      // 处理非JSON响应
      console.log('Howl API返回text文本响应:', text.substring(0, 100) + '...');
      return {
        success: true,
        data: text
      };
    }
  } catch (error) {
    console.error('调用Howl API失败:', error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

// 加载funscript文件
async function loadFunscript(title, funscriptContent) {
  try {
    // 兼容不同格式的参数传递
    // 如果title是一个对象，说明参数是通过单个对象传入的（来自sendMessage）
    let finalTitle = title;
    let finalFunscriptContent = funscriptContent;
    
    if (typeof title === 'object') {
      finalTitle = title.title || '未知标题';
      // 检查是否是新格式(funscriptContent)还是旧格式(funscript)
      if (title.funscriptContent) {
        finalFunscriptContent = title.funscriptContent;
      } else if (title.funscript) {
        // 如果是旧格式且funscript是对象，则转换为JSON字符串
        finalFunscriptContent = typeof title.funscript === 'string' ? 
          title.funscript : JSON.stringify(title.funscript);
      }
    }

    // 验证funscriptContent是否有效
    if (!finalFunscriptContent || typeof finalFunscriptContent !== 'string') {
      console.error('无效的funscript内容');
      return {
        success: false,
        error: '无效的funscript内容'
      };
    }

    return await callHowlApi('/load_funscript', {
      title: finalTitle,
      funscript: finalFunscriptContent
    });
  } catch (error) {
    console.error('加载funscript失败:', error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
}

// 启动播放器
async function startPlayer(fromTime = 0) {
  return await callHowlApi('/start_player', { from: fromTime });
}

// 停止播放器
async function stopPlayer() {
  return await callHowlApi('/stop_player', {});
}

// 跳转到指定位置
async function seekPlayer(position) {
  // 验证position是否为有效数字
  if (isNaN(position) || position < 0) {
    console.error('无效的跳转位置:', position);
    return {
      success: false,
      error: '无效的跳转位置'
    };
  }
  return await callHowlApi('/seek', { position });
}

// 处理来自content.js的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  console.log('收到来自content.js的消息:', action);

  // 使用异步处理所有消息
  (async () => {
    try {
      switch (action) {
        case 'get_config':
          const config = await loadConfig();
          sendResponse({
            success: true,
            data: config
          });
          break;

        case 'update_config':
          const updateResult = await saveConfig(message);
          sendResponse({
            success: updateResult
          });
          break;

        case 'load_funscript':
          // 直接传递整个message对象，让loadFunscript函数内部处理兼容性
          const loadResult = await loadFunscript(message);
          sendResponse(loadResult);
          break;

        case 'start_player':
          const startResult = await startPlayer(message.fromTime || 0);
          sendResponse(startResult);
          break;

        case 'stop_player':
          const stopResult = await stopPlayer();
          sendResponse(stopResult);
          break;

        case 'seek':
          const seekResult = await seekPlayer(message.position);
          sendResponse(seekResult);
          break;

        default:
          console.warn('未知的消息动作:', action);
          sendResponse({
            success: false,
            error: '未知的消息动作'
          });
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
      // 确保总是发送响应
      sendResponse({
        success: false,
        error: error.message || '处理消息时发生未知错误'
      });
    }
  })();

  // 告诉Chrome我们将异步发送响应
  return true;
});

// 初始化配置
loadConfig().then(config => {
  console.log('Howl Faptap插件已启动，当前配置:', config);
});