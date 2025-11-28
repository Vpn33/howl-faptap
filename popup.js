// 显示状态消息
function showStatus(message, isError = false) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = 'status-message ' + (isError ? 'error' : 'success');

  // 3秒后隐藏消息
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// 加载当前配置
function loadConfig() {
  // 1. 先从localStorage读取缓存的配置
  const cachedConfig = localStorage.getItem('howl_faptap_config');
  if (cachedConfig) {
    try {
      const config = JSON.parse(cachedConfig);
      // 验证serverAddress是否有效
      let serverAddress = 'http://127.0.0.1'; // 默认值

      // 只在serverAddress有效且不包含undefined时使用
      if (config.serverAddress && typeof config.serverAddress === 'string' && !config.serverAddress.includes('undefined')) {
        serverAddress = config.serverAddress;
      } else if (config.serverIp && typeof config.serverIp === 'string' && config.serverIp !== 'undefined') {
        serverAddress = `http://${config.serverIp}:4695`;
      }

      // 设置界面值
      document.getElementById('serverAddress').value = serverAddress;
      document.getElementById('syncDelay').value = config.syncDelay !== undefined ? config.syncDelay : '0';
      console.log('Howl-faptap: 从本地缓存加载配置:', config);
      return; // 已加载缓存，直接返回
    } catch (error) {
      console.log('Howl-faptap: 解析缓存配置失败:', error);
      // 解析失败，继续尝试从background获取
    }
  }

  // 2. 从background.js获取配置
  chrome.runtime.sendMessage({ action: 'get_config' }, (response) => {
    try {
      // 兼容两种可能的响应格式
      const config = response.success ? response.data : response;

      // 设置默认值
      let serverAddress = 'http://127.0.0.1'; // 默认值
      if (config.serverAddress && typeof config.serverAddress === 'string' && !config.serverAddress.includes('undefined')) {
        serverAddress = config.serverAddress;
      } else if (config.serverIp && typeof config.serverIp === 'string' && config.serverIp !== 'undefined') {
        serverAddress = `http://${config.serverIp}:4695`;
      }
      const syncDelay = config.syncDelay !== undefined ? config.syncDelay : 0;

      // 设置界面值
      document.getElementById('serverAddress').value = serverAddress;
      document.getElementById('syncDelay').value = syncDelay;

      // 同步到本地缓存
      saveToLocalCache(serverAddress, syncDelay);
    } catch (error) {
      console.log('Howl-faptap: 加载配置失败:', error);
      // 使用默认值
      document.getElementById('serverAddress').value = 'http://127.0.0.1';
      document.getElementById('syncDelay').value = '0';

      // 同步默认值到本地缓存
      saveToLocalCache('http://127.0.0.1', 0);
    }
  });
}

// 保存到本地缓存
function saveToLocalCache(serverAddress, syncDelay) {
  try {
    // 验证serverAddress有效性
    if (typeof serverAddress !== 'string' || serverAddress.includes('undefined')) {
      console.log('Howl-faptap: 尝试保存无效的serverAddress，使用默认值');
      serverAddress = 'http://127.0.0.1';
    }

    const config = {
      serverAddress: serverAddress,
      syncDelay: syncDelay
    };
    localStorage.setItem('howl_faptap_config', JSON.stringify(config));
    console.log('Howl-faptap: 配置已保存到本地缓存:', config);
  } catch (error) {
    console.log('Howl-faptap: 保存到本地缓存失败:', error);
  }
}

