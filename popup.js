// 显示状态消息
function showStatus(message, isError = false) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = 'status-message ' + (isError ? 'error' : 'success');
  statusElement.style.display = 'block';

  // 3 秒后隐藏消息
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}

// 加载当前配置
function loadConfig() {
  // 1. 先从 localStorage 读取缓存的配置
  const cachedConfig = localStorage.getItem('howl_faptap_config');
  if (cachedConfig) {
    try {
      const config = JSON.parse(cachedConfig);
      // 验证 serverAddress 是否有效
      let serverAddress = 'http://127.0.0.1'; // 默认值

      // 只在 serverAddress 有效且不包含 undefined 时使用
      if (config.serverAddress && typeof config.serverAddress === 'string' && !config.serverAddress.includes('undefined')) {
        serverAddress = config.serverAddress;
      } else if (config.serverIp && typeof config.serverIp === 'string' && config.serverIp !== 'undefined') {
        serverAddress = `http://${config.serverIp}:4695`;
      }

      // 设置界面值
      document.getElementById('serverAddress').value = serverAddress;
      document.getElementById('howlKey').value = config.howlKey || '';
      document.getElementById('howlEnabled').checked = config.howlEnabled !== false;
      document.getElementById('syncDelay').value = config.syncDelay !== undefined ? config.syncDelay : '0';
      document.getElementById('maxCachedScripts').value = config.maxCachedScripts !== undefined ? config.maxCachedScripts : '10';
      console.log('Howl-faptap: 从本地缓存加载配置:', config);
      return; // 已加载缓存，直接返回
    } catch (error) {
      console.log('Howl-faptap: 解析缓存配置失败:', error);
      // 解析失败，继续尝试从 background 获取
    }
  }

  // 2. 从 background.js 获取配置
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
      document.getElementById('howlKey').value = config.howlKey || '';
      document.getElementById('howlEnabled').checked = config.howlEnabled !== false;
      document.getElementById('syncDelay').value = syncDelay;
      document.getElementById('maxCachedScripts').value = config.maxCachedScripts !== undefined ? config.maxCachedScripts : '10';

      // 同步到本地缓存
      saveToLocalCache(serverAddress, config.howlKey, config.howlEnabled, syncDelay, config.maxCachedScripts);
    } catch (error) {
      console.log('Howl-faptap: 加载配置失败:', error);
      // 使用默认值
      document.getElementById('serverAddress').value = 'http://127.0.0.1';
      document.getElementById('howlKey').value = '';
      document.getElementById('howlEnabled').checked = true;
      document.getElementById('syncDelay').value = '0';
      document.getElementById('maxCachedScripts').value = '5';

      // 同步默认值到本地缓存
      saveToLocalCache('http://127.0.0.1', '', true, 0, 5);
    }
  });
}

