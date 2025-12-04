// 显示状态消息
function showStatus(message, isError = false) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = 'status-message ' + (isError ? 'error' : 'success');
  statusElement.style.display = 'block';

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
      document.getElementById('maxCachedScripts').value = config.maxCachedScripts !== undefined ? config.maxCachedScripts : '10';
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
      document.getElementById('maxCachedScripts').value = config.maxCachedScripts !== undefined ? config.maxCachedScripts : '10';

      // 同步到本地缓存
      saveToLocalCache(serverAddress, syncDelay, config.maxCachedScripts);
    } catch (error) {
      console.log('Howl-faptap: 加载配置失败:', error);
      // 使用默认值
      document.getElementById('serverAddress').value = 'http://127.0.0.1';
      document.getElementById('syncDelay').value = '0';
      document.getElementById('maxCachedScripts').value = '5';

      // 同步默认值到本地缓存
      saveToLocalCache('http://127.0.0.1', 0, 5);
    }
  });
}

// 保存到本地缓存
function saveToLocalCache(serverAddress, syncDelay, maxCachedScripts) {
  try {
    // 验证serverAddress有效性
    if (typeof serverAddress !== 'string' || serverAddress.includes('undefined')) {
      console.log('Howl-faptap: 尝试保存无效的serverAddress，使用默认值');
      serverAddress = 'http://127.0.0.1';
    }

    const config = {
      serverAddress: serverAddress,
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

  const syncDelay = parseInt(document.getElementById('syncDelay').value);
  const maxCachedScripts = parseInt(document.getElementById('maxCachedScripts').value);

  // 验证输入
  if (!serverAddress) {
    showStatus('请输入服务器地址', true);
    return;
  }

  // 验证maxCachedScripts
  if (isNaN(maxCachedScripts) || maxCachedScripts < 1 || maxCachedScripts > 50) {
    showStatus('缓存脚本数量必须在1到50之间', true);
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
  saveToLocalCache(serverAddress, syncDelay, maxCachedScripts);

  // 准备配置对象
  const config = {
    serverAddress: serverAddress,
    syncDelay: syncDelay,
    maxCachedScripts: maxCachedScripts,
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
        }

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

      // 如果只有一个元素，默认调用load_funscript
      if (funscripts.length === 1) {
        loadFunscriptToHowl();
      }
    } else {
      // 显示无数据提示
      const row = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 4;
      emptyCell.className = 'funscript-table-empty';
      emptyCell.textContent = '没有缓存的Funscript';
      row.appendChild(emptyCell);
      tableBody.appendChild(row);

      // 禁用按钮
      loadButton.disabled = true;
      clearButton.disabled = true;
      downloadButton.disabled = true;
    }

    // 保存到全局变量以便其他函数使用
    window.cachedFunscripts = funscripts;

    // 从localStorage中读取保存的选中脚本标题
    chrome.storage.local.get(['selected_funscript_title'], (result) => {
      console.log('Howl-faptap: 从localStorage读取选中脚本标题:', result.selected_funscript_title);
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
              console.log('Howl-faptap: 从localStorage恢复选中状态:', selectedTitle);
            }
          }
        });
      }
    });
  });
}

// 格式化时长为HH:MM:SS.mmm格式，小时为00和毫秒为000时省略显示
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  let result = '';

  // 处理小时部分，不为0时显示
  if (hours > 0) {
    result += `${hours.toString().padStart(2, '0')}:`;
  }

  // 处理分钟
  if (minutes > 0) {
    result += `${minutes.toString().padStart(2, '0')}:`;
  }

  // 处理秒部分，始终显示
  result += `${secs.toString().padStart(2, '0')}`;

  // // 处理毫秒部分，不为0时显示
  // if (milliseconds > 0) {
  //   result += `.${milliseconds.toString().padStart(3, '0')}`;
  // }

  return result;
}

