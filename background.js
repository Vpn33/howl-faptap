// 默认配置
const DEFAULT_CONFIG = {
  serverIp: '127.0.0.1',
  syncDelay: 500,
  maxCachedScripts: 5
};

const REMOTE_PORT = 4695;
let currentConfig = { ...DEFAULT_CONFIG };

// 从Chrome存储加载配置
async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['serverAddress', 'syncDelay', 'maxCachedScripts'], (result) => {
      // 统一使用serverAddress字段，并确保默认值为http://127.0.0.1
      const defaultConfig = {
        serverAddress: 'http://127.0.0.1',
        syncDelay: 500,
        maxCachedScripts: 5
      };
      // 合并配置，确保即使result中没有serverAddress，也会使用默认值
      let serverAddress = defaultConfig.serverAddress;
      
      // 只在result.serverAddress有效时使用
      if (result.serverAddress && typeof result.serverAddress === 'string' && !result.serverAddress.includes('undefined')) {
        serverAddress = result.serverAddress;
      }
      
      const mergedConfig = {
        ...defaultConfig,
        ...result,
        // 确保使用有效或默认的serverAddress
        serverAddress: serverAddress
      };
      resolve(mergedConfig);
    });
  });
}

// 保存配置到Chrome存储
async function saveConfig(config) {
  return new Promise((resolve) => {
    // 验证并修正serverAddress
    let serverAddress = 'http://127.0.0.1';
    if (config.serverAddress && typeof config.serverAddress === 'string' && !config.serverAddress.includes('undefined')) {
      serverAddress = config.serverAddress;
    }
    
    // 保存有效配置
    chrome.storage.sync.set({...config, serverAddress: serverAddress}, () => {
      resolve(true);
    });
  });
}

// 调用Howl服务的API
async function callHowlApi(endpoint, data = {}, port = 4695, method = 'POST') {
  try {
    const config = await loadConfig();
    // 确保serverAddress存在且有效，如果无效则使用默认值
    let serverAddress = 'http://127.0.0.1';
    
    if (config.serverAddress && typeof config.serverAddress === 'string' && !config.serverAddress.includes('undefined')) {
      // 去除可能存在的端口号，避免重复添加
      const urlParts = config.serverAddress.split(':');
      if (urlParts.length >= 2) {
        // 检查是否是协议后的冒号
        if (urlParts[0].includes('http')) {
          if (urlParts.length === 3) {
            // 格式为 http://host:port，需要移除端口
            serverAddress = `${urlParts[0]}:${urlParts[1]}`;
          } else {
            serverAddress = config.serverAddress;
          }
        }
      } else {
        serverAddress = config.serverAddress;
      }
    }
    
    const url = `${serverAddress}:${port}${endpoint}`;
    
    console.log('Howl-faptap: 调用Howl API:', url, '方法:', method, '数据:', data);

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
      const errorMessage = `Howl-faptap: HTTP错误状态码: ${response.status}`;
      console.log(errorMessage);
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
      console.log('Howl-faptap: Howl API返回text文本响应:', text.substring(0, 100) + '...');
      return {
        success: true,
        data: text
      };
    }
  } catch (error) {
    console.log('Howl-faptap: 调用Howl API失败:', error);
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
      console.log('Howl-faptap: 无效的funscript内容');
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
    console.log('Howl-faptap: 加载funscript失败:', error);
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
    console.log('Howl-faptap: 无效的跳转位置:', position);
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

  console.log('Howl-faptap: 收到来自content.js的消息:', action);

  // 使用异步处理所有消息
  (async () => {
    try {
      const config = await loadConfig();
      let calTime = config.syncDelay > 0 ? config.syncDelay / 1000 : 0;
      switch (action) {
        case 'get_config':
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

        case 'update_funscript_selection':
          // 保存选中的funscript信息到storage
          await chrome.storage.local.set({
            selected_funscript_title: message.funscriptTitle
          });
          
          // 尝试向popup发送消息更新选中状态
          chrome.runtime.sendMessage({
            action: 'update_funscript_selection_forpop',
            funscriptTitle: message.funscriptTitle
          }, (response) => {
            // 忽略连接错误，因为popup可能没有打开
            if (chrome.runtime.lastError) {
              console.log('Howl-faptap: 没有找到接收消息的popup窗口:', chrome.runtime.lastError.message);
            }
          });
          
          sendResponse({ success: true });
          break;

        case 'start_player':
          const startResult = await startPlayer(calTime + message.fromTime);
          sendResponse(startResult);
          break;

        case 'stop_player':
          const stopResult = await stopPlayer();
          sendResponse(stopResult);
          break;

        case 'seek':
          const seekResult = await seekPlayer(calTime + message.position);
          sendResponse(seekResult);
          break;

        default:
          console.log('Howl-faptap: 未知的消息动作:', action);
          sendResponse({
            success: false,
            error: '未知的消息动作'
          });
      }
    } catch (error) {
      console.log('Howl-faptap: 处理消息时出错:', error);
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
  console.log('Howl-faptap: 插件已启动，当前配置:', config);
});