// 保存到本地缓存
function saveToLocalCache(serverAddress, howlKey, howlEnabled, syncDelay, maxCachedScripts) {
  try {
    // 验证 serverAddress 有效性
    if (typeof serverAddress !== 'string' || serverAddress.includes('undefined')) {
      console.log('Howl-faptap: 尝试保存无效的 serverAddress，使用默认值');
      serverAddress = 'http://127.0.0.1';
    }

    const config = {
      serverAddress: serverAddress,
      howlKey: howlKey || '',
      howlEnabled: howlEnabled !== false,
      syncDelay: syncDelay,
      maxCachedScripts: maxCachedScripts !== undefined ? maxCachedScripts : 5
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
  const howlKey = document.getElementById('howlKey').value.trim();
  const howlEnabled = document.getElementById('howlEnabled').checked;
  const syncDelay = parseInt(document.getElementById('syncDelay').value);
  const maxCachedScripts = parseInt(document.getElementById('maxCachedScripts').value);

  // 验证输入
  if (!serverAddress) {
    showStatus('请输入服务器地址', true);
    return;
  }

  // 验证 maxCachedScripts
  if (isNaN(maxCachedScripts) || maxCachedScripts < 1 || maxCachedScripts > 50) {
    showStatus('缓存脚本数量必须在 1 到 50 之间', true);
    return;
  }

  // 检查并添加协议头
  if (!serverAddress.startsWith('http://') && !serverAddress.startsWith('https://')) {
    serverAddress = `http://${serverAddress}`;
  }


  // 验证 URL 格式
  try {
    new URL(serverAddress);
  } catch {
    showStatus('请输入有效的 URL 格式，例如 http://127.0.0.1', true);
    return;
  }

  // 保存到本地缓存
  saveToLocalCache(serverAddress, howlKey, howlEnabled, syncDelay, maxCachedScripts);

  // 准备配置对象
  const config = {
    serverAddress: serverAddress,
    howlKey: howlKey,
    howlEnabled: howlEnabled,
    syncDelay: syncDelay,
    maxCachedScripts: maxCachedScripts,
    action: 'update_config' // 包含 action 字段
  };

  // 发送配置到 background.js
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
        }, 300); // 300ms 延迟，给存储操作足够时间
      } else {
        showStatus('配置保存失败：' + (response?.error || '未知错误'), true);
      }
    } catch (error) {
      console.log('Howl-faptap: 保存配置响应处理失败:', error);
      showStatus('配置保存失败，请重试', true);
    }
  });
}

// 加载缓存的 funscript 并更新 UI
function loadCachedFunscript() {
  chrome.storage.local.get(['cached_funscripts'], (result) => {
    const tableBody = document.getElementById('funscriptTableBody');
    const loadButton = document.getElementById('loadFunscriptButton');
    const clearButton = document.getElementById('clearCacheButton');
    const downloadButton = document.getElementById('downloadFunscriptButton');

    const funscripts = result.cached_funscripts || [];

    // 清空表格内容
    tableBody.innerHTML = '';

    if (funscripts.length > 0) {
      // 创建表格行
      // 从最后一个元素开始遍历，使最新添加的脚本显示在顶部
      for (let i = funscripts.length - 1; i >= 0; i--) {
        const funscript = funscripts[i];
        const row = document.createElement('tr');

        // 单选按钮列
        const selectCell = document.createElement('td');
        selectCell.className = 'funscript-table-cell';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'funscriptSelect';
        radio.value = i; // 使用原始数组的索引
        radio.id = `funscript_${i}`;

        // 如果只有一个元素，默认选中
        if (funscripts.length === 1) {
          radio.checked = true;
          // 保存到 localStorage
          chrome.storage.local.set({ 'selected_funscript_title': funscript.metadata?.title || '未命名' });
        }

        // 添加 onchange 事件监听器，当选中时保存到 localStorage 并通知 background
        radio.addEventListener('change', () => {
          if (radio.checked) {
            // 保存选中的 funscript 标题到 localStorage
            const selectedTitle = funscript.metadata?.title || '未命名';
            chrome.storage.local.set({ 'selected_funscript_title': selectedTitle }, () => {
              console.log('Howl-faptap: 已保存选中的 funscript 标题到 localStorage:', selectedTitle);
            });

            // 发送消息到 background.js，更新选中状态
            chrome.runtime.sendMessage({
              action: 'update_funscript_selection',
              funscriptTitle: selectedTitle
            }, (response) => {
              // 忽略连接错误，因为 background.js 应该始终运行
              if (chrome.runtime.lastError) {
                console.log('Howl-faptap: 发送消息到 background.js 失败:', chrome.runtime.lastError.message);
              }
            });
          }
        });

        selectCell.appendChild(radio);
        row.appendChild(selectCell);

        // 标题列
        const titleCell = document.createElement('td');
        titleCell.className = 'funscript-table-cell';
        titleCell.textContent = funscript.metadata?.title || '未命名';
        row.appendChild(titleCell);


 


        // 动作数量列
        const actionsCell = document.createElement('td');
        actionsCell.className = 'funscript-table-cell';
        actionsCell.textContent = funscript.actions?.length || 0;
        row.appendChild(actionsCell);

        // 时长列
        const durationCell = document.createElement('td');
        durationCell.className = 'funscript-table-cell';
        let duration = 0;
        if (funscript.actions && funscript.actions.length > 0) {
          const lastAction = funscript.actions[funscript.actions.length - 1];
          if (lastAction.at) {
            duration = lastAction.at / 1000;
          }
        }

        durationCell.textContent = formatDuration(duration);
        row.appendChild(durationCell);

        tableBody.appendChild(row);
      }

      // 启用按钮
      loadButton.disabled = false;
      clearButton.disabled = false;
      downloadButton.disabled = false;

      // 如果只有一个元素，默认调用 load_funscript
      if (funscripts.length === 1) {
        loadFunscriptToHowl();
      }
    } else {
      // 显示无数据提示
      const row = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 4;
      emptyCell.className = 'funscript-table-empty';
      emptyCell.textContent = '没有缓存的 Funscript';
      row.appendChild(emptyCell);
      tableBody.appendChild(row);

      // 禁用按钮
      loadButton.disabled = true;
      clearButton.disabled = true;
      downloadButton.disabled = true;
    }

    // 保存到全局变量以便其他函数使用
    window.cachedFunscripts = funscripts;

    // 从 localStorage 中读取保存的选中脚本标题
    chrome.storage.local.get(['selected_funscript_title'], (result) => {
      console.log('Howl-faptap: 从 localStorage 读取选中脚本标题:', result.selected_funscript_title);
      const selectedTitle = result.selected_funscript_title;

      if (selectedTitle && funscripts.length > 0) {
        // 遍历表格行，找到标题匹配的行并选中
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach((row, index) => {
          // 由于表格是倒序渲染的，需要使用正确的索引
          const funscriptIndex = funscripts.length - 1 - index;
          const funscript = funscripts[funscriptIndex];
          const currentTitle = funscript.metadata?.title || '未命名';

          if (currentTitle === selectedTitle) {
            const radio = row.querySelector('input[type="radio"]');
            if (radio) {
              radio.checked = true;
              console.log('Howl-faptap: 从 localStorage 恢复选中状态:', selectedTitle);
            }
          }
        });
      }
    });
  });
}