// 监听来自background的消息，更新Funscript选中状态
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'update_funscript_selection_forpop') {
    const funscriptTitle = message.funscriptTitle;
    const radioButtons = document.querySelectorAll('input[name="funscriptSelect"]');

    radioButtons.forEach((radio, index) => {
      const titleElement = radio.closest('tr').querySelector('td:nth-child(2)');
      if (titleElement && titleElement.textContent === funscriptTitle) {
        radio.checked = true;
        console.log('Howl-faptap: 自动选中Funscript:', funscriptTitle);
      }
    });
  }
});

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
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }
  chrome.storage.local.get('cached_funscripts', (result) => {
    const funscripts = result.cached_funscripts || [];

    if (funscripts.length === 0) {
      showStatus('没有缓存的Funscript数据', true);
      return;
    }

    const index = parseInt(selectedRadio.value);
    const funscript = funscripts[index];

    showStatus('正在加载Funscript到Howl服务器...');

    // 向background发送load_funscript请求
    // 将funscript对象转换为JSON字符串，与content.js中的格式保持一致
    chrome.runtime.sendMessage({
      action: 'load_funscript',
      title: funscript.metadata?.title || '缓存的Funscript',
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

// 清除选中的funscript数据
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
      // 更新UI
      loadCachedFunscript();

      // 显示成功消息
      showStatus('选中的缓存已清除', 'success');
    });
  });
}

// 清除全部缓存的funscript数据
function clearAllCache() {
  // 清除本地存储中的funscript数据
  chrome.storage.local.remove(['cached_funscripts'], () => {
    // 更新UI显示
    loadCachedFunscript();

    // 显示成功消息
    showStatus('全部脚本已清除', 'success');
  });
}

// 下载Funscript文件
function downloadFunscript() {
  // 获取选中的脚本索引
  const selectedRadio = document.querySelector('input[name="funscriptSelect"]:checked');
  if (!selectedRadio) {
    showStatus('请先选择一个脚本', true);
    return;
  }
  try {
    console.log('Howl-faptap: 开始下载Funscript...');

    // 从本地存储获取缓存的funscript数据
    chrome.storage.local.get(['cached_funscripts'], (result) => {
      const funscripts = result.cached_funscripts || [];
      const index = parseInt(selectedRadio.value);
      const cachedFunscript = funscripts[index];

      if (cachedFunscript) {
        const title = cachedFunscript.metadata?.title || '下载的Funscript';

        // 按照content.js中JSON属性的顺序，重新构建一个顺序正确的变量
        const standardFunscript = {
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
        };

        // 创建下载链接
        const scriptLink = document.createElement('a');
        scriptLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(standardFunscript));
        scriptLink.download = `${title}.funscript`;
        document.body.appendChild(scriptLink);

        // 触发下载
        scriptLink.click();

        // 清理
        setTimeout(() => {
          document.body.removeChild(scriptLink);
        }, 100);

        console.log('Howl-faptap: Funscript下载已触发，文件名:', `${title}.funscript`);
      } else {
        console.log('Howl-faptap: 没有找到缓存的Funscript数据');
        alert('没有找到可下载的Funscript数据');
      }
    });
  } catch (error) {
    console.log('Howl-faptap: Funscript下载失败:', error);
    alert('下载Funscript失败: ' + error.message);
  }
}

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

  // 添加下载按钮事件监听
  document.getElementById('downloadFunscriptButton')?.addEventListener('click', downloadFunscript);
  document.getElementById('startPlayerButton').addEventListener('click', startPlayer);
  document.getElementById('stopPlayerButton').addEventListener('click', stopPlayer);
  document.getElementById('seekButton').addEventListener('click', seekToPosition);
  document.getElementById('clearAllCacheButton')?.addEventListener('click', clearAllCache);

  // 为跳转位置输入框添加回车支持
  document.getElementById('seekPosition').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      seekToPosition();
    }
  });

  // 添加chrome.storage.local变更监听器，实时更新UI
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.cached_funscripts) {
      loadCachedFunscript();
    }
  });

  // 添加消息监听器，处理来自background.js的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action } = message;

    console.log('Howl-faptap: popup.js收到消息:', action);

    switch (action) {
      case 'update_funscript_selection':
        // 更新选中的funscript
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
        console.log('Howl-faptap: popup.js收到未知消息:', action);
        break;
    }

    // 告诉Chrome我们将异步发送响应
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
});