// 保存配置
function saveConfig() {
  let serverAddress = document.getElementById('serverAddress').value.trim();

  const syncDelay = parseInt(document.getElementById('syncDelay').value);

  // 验证输入
  if (!serverAddress) {
    showStatus('请输入服务器地址', true);
    return;
  }

  // 检查并添加协议头
  if (!serverAddress.startsWith('http://') && !serverAddress.startsWith('https://')) {
    serverAddress = `http://${serverAddress}`;
  }


  // 验证URL格式
  try {
    new URL(serverAddress);
  } catch {
    showStatus('请输入有效的URL格式，例如 http://127.0.0.1', true);
    return;
  }

  // 保存到本地缓存
  saveToLocalCache(serverAddress, syncDelay);

  // 准备配置对象
  const config = {
    serverAddress: serverAddress,
    syncDelay: syncDelay,
    action: 'update_config' // 包含action字段
  };

  // 发送配置到background.js
  chrome.runtime.sendMessage(config, (response) => {
    try {
      if (response && response.success) {
        showStatus('配置保存成功');

        // 延迟一小段时间后再刷新页面，确保配置完全保存
        setTimeout(() => {
          // 保存成功后刷新当前活动标签页
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
              chrome.tabs.reload(tabs[0].id);
            }
          });
        }, 300); // 300ms延迟，给存储操作足够时间
      } else {
        showStatus('配置保存失败: ' + (response?.error || '未知错误'), true);
      }
    } catch (error) {
      console.log('Howl-faptap: 保存配置响应处理失败:', error);
      showStatus('配置保存失败，请重试', true);
    }
  });
}

// 加载缓存的funscript并更新UI
function loadCachedFunscript() {
  chrome.storage.local.get(['cached_funscript'], (result) => {
    const funscriptTitle = document.getElementById('funscriptTitle');
    const loadButton = document.getElementById('loadFunscriptButton');
    const clearButton = document.getElementById('clearCacheButton');

    if (result.cached_funscript && result.cached_funscript.metadata && result.cached_funscript.metadata.title) {
      funscriptTitle.textContent = result.cached_funscript.metadata.title;
      loadButton.disabled = false;
      clearButton.disabled = false;
    } else {
      funscriptTitle.textContent = '无缓存的Funscript数据';
      loadButton.disabled = true;
      clearButton.disabled = true;
    }
  });
}

// 启动播放器
function startPlayer() {
  showStatus('正在启动播放器...');

  // 获取syncDelay值
  const syncDelay = parseInt(document.getElementById('syncDelay').value) || 0;

  // 获取position值，与seek功能使用相同的输入框
  const positionInput = document.getElementById('seekPosition');
  const position = parseFloat(positionInput.value);

  const sendStartPlayerMessage = () => {
    // 准备消息对象
    const message = { action: 'start_player' };

    // 如果position不为空且大于0，则添加from参数
    if (!isNaN(position) && position > 0) {
      message.from = position;
    }

    chrome.runtime.sendMessage(message, (response) => {
      try {
        if (response && response.success) {
          showStatus('播放器启动成功');
        } else {
          showStatus('播放器启动失败: ' + (response?.error || '未知错误'), true);
        }
      } catch (error) {
        console.log('Howl-faptap: 启动播放器响应处理失败:', error);
        showStatus('播放器启动失败，请重试', true);
      }
    });
  };

  // 如果syncDelay大于0，则添加延迟
  if (syncDelay > 0) {
    setTimeout(sendStartPlayerMessage, syncDelay);
  } else {
    sendStartPlayerMessage();
  }
}

// 停止播放器
function stopPlayer() {
  showStatus('正在停止播放器...');

  chrome.runtime.sendMessage({ action: 'stop_player' }, (response) => {
    try {
      if (response && response.success) {
        showStatus('播放器停止成功');
      } else {
        showStatus('播放器停止失败: ' + (response?.error || '未知错误'), true);
      }
    } catch (error) {
      console.log('Howl-faptap: 停止播放器响应处理失败:', error);
      showStatus('播放器停止失败，请重试', true);
    }
  });
}