// 格式化时长为 HH:MM:SS.mmm 格式，小时为 00 和毫秒为 000 时省略显示
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  let result = '';

  // 处理小时部分，不为 0 时显示
  if (hours > 0) {
    result += `${hours.toString().padStart(2, '0')}:`;
  }

  // 处理分钟
  if (minutes > 0) {
    result += `${minutes.toString().padStart(2, '0')}:`;
  }

  // 处理秒部分，始终显示
  result += `${secs.toString().padStart(2, '0')}`;

  // // 处理毫秒部分，不为 0 时显示
  // if (milliseconds > 0) {
  //   result += `.${milliseconds.toString().padStart(3, '0')}`;
  // }

  return result;
}

// 监听来自 background 的消息，更新 Funscript 选中状态
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'update_funscript_selection_forpop') {
    const funscriptTitle = message.funscriptTitle;
    const radioButtons = document.querySelectorAll('input[name="funscriptSelect"]');

    radioButtons.forEach((radio, index) => {
      const titleElement = radio.closest('tr').querySelector('td:nth-child(2)');
      if (titleElement && titleElement.textContent === funscriptTitle) {
        radio.checked = true;
        console.log('Howl-faptap: 自动选中 Funscript:', funscriptTitle);
      }
    });
  }
});

// 启动播放器
function startPlayer() {
  showStatus('正在启动播放器...');

  // 获取 syncDelay 值
  const syncDelay = parseInt(document.getElementById('syncDelay').value) || 0;

  // 获取 position 值，与 seek 功能使用相同的输入框
  const positionInput = document.getElementById('seekPosition');
  const position = parseFloat(positionInput.value);

  const sendStartPlayerMessage = () => {
    // 准备消息对象
    const message = { action: 'start_player' };

    // 如果 position 不为空且大于 0，则添加 from 参数
    if (!isNaN(position) && position > 0) {
      message.from = position;
    }

    chrome.runtime.sendMessage(message, (response) => {
      try {
        if (response && response.success) {
          showStatus('播放器启动成功');
        } else {
          showStatus('播放器启动失败：' + (response?.error || '未知错误'), true);
        }
      } catch (error) {
        console.log('Howl-faptap: 启动播放器响应处理失败:', error);
        showStatus('播放器启动失败，请重试', true);
      }
    });
  };

  // 如果 syncDelay 大于 0，则添加延迟
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
        showStatus('播放器停止失败：' + (response?.error || '未知错误'), true);
      }
    } catch (error) {
      console.log('Howl-faptap: 停止播放器响应处理失败:', error);
      showStatus('播放器停止失败，请重试', true);
    }
  });
}

// 重试监听 - 不刷新页面重新初始化 content 脚本
function retryListening() {
  showStatus('正在重试监听...');

  chrome.runtime.sendMessage({ action: 'retry_listening' }, (response) => {
    try {
      if (response && response.success) {
        showStatus('重试监听成功');
      } else {
        showStatus('重试监听失败：' + (response?.error || '未知错误'), true);
      }
    } catch (error) {
      console.log('Howl-faptap: 重试监听响应处理失败:', error);
      showStatus('重试监听失败，请重试', true);
    }
  });
}

// 跳转播放位置
function seekToPosition() {
  const positionInput = document.getElementById('seekPosition');
  const position = parseFloat(positionInput.value);

  if (isNaN(position) || position < 0) {
    showStatus('请输入有效的跳转位置（大于等于 0 的数字）', true);
    return;
  }

  showStatus('正在跳转播放位置...');

  // 获取 syncDelay 值
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
          showStatus('跳转播放位置失败：' + (response?.error || '未知错误'), true);
        }
      } catch (error) {
        console.log('Howl-faptap: 跳转播放位置响应处理失败:', error);
        showStatus('跳转播放位置失败，请重试', true);
      }
    });
  };

  // 如果 syncDelay 大于 0，则添加延迟
  if (syncDelay > 0) {
    setTimeout(sendSeekMessage, syncDelay);
  } else {
    sendSeekMessage();
  }
}

// 加载 funscript 到 Howl 服务器
function loadFunscriptToHowl() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }
  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    if (funscripts.length === 0) {
      showStatus('没有缓存的 Funscript 数据', true);
      return;
    }

    const index = parseInt(selectedRadio.value);
    const funscript = funscripts[index];

    showStatus('正在加载 Funscript 到 Howl 服务器...');

    // 向 background 发送 load_funscript 请求
    // 将 funscript 对象转换为 JSON 字符串，与 content.js 中的格式保持一致
    chrome.runtime.sendMessage({
      action: 'load_funscript',
      title: funscript.metadata?.title || '缓存的 Funscript',
      funscriptContent: JSON.stringify(funscript)
    }, (response) => {
      if (response && response.success) {
        showStatus('Funscript 加载成功');
      } else {
        showStatus('Funscript 加载失败：' + (response?.error || '未知错误'), true);
      }
    });
  });
}

// 清除选中的 funscript 数据
function clearCache() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }
  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    const index = parseInt(selectedRadio.value);

    // 移除选中的脚本
    funscripts.splice(index, 1);

    // 更新本地存储
    chrome.storage.local.set({ cached_funscripts: funscripts }, () => {
      // 更新 UI
      loadCachedFunscript();

      // 显示成功消息
      showStatus('选中的缓存已清除', 'success');
    });
  });
}