// 跳转播放位置
function seekToPosition() {
  const positionInput = document.getElementById('seekPosition');
  const position = parseFloat(positionInput.value);

  if (isNaN(position) || position < 0) {
    showStatus('请输入有效的跳转位置（大于等于0的数字）', true);
    return;
  }

  showStatus('正在跳转播放位置...');

  // 获取syncDelay值
  const syncDelay = parseInt(document.getElementById('syncDelay').value) || 0;

  const sendSeekMessage = () => {
    chrome.runtime.sendMessage({
      action: 'seek',
      position: position
    }, (response) => {
      try {
        if (response && response.success) {
          showStatus(`已成功跳转到 ${position} 秒`);
        } else {
          showStatus('跳转播放位置失败: ' + (response?.error || '未知错误'), true);
        }
      } catch (error) {
        console.log('Howl-faptap: 跳转播放位置响应处理失败:', error);
        showStatus('跳转播放位置失败，请重试', true);
      }
    });
  };

  // 如果syncDelay大于0，则添加延迟
  if (syncDelay > 0) {
    setTimeout(sendSeekMessage, syncDelay);
  } else {
    sendSeekMessage();
  }
}

// 加载funscript到Howl服务器
function loadFunscriptToHowl() {
  chrome.storage.local.get('cached_funscript', (result) => {
    if (!result.cached_funscript) {
      showStatus('没有缓存的Funscript数据', true);
      return;
    }

    const funscript = result.cached_funscript;
    showStatus('正在加载Funscript到Howl服务器...');

    // 向background发送load_funscript请求
    // 将funscript对象转换为JSON字符串，与content.js中的格式保持一致
    chrome.runtime.sendMessage({
      action: 'load_funscript',
      title: result.cached_funscript.metadata?.title || '缓存的Funscript',
      funscriptContent: JSON.stringify(funscript)
    }, (response) => {
      if (response && response.success) {
        showStatus('Funscript加载成功');
      } else {
        showStatus('Funscript加载失败: ' + (response?.error || '未知错误'), true);
      }
    });
  });
}

// 清除缓存的funscript数据
function clearCache() {
  // 清除本地存储中的funscript数据
  chrome.storage.local.remove(['cached_funscript', 'cached_funscript_title'], () => {
    // 更新UI显示
    const funscriptTitle = document.getElementById('funscriptTitle');
    const loadButton = document.getElementById('loadFunscriptButton');
    const clearButton = document.getElementById('clearCacheButton');

    funscriptTitle.textContent = '无缓存的Funscript数据';
    loadButton.disabled = true;
    clearButton.disabled = true;

    // 显示成功消息
    showStatus('缓存已清除', 'success');
  });
}

// 设置事件监听
// 在DOMContentLoaded中添加缓存清理逻辑
document.addEventListener('DOMContentLoaded', () => {
  // 首先清理可能存在的无效缓存
  try {
    const cachedConfig = localStorage.getItem('howl_faptap_config');
    if (cachedConfig) {
      const config = JSON.parse(cachedConfig);
      // 检查缓存中的服务器地址是否无效
      if (config.serverAddress && typeof config.serverAddress === 'string' && (config.serverAddress.includes('undefined') || !config.serverAddress.startsWith('http'))) {
        console.log('Howl-faptap: 检测到无效的缓存配置，正在清理...');
        localStorage.removeItem('howl_faptap_config');
      }
    }
  } catch (error) {
    console.log('Howl-faptap: 清理缓存时出错:', error);
    localStorage.removeItem('howl_faptap_config');
  }

  // 然后再加载配置
  loadConfig();
  loadCachedFunscript();

  document.getElementById('saveButton').addEventListener('click', saveConfig);
  document.getElementById('loadFunscriptButton').addEventListener('click', loadFunscriptToHowl);
  document.getElementById('clearCacheButton').addEventListener('click', clearCache);

  // 添加功能按钮事件监听
  document.getElementById('startPlayerButton').addEventListener('click', startPlayer);
  document.getElementById('stopPlayerButton').addEventListener('click', stopPlayer);
  document.getElementById('seekButton').addEventListener('click', seekToPosition);

  // 为跳转位置输入框添加回车支持
  document.getElementById('seekPosition').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      seekToPosition();
    }
  });

  // 添加chrome.storage.local变更监听器，实时更新UI
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.cached_funscript || changes.cached_funscript_title)) {
      loadCachedFunscript();
    }
  });

  // 添加回车保存支持
  document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveConfig();
      }
    });
  });
});