// 清除全部缓存的 funscript 数据
function clearAllCache() {
  // 清除本地存储中的 funscript 数据
  chrome.storage.local.remove(['cached_funscripts'], () => {
    // 更新 UI 显示
    loadCachedFunscript();

    // 显示成功消息
    showStatus('全部脚本已清除', 'success');
  });
}

function faptapSearch() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }

  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    const index = parseInt(selectedRadio.value);
    if (index < 0 || index >= funscripts.length) {
      return;
    }

    // 移除选中的脚本
    const funscript = funscripts[index];
    const fullTitle = funscript.metadata?.title || '未命名';
    // 截取后缀前的名称（假设后缀是.funscript）
    let searchTitle = fullTitle.replace(/\.funscript$/i, '');
    searchTitle = processTitle(searchTitle);

    // 更新本地存储
    chrome.tabs.create({
      url: `https://faptap.net/videos?q=${searchTitle}`
    });
  });
}

function pornSearch() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }

  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    const index = parseInt(selectedRadio.value);
    if (index < 0 || index >= funscripts.length) {
      return;
    }

    // 移除选中的脚本
    const funscript = funscripts[index];
    const fullTitle = funscript.metadata?.title || '未命名';
    // 截取后缀前的名称（假设后缀是.funscript）
    let searchTitle = fullTitle.replace(/\.funscript$/i, '');
    searchTitle = processTitle(searchTitle);

    // 更新本地存储
    chrome.tabs.create({
      url: `https://www.pornhub.com/video/search?search=${searchTitle}`
    });
  });
}

function xvideosSearch() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }

  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    const index = parseInt(selectedRadio.value);
    if (index < 0 || index >= funscripts.length) {
      return;
    }

    // 移除选中的脚本
    const funscript = funscripts[index];
    const fullTitle = funscript.metadata?.title || '未命名';
    // 截取后缀前的名称（假设后缀是.funscript）
    let searchTitle = fullTitle.replace(/\.funscript$/i, '');
    searchTitle = processTitle(searchTitle);

    // 更新本地存储
    chrome.tabs.create({
      url: `https://www.xvideos.com/?k=${searchTitle}`
    });
  });
}

// 处理标题：非英文和数字的符号替换为 [+]
function processTitle(title) {
  // 只替换空白字符和符号（保留中文）为 + 号
  // 中文字符范围：\u4e00-\u9fa5
  let processed = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '+');
  // 将连续的 + 号替换为单个 + 号
  processed = processed.replace(/\++/g, '+');
  return processed;
}

// 下载 Funscript 文件
function downloadFunscript() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }
  try {
    console.log('Howl-faptap: 开始下载 Funscript...');

    // 从本地存储获取缓存的 funscript 数据
    chrome.storage.local.get(['cached_funscripts'], (result) => {
      const funscripts = result.cached_funscripts || [];
      const index = parseInt(selectedRadio.value);
      const cachedFunscript = funscripts[index];

      if (cachedFunscript) {
        const title = cachedFunscript.metadata?.title || '下载的 Funscript';

        // 按照 content.js 中 JSON 属性的顺序，重新构建一个顺序正确的变量
        const standardFunscript = Object.assign({
          metadata: {
            title: cachedFunscript.metadata?.title || '',
            description: cachedFunscript.metadata?.description || '',
            performers: cachedFunscript.metadata?.performers || [],
            video_url: cachedFunscript.metadata?.video_url || '',
            tags: cachedFunscript.metadata?.tags || [],
            duration: cachedFunscript.metadata?.duration || 0,
            average_speed: cachedFunscript.metadata?.average_speed || 0,
            creator: cachedFunscript.metadata?.creator || 'unknown'
          },
          actions: cachedFunscript.actions || []
        }, cachedFunscript);

        // 创建下载链接
        const scriptLink = document.createElement('a');
        scriptLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(standardFunscript));
        if (title.endsWith('.funscript')) {
          scriptLink.download = `${title}`;
        } else {
          scriptLink.download = `${title}.funscript`;
        }

        document.body.appendChild(scriptLink);

        // 触发下载
        scriptLink.click();

        // 清理
        setTimeout(() => {
          document.body.removeChild(scriptLink);
        }, 100);

        console.log('Howl-faptap: Funscript 下载已触发，文件名:', `${title}.funscript`);
      } else {
        console.log('Howl-faptap: 没有找到缓存的 Funscript 数据');
        alert('没有找到可下载的 Funscript 数据');
      }
    });
  } catch (error) {
    console.log('Howl-faptap: Funscript 下载失败:', error);
    alert('下载 Funscript 失败：' + error.message);
  }
}

// 防止 XSS 攻击的 HTML 转义函数
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 监听器管理相关函数（移到外部，以便事件处理中使用）
function toggleListenerForm() {
  const form = document.getElementById('listenerFormContainer');
  if (form) {
    form.style.display = form.style.display === 'block' ? 'none' : 'block';
  }
}

function saveListener() {
  // 获取表单数据
  const urlInput = document.getElementById('listenerUrl');
  const titleSelectorInput = document.getElementById('listenerTitleSelector');
  const videoSelectorInput = document.getElementById('listenerVideoSelector');

  if (!urlInput || !titleSelectorInput || !videoSelectorInput) {
    showStatus('表单元素不存在', true);
    return;
  }

  const url = urlInput.value.trim();
  const titleSelector = titleSelectorInput.value.trim();
  const videoSelector = videoSelectorInput.value.trim();

  // 验证必填字段
  if (!url || !titleSelector || !videoSelector) {
    showStatus('请填写所有字段', true);
    return;
  }

  // 验证 URL 是否为有效的正则表达式
  try {
    new RegExp(url);
  } catch (e) {
    showStatus(`URL 不是有效的正则表达式：${e.message}`, true);
    return;
  }

  // 从存储中获取现有的监听器列表
  chrome.storage.local.get(['listeners'], (result) => {
    const listeners = result.listeners || [];

    // 检查是否已存在相同的 URL
    const existingIndex = listeners.findIndex(l => l.url === url);

    if (existingIndex >= 0) {
      // 如果存在，询问是否覆盖
      const confirmOverwrite = confirm(`已存在 URL 为"${url}"的监听器，是否覆盖？`);

      if (confirmOverwrite) {
        // 覆盖现有监听器
        listeners[existingIndex] = { url, titleSelector, videoSelector };
        showStatus('监听器已更新');
      } else {
        showStatus('已取消操作');
        toggleListenerForm();
        return;
      }
    } else {
      // 添加新监听器
      listeners.push({ url, titleSelector, videoSelector });
      showStatus('监听器已添加');
    }

    // 保存回存储
    chrome.storage.local.set({ listeners }, () => {
      // 重新渲染列表
      renderListenerTable(listeners);
      toggleListenerForm();
    });
  });
}

function deleteListener(url) {
  // 从存储中获取现有的监听器列表
  chrome.storage.local.get(['listeners'], (result) => {
    const listeners = result.listeners || [];

    // 查找并删除匹配的监听器
    const initialLength = listeners.length;
    const filteredListeners = listeners.filter(l => l.url !== url);

    if (filteredListeners.length < initialLength) {
      // 成功删除
      chrome.storage.local.set({ listeners: filteredListeners }, () => {
        showStatus(`监听器"${url}"已删除`);
        // 重新渲染列表
        renderListenerTable(filteredListeners);
      });
    }
  });
}

function renderListenerTable(listeners) {
  const tbody = document.getElementById('listenerTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (listeners.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'funscript-table-empty';
    cell.textContent = '暂无监听器';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  // 从后往前渲染，使最新的监听器显示在顶部
  for (let i = listeners.length - 1; i >= 0; i--) {
    const listener = listeners[i];
    const row = document.createElement('tr');

    // URL 列
    const urlCell = document.createElement('td');
    urlCell.className = 'funscript-table-cell';
    urlCell.textContent = listener.url;
    row.appendChild(urlCell);

    // 标题选择器列
    const titleSelectorCell = document.createElement('td');
    titleSelectorCell.className = 'funscript-table-cell';
    titleSelectorCell.textContent = listener.titleSelector;
    row.appendChild(titleSelectorCell);

    // 视频选择器列
    const videoSelectorCell = document.createElement('td');
    videoSelectorCell.className = 'funscript-table-cell';
    videoSelectorCell.textContent = listener.videoSelector;
    row.appendChild(videoSelectorCell);

    // 动作列
    const actionCell = document.createElement('td');
    actionCell.className = 'funscript-table-cell';
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '删除';
    deleteBtn.className = 'red-button';
    deleteBtn.style.padding = '4px 8px';
    deleteBtn.style.margin = '0';
    deleteBtn.style.fontSize = '12px';
    deleteBtn.addEventListener('click', () => deleteListener(listener.url));
    actionCell.appendChild(deleteBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  }
}

// 在 DOMContentLoaded 中添加缓存清理逻辑
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
  document.getElementById('retryButton').addEventListener('click', retryListening);

  // 添加下载按钮事件监听
  document.getElementById('downloadFunscriptButton')?.addEventListener('click', downloadFunscript);
  document.getElementById('startPlayerButton').addEventListener('click', startPlayer);
  document.getElementById('stopPlayerButton').addEventListener('click', stopPlayer);
  document.getElementById('seekButton').addEventListener('click', seekToPosition);
  document.getElementById('clearAllCacheButton')?.addEventListener('click', clearAllCache);

  // 搜索按钮
  document.getElementById('faptapButton').addEventListener('click', faptapSearch);
  document.getElementById('pornButton').addEventListener('click', pornSearch);
  document.getElementById('xvideosButton').addEventListener('click', xvideosSearch);

  // 为跳转位置输入框添加回车支持
  document.getElementById('seekPosition').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      seekToPosition();
    }
  });

  // 添加 chrome.storage.local 变更监听器，实时更新 UI
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.cached_funscripts) {
      loadCachedFunscript();
    }
    if (namespace === 'local' && changes.listeners) {
      renderListenerTable(changes.listeners.newValue || []);
    }
  });

  // 添加消息监听器，处理来自 background.js 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action } = message;

    console.log('Howl-faptap: popup.js 收到消息:', action);

    switch (action) {
      case 'update_funscript_selection':
        // 更新选中的 funscript
        const funscriptTitle = message.funscriptTitle;
        const funscriptTable = document.getElementById('funscriptTable');
        if (funscriptTable) {
          const rows = funscriptTable.querySelectorAll('.funscript-table-row');
          rows.forEach(row => {
            const radio = row.querySelector('input[type="radio"]');
            const titleCell = row.querySelector('.funscript-title');
            if (radio && titleCell && titleCell.textContent === funscriptTitle) {
              radio.checked = true;
            }
          });
        }
        sendResponse({ success: true });
        break;

      default:
        console.log('Howl-faptap: popup.js 收到未知消息:', action);
        break;
    }

    // 告诉 Chrome 我们将异步发送响应
    return true;
  });

  // 添加回车保存支持
  document.querySelectorAll('input').forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        saveConfig();
      }
    });
  });

  // 监听器管理按钮事件绑定
  const addListenerButton = document.getElementById('addListenerButton');
  const saveListenerButton = document.getElementById('saveListenerButton');
  const cancelListenerButton = document.getElementById('cancelListenerButton');

  if (addListenerButton) {
    addListenerButton.addEventListener('click', toggleListenerForm);
  }
  
  if (saveListenerButton) {
    saveListenerButton.addEventListener('click', saveListener);
  }
  
  if (cancelListenerButton) {
    cancelListenerButton.addEventListener('click', toggleListenerForm);
  }

  // 加载监听器列表
  chrome.storage.local.get(['listeners'], (result) => {
    renderListenerTable(result.listeners || []);
  });
});
