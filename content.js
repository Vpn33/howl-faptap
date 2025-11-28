// 向background.js发送消息

function findVideoElement(selector = 'video#player') {
  // 首先在当前文档中查找
  let element = document.querySelector(selector);
  
  // 如果没找到，递归查找所有iframe
  if (!element) {
    const iframes = document.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length && !element; i++) {
      try {
        // 尝试访问iframe的contentDocument
        if (iframes[i].contentDocument) {
          element = findVideoElementInIframe(iframes[i].contentDocument, selector);
        }
      } catch (error) {
        console.log('Howl-faptap: 无法访问iframe内容:', error.message);
      }
    }
  }
  
  return element;
}

// 递归在iframe文档中查找视频元素
function findVideoElementInIframe(doc, selector) {
  // 在当前iframe文档中查找
  let element = doc.querySelector(selector);
  
  // 如果没找到，继续查找该iframe中的嵌套iframe
  if (!element) {
    const iframes = doc.querySelectorAll('iframe');
    for (let i = 0; i < iframes.length && !element; i++) {
      try {
        if (iframes[i].contentDocument) {
          element = findVideoElementInIframe(iframes[i].contentDocument, selector);
        }
      } catch (error) {
        // 静默忽略跨域错误
      }
    }
  }
  
  return element;
}

function sendMessageToBackground(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// 等待元素加载完成
function waitForElement(selector, callback, timeout = 10000) {
  const interval = 100;
  const maxAttempts = timeout / interval;
  let attempts = 0;

  const checkElement = () => {
    const element = findVideoElement(selector);
    if (element) {
      callback(element);
    } else if (attempts < maxAttempts) {
      attempts++;
      setTimeout(checkElement, interval);
    } else {
      console.log(`Howl-faptap: 等待元素超时: ${selector}`);
      
      // 对于iframe.mediadelivery.net，尝试在iframe中直接查找
      if (window.location.hostname === 'iframe.mediadelivery.net') {
        console.log('Howl-faptap: 在iframe.mediadelivery.net页面上尝试备用查找方法');
        findVideoInNestedIframes(selector, callback);
      }
    }
  };

  checkElement();
}

// 专门为iframe.mediadelivery.net页面设计的备用查找方法
function findVideoInNestedIframes(selector, callback) {
  const checkIframes = () => {
    const iframes = document.querySelectorAll('iframe');
    let found = false;
    
    for (let i = 0; i < iframes.length; i++) {
      try {
        if (iframes[i].contentDocument) {
          // 尝试直接在iframe中查找指定选择器
          const element = iframes[i].contentDocument.querySelector(selector);
          if (element) {
            console.log('Howl-faptap: 在iframe中找到视频元素');
            callback(element);
            found = true;
            break;
          }
          
          // 如果没找到，尝试在嵌套iframe中查找
          const nestedIframes = iframes[i].contentDocument.querySelectorAll('iframe');
          for (let j = 0; j < nestedIframes.length; j++) {
            try {
              if (nestedIframes[j].contentDocument) {
                const nestedElement = nestedIframes[j].contentDocument.querySelector(selector);
                if (nestedElement) {
                  console.log('Howl-faptap: 在嵌套iframe中找到视频元素');
                  callback(nestedElement);
                  found = true;
                  break;
                }
              }
            } catch (error) {
              // 静默忽略跨域错误
            }
          }
        }
      } catch (error) {
        console.log('Howl-faptap: 访问iframe内容时出错:', error.message);
      }
    }
    
    if (!found) {
      // 如果没找到，500毫秒后重试一次
      setTimeout(checkIframes, 500);
    }
  };
  
  checkIframes();
}

// 获取视频数据
async function getVideoData(videoId) {
  return request(`/api/videos/${videoId}`);
}

// 获取脚本数据
async function getScript(url) {
  return new Promise((resolve, reject) => {
    const baseUrl = 'https://faptap.net';
    const fullUrl = `${baseUrl}/api/assets/${url}`;

    console.log('Howl-faptap: 获取脚本内容，URL:', fullUrl);

    fetch(fullUrl, { method: 'GET' })
      .then(response => {
        // 获取响应文本内容
        return response.text();
      })
      .then(text => {
        // 检查是否是错误响应
        if (text.startsWith('{"error"')) {
          console.warn('Howl-faptap: 获取脚本失败，服务器返回错误');
          reject("Failed to fetch script");
          return;
        }

        const actions = [];
        // 按行分割并处理每一行数据
        text.split('\n').forEach(line => {
          // 跳过空行
          if (line.length === 0) return;

          // 分割时间点和位置值
          const parts = line.split(",");
          const time = parseInt(parts[0]);
          const position = parseInt(parts[1]);

          // 添加有效的动作点
          actions.push([time, position]);
        });

        // 处理动作点，添加长时间间隔的中间点
        const processedActions = processActions(actions);
        resolve(processedActions);
      })
      .catch(error => {
        console.log('Howl-faptap: 获取脚本失败:', error);
        reject(error);
      });
  });
}

// 处理动作点，添加间隔超过3秒的中间点
function processActions(actions) {
  const processed = [];
  let lastIndex = -1;

  for (let i = 1; i < actions.length; i++) {
    const prev = actions[i - 1];
    const current = actions[i];
    const prevTime = prev[0];
    const currentTime = current[0];
    const prevPos = prev[1];
    const timeDiff = currentTime - prevTime;

    if (timeDiff > 3000) {
      processed.push(prev);
      const midTime = prevTime + timeDiff / 2;
      processed.push([midTime, prevPos]);
    } else {
      processed.push(prev);
    }

    lastIndex = i;
  }

  if (lastIndex >= 0) {
    processed.push(actions[lastIndex]);
  }

  return processed;
}

// 发送请求
function request(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const baseUrl = 'https://faptap.net';
    let url = baseUrl + endpoint;
    let headers = {};
    let body = data;

    if (data && !(data instanceof FormData)) {
      body = JSON.stringify(data);
      headers['Content-Type'] = 'application/json';
    }

    fetch(url, {
      method,
      headers,
      body,
      credentials: 'include'
    })
      .then(response => {
        // 首先检查响应状态
        if (!response.ok) {
          console.warn('Howl-faptap: HTTP请求失败，状态码: ' + response.status);
          // 不抛出错误，而是返回null，让调用者决定如何处理
          resolve(null);
          return;
        }
        // 检查响应内容类型
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return response.json().catch(error => {
            console.warn('Howl-faptap: JSON解析失败:', error.message);
            return null;
          });
        } else {
          // 如果不是JSON，获取文本内容以便调试
          return response.text().then(text => {
            console.log('Howl-faptap: 收到text文本响应= ', text);
            return null; // 返回null而不是抛出错误
          });
        }
      })
      .then(result => {
        // 处理返回的结果
        if (result === null) {
          resolve(null);
          return;
        }

        if (result.error) {
          console.warn('Howl-faptap: API返回错误:', result.error);
          resolve(null);
        } else {
          resolve(result.data || result);
        }
      })
      .catch(error => {
        console.log('Howl-faptap: 请求失败:', error.message);
        // 捕获所有错误并返回null，确保调用者不会崩溃
        resolve(null);
      });
  });
}

// 初始化注入，提取视频ID和脚本数据
async function initInject() {
  try {
    // 检查是否是iframe.mediadelivery.net域名，如果是则使用缓存的funscript
    if (window.location.hostname === 'iframe.mediadelivery.net') {
      console.log('Howl-faptap: iframe.mediadelivery.net域名，尝试从缓存加载funscript');

      // 从缓存获取funscript数据
      const cachedData = await new Promise(resolve => {
        chrome.storage.local.get(['cached_funscript'], result => {
          resolve(result.cached_funscript || null);
        });
      });

      if (cachedData) {
        console.log('Howl-faptap: 从缓存成功加载funscript数据');

        // 调用load_funscript
        const response = await sendMessageToBackground('load_funscript', {
          title: cachedData.metadata.title || '视频',
          funscriptContent: JSON.stringify(cachedData)
        });

        if (response.success) {
          console.log('Howl-faptap:  Funscript加载成功');
        } else {
          console.log('Howl-faptap:  Funscript加载失败:', response.error || '未知错误');
        }

        // 为iframe.mediadelivery.net页面设置video事件监听，使用main-video作为选择器

        // 注册video事件监听
        setupVideoEventListeners('video#main-video');
        return;
      } else {
        console.log('Howl-faptap: 缓存中没有找到funscript数据');
        return;
      }
    }

    // 检查serverAddress是否存在
    const config = await sendMessageToBackground('get_config');
    if (!config || !config.data.serverAddress) {
      console.log('Howl-faptap: Howl服务器地址未配置');
      return;
    } else {
      console.log('Howl-faptap:  Howl服务器地址:', config.data.serverAddress, '同步延迟:', config.data.syncDelay);
    }

    // 提取视频ID
    const match = window.location.href.match(/v\/([a-zA-Z0-9]+)/);
    if (!match) {
      console.log('Howl-faptap: 当前页面不是视频页面，无需注入');
      return;
    }

    const videoId = match[1];
    console.log('Howl-faptap: 当前视频ID:', videoId);

    // 获取视频数据 - 现在getVideoData可能返回null
    const videoData = await getVideoData(videoId);

    // 检查视频数据是否有效
    if (!videoData) {
      console.log("Howl-faptap: 视频id = ", videoId, " 视频数据为空");
      return;
    }

    console.log("Howl-faptap: 视频id = ", videoId, " 视频数据 = ", videoData);

    // 检查脚本数据是否存在
    if (!videoData.script || !videoData.script.url) {
      console.log('Howl-faptap: 该视频没有脚本数据或脚本URL');
      return;
    }

    // 获取脚本数据 - 现在getScript返回空数组而不是抛出错误
    const scriptData = await getScript(videoData.script.url);

    console.log("Howl-faptap: 视频id = ", videoId, " 脚本数据 = ", scriptData);
    // 检查脚本数据是否有效
    if (!scriptData || scriptData.length === 0) {
      console.log('Howl-faptap: 脚本数据为空或无效');
      return;
    }

    // 构建funscript数据格式
    const funscript = {
      metadata: {
        title: videoData.name || `视频 ${videoId}`,
        description: videoData.description || '',
        performers: videoData.performers ? videoData.performers.map(p => p.name).filter(Boolean) : [],
        video_url: videoData.stream_url || window.location.href,
        tags: videoData.tags ? videoData.tags.map(t => t.name).filter(Boolean) : [],
        duration: videoData.duration ? videoData.duration * 1000 : 0,
        average_speed: videoData.script?.average_speed || 0,
        creator: videoData.user?.username || 'unknown'
      },
      actions: scriptData.map(s => ({
        at: s[0],
        pos: s[1]
      }))
    };

    console.log('Howl-faptap: 构建的funscript数据 = ', funscript);

    // 等待目标元素加载完成后再添加下载按钮
    waitForElement('.gap-y-2 .relative .scroller button:first-child', (likeBtn) => {
      if (likeBtn && likeBtn.parentNode) {
        // 添加打包下载按钮（不依赖downloadable属性，始终显示）
        const packBtn = document.createElement("button");
        packBtn.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="currentColor" d="M20,6H12V4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6M12,18A3,3 0 0,1 9,15A3,3 0 0,1 12,12A3,3 0 0,1 15,15A3,3 0 0,1 12,18M13,9V3.5L18.5,9H13Z"></path></svg><span>打包下载</span>';
        packBtn.setAttribute("class", "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 block rounded-md px-3 py-1.5 text-center font-semibold md:text-sm overflow-hidden disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed flex gap-2 items-center");

        // 定义函数：获取视频源数据
        async function fetchVideoSources() {
          try {
            console.log("Howl-faptap: 开始获取视频源数据...");
            // 使用用户提供的API端点
            const apiUrl = "https://faptap.net/api/videos/1696299524936437762/sources";
            const response = await fetch(apiUrl);

            if (!response.ok) {
              throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            console.log("Howl-faptap: 成功获取视频源数据:", data);
            return data.data || [];
          } catch (error) {
            console.log("Howl-faptap: 获取视频源失败:", error);
            return [];
          }
        }

        // 定义函数：显示视频质量选择对话框
        function showVideoQualityDialog(sources) {
          return new Promise((resolve, reject) => {
            // 创建对话框容器
            const dialogContainer = document.createElement('div');
            dialogContainer.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(0, 0, 0, 0.7);
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 9999;
              font-family: Arial, sans-serif;
            `;

            // 创建对话框内容
            const dialogContent = document.createElement('div');
            dialogContent.style.cssText = `
              background-color: #2a2a2a;
              color: white;
              padding: 20px;
              border-radius: 10px;
              width: 90%;
              max-width: 500px;
              max-height: 80vh;
              overflow-y: auto;
            `;

            // 创建对话框标题
            const dialogTitle = document.createElement('h3');
            dialogTitle.textContent = '选择视频质量';
            dialogTitle.style.marginTop = '0';
            dialogContent.appendChild(dialogTitle);

            // 创建选项列表
            const optionsContainer = document.createElement('div');
            optionsContainer.style.marginBottom = '20px';

            let selectedSource = null;

            sources.forEach((source, index) => {
              const optionDiv = document.createElement('div');
              optionDiv.style.cssText = `
                padding: 10px;
                margin: 5px 0;
                border-radius: 5px;
                cursor: pointer;
                border: 2px solid transparent;
              `;

              optionDiv.onmouseenter = () => {
                optionDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              };

              optionDiv.onmouseleave = () => {
                if (selectedSource !== source) {
                  optionDiv.style.backgroundColor = 'transparent';
                }
              };

              optionDiv.onclick = () => {
                // 重置所有选项的样式
                optionsContainer.querySelectorAll('div').forEach(el => {
                  el.style.backgroundColor = 'transparent';
                  el.style.borderColor = 'transparent';
                });

                // 设置当前选中选项的样式
                optionDiv.style.backgroundColor = 'rgba(66, 153, 225, 0.3)';
                optionDiv.style.borderColor = '#4299e1';
                selectedSource = source;
              };

              optionDiv.textContent = `${source.quality}p - ${source.format.toUpperCase()}`;
              optionsContainer.appendChild(optionDiv);

              // 默认选中第一个选项
              if (index === 0) {
                optionDiv.click();
              }
            });

            dialogContent.appendChild(optionsContainer);

            // 创建按钮容器
            const buttonsContainer = document.createElement('div');
            buttonsContainer.style.display = 'flex';
            buttonsContainer.style.justifyContent = 'flex-end';
            buttonsContainer.style.gap = '10px';

            // 创建取消按钮
            const cancelButton = document.createElement('button');
            cancelButton.textContent = '取消';
            cancelButton.style.cssText = `
              padding: 8px 16px;
              border: none;
              border-radius: 5px;
              background-color: #4a4a4a;
              color: white;
              cursor: pointer;
            `;
            cancelButton.onclick = () => {
              document.body.removeChild(dialogContainer);
              reject(new Error('用户取消选择'));
            };

            // 创建确定按钮
            const confirmButton = document.createElement('button');
            confirmButton.textContent = '确定';
            confirmButton.style.cssText = `
              padding: 8px 16px;
              border: none;
              border-radius: 5px;
              background-color: #4299e1;
              color: white;
              cursor: pointer;
            `;
            confirmButton.onclick = () => {
              document.body.removeChild(dialogContainer);
              resolve(selectedSource);
            };

            buttonsContainer.appendChild(cancelButton);
            buttonsContainer.appendChild(confirmButton);
            dialogContent.appendChild(buttonsContainer);
            dialogContainer.appendChild(dialogContent);
            document.body.appendChild(dialogContainer);
          });
        }

        // 定义函数：使用选定的视频源下载视频
        async function downloadVideoWithSource(selectedSource) {
          try {
            console.log("Howl-faptap: 使用选定的视频源下载视频:", selectedSource);

            // 拼接完整的视频URL（按照API返回的数据结构，需要拼接/api/）
            const baseUrl = "https://faptap.net/api/";
            const fullVideoUrl = baseUrl + selectedSource.url;

            console.log("Howl-faptap: 完整视频URL:", fullVideoUrl);

            // 创建下载链接
            const videoLink = document.createElement('a');
            videoLink.href = fullVideoUrl;
            videoLink.download = `${videoData.name}.${selectedSource.format}`;
            document.body.appendChild(videoLink);

            // 触发下载
            videoLink.click();

            // 清理
            setTimeout(() => {
              document.body.removeChild(videoLink);
            }, 100);

            console.log("Howl-faptap: 视频下载已触发");
            return true;
          } catch (error) {
            console.log("Howl-faptap: 视频下载失败:", error);
            return false;
          }
        }

        // 定义打包下载按钮点击事件处理函数
        packBtn.onclick = async () => {
          try {
            console.log("Howl-faptap: 开始打包下载流程...");

            // 1. 获取视频源数据
            const videoSources = await fetchVideoSources();

            if (!videoSources || videoSources.length === 0) {
              console.log("Howl-faptap: 没有找到可用的视频源");
              alert("无法获取视频源数据，请稍后重试");
              return;
            }

            // 2. 显示视频质量选择对话框
            const selectedSource = await showVideoQualityDialog(videoSources);

            if (!selectedSource) {
              console.log("Howl-faptap: 用户未选择视频源");
              return;
            }

            // 3. 使用选定的视频源下载视频
            const videoDownloaded = await downloadVideoWithSource(selectedSource);

            // 4. 下载funscript文件
            setTimeout(() => {
              try {
                console.log("Howl-faptap: 开始下载funscript...");
                const scriptLink = document.createElement('a');
                scriptLink.href = "data:text/plain;charset=utf-8," + encodeURIComponent(JSON.stringify(funscript));
                scriptLink.download = `${videoData.name}.funscript`;
                document.body.appendChild(scriptLink);
                scriptLink.click();
                document.body.removeChild(scriptLink);
                console.log("Howl-faptap: funscript下载已触发");
              } catch (error) {
                console.log("Howl-faptap: funscript下载失败:", error);
              }
            }, 1000);

            console.log("Howl-faptap: 打包下载流程已完成");
          } catch (error) {
            console.log("Howl-faptap: 打包下载流程失败:", error);
            if (error.message !== '用户取消选择') {
              alert(`下载失败: ${error.message}`);
            }
          }
        };

        likeBtn.parentNode.insertBefore(packBtn, likeBtn.nextSibling); // 添加到likeBtn右侧
        console.log("Howl-faptap: 打包下载按钮已成功添加");

        // 添加新窗口播放按钮
        if (videoData.stream_url_selfhosted) {
          const newWindowBtn = document.createElement("button");
          newWindowBtn.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="currentColor" d="M21,16V8H20V15H9V16H21M3,4H16V6H3V4M19,3H4A2,2 0 0,0 2,5V18A2,2 0 0,0 4,20H16A2,2 0 0,0 18,18V7L12,13H18V18H4V5H19V3Z"></path></svg><span>新窗口播放</span>';
          newWindowBtn.setAttribute("class", "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 block rounded-md px-3 py-1.5 text-center font-semibold md:text-sm overflow-hidden disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed flex gap-2 items-center ml-2");

          newWindowBtn.onclick = () => {
            try {
              console.log("Howl-faptap: 打开新窗口播放视频");
              // 从videoData获取stream_url_selfhosted并在新标签页打开
              window.open(videoData.stream_url_selfhosted, '_blank');
              console.log("Howl-faptap: 新窗口已打开");
            } catch (error) {
              console.log("Howl-faptap: 打开新窗口失败:", error);
              alert("无法在新窗口中打开视频，请稍后重试");
            }
          };

          likeBtn.parentNode.insertBefore(newWindowBtn, packBtn.nextSibling); // 添加到packBtn右侧
          console.log("Howl-faptap: 新窗口播放按钮已成功添加");
        }

        // 如果视频不可下载，才添加Script下载按钮
        if (false === videoData.downloadable) {
          // 添加Script下载按钮
          const r = document.createElement("a");
          r.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"></path></svg><span>Script</span>';
          r.setAttribute("class", "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 block rounded-md px-3 py-1.5 text-center font-semibold md:text-sm overflow-hidden disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-x-2 !px-3 ml-2");
          r.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(JSON.stringify(funscript)));
          r.setAttribute("download", `${videoData.name}.funscript`);
          likeBtn.parentNode.insertBefore(r, likeBtn.nextSibling); // 添加到likeBtn右侧
          console.log("Howl-faptap: Script下载按钮已成功添加");
        }
      }
    });

    // 缓存funscript数据到chrome.storage.local，以便popup页面可以访问
    try {
      chrome.storage.local.set({
        'cached_funscript': funscript
      }, () => {
        console.log('Howl-faptap: Funscript数据已缓存到本地存储');
      });
    } catch (cacheError) {
      console.log('Howl-faptap: 缓存funscript数据失败:', cacheError);
    }

    // 向background发送funscript数据
    try {
      const response = await sendMessageToBackground('load_funscript', {
        title: videoData.name || `视频 ${videoId}`,
        funscriptContent: JSON.stringify(funscript)
      });

      if (response.success) {
        console.log('Howl-faptap:  Funscript加载成功');
      } else {
        console.log('Howl-faptap:  Funscript加载失败:', response.error || '未知错误');
      }

      // 注册video事件监听
      setupVideoEventListeners('video#player');

    } catch (error) {
      console.log('Howl-faptap:  发送funscript到background失败:', error.message);
    }
  } catch (error) {
    console.log('Howl-faptap: 初始化过程出错:', error);
  }
}

// 设置视频事件监听器
function setupVideoEventListeners(videlSelector) {
  let isActive = false;
  let lastPosition = 0;
  let syncTimeout = null;
  let syncDelay = 500; // 默认同步延迟

  // 获取配置
  sendMessageToBackground('get_config')
    .then(config => {
      if (config.syncDelay !== undefined) {
        syncDelay = config.syncDelay;
      }
    })
    .catch(error => {
      console.log('Howl-faptap: 获取配置失败:', error);
    });



  // 同步视频位置到Howl服务
  const syncVideoPosition = (video, startPlayer = false) => {
    if (!video) return;

    const currentTime = video.currentTime;

    if (startPlayer) {
      sendMessageToBackground('start_player', { fromTime: currentTime })
        .catch(error => console.log('Howl-faptap: 启动播放器失败:', error));
    } else {
      sendMessageToBackground('seek', { position: currentTime })
        .catch(error => console.log('Howl-faptap: 定位失败:', error));
    }

    lastPosition = currentTime;
  };

  let waitingTimer = null;
  let canPlayTimer = null;
  const DEBOUNCE_DELAY = 300; // 防抖延迟时间（毫秒）

  // 处理视频缓冲事件（对应preparing状态）
  const handleWaiting = () => {
    // 清除之前的等待计时器
    if (waitingTimer) {
      clearTimeout(waitingTimer);
    }

    // 设置新的等待计时器，避免频繁触发
    waitingTimer = setTimeout(() => {
      console.log('Howl-faptap: 视频进入缓冲状态（preparing）');
      isActive = false; // 缓冲时设为非活动状态

      // 清除任何待处理的超时
      if (syncTimeout) {
        clearTimeout(syncTimeout);
        syncTimeout = null;
      }

      // 发送stop_player请求
      sendMessageToBackground('stop_player')
        .catch(error => console.log('Howl-faptap:  停止播放器失败:', error));
    }, DEBOUNCE_DELAY);
  };

  // 处理视频可播放事件
  const handleCanPlay = () => {
    // 清除之前的可播放计时器
    if (canPlayTimer) {
      clearTimeout(canPlayTimer);
    }

    // 设置新的可播放计时器，避免频繁触发
    canPlayTimer = setTimeout(() => {
      console.log('Howl-faptap: 视频恢复可播放状态（READY）');

      // 使用通过事件监听的视频元素
      const video = findVideoElement(videlSelector);
      if (video && !video.paused && video.currentTime > 0) {
        console.log('Howl-faptap: 视频处于READY且正在播放，启动播放器');
        isActive = true;
        syncVideoPosition(video, true); // 启动播放器
      }
    }, DEBOUNCE_DELAY);
  };

  // 处理视频播放事件（同时处理视频请求和实际播放，不再区分play和playing）
  const handlePlay = (event) => {
    isActive = true;
    console.log('Howl-faptap: 视频处于READY状态，开始播放');

    // 清除任何待处理的超时
    if (syncTimeout) clearTimeout(syncTimeout);

    // 使用事件源作为视频元素
    const video = event?.target || findVideoElement(videlSelector);
    // 直接在这里发送start_player请求，不再区分是否缓冲完成
    syncVideoPosition(video, true);
  };

  // 处理视频暂停事件
  const handlePause = (event) => {
    isActive = false;
    console.log('Howl-faptap: 视频暂停');

    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    sendMessageToBackground('stop_player')
      .catch(error => console.log('Howl-faptap: 停止播放器失败:', error));
  };

  // 处理视频跳转事件
  const handleSeeked = (event) => {
    // 使用事件源作为视频元素
    const video = event?.target || findVideoElement(videlSelector);
    if (!video) return;

    const currentTime = video.currentTime;
    const positionDiff = Math.abs(currentTime - lastPosition);

    // 如果位置变化超过1秒，才同步
    if (positionDiff > 1) {
      console.log('Howl-faptap: 视频位置跳转:', currentTime);
      // 同步位置
      syncVideoPosition(video, false);

      // 检查视频是否正在播放（不是暂停状态）
      if (!video.paused) {
        console.log('Howl-faptap: 视频在跳转后处于播放状态，调用start_player');
        isActive = true;
        // 发送start_player请求
        sendMessageToBackground('start_player')
          .catch(error => console.log('Howl-faptap: 启动播放器失败:', error));
      }
    }
  };

  // 处理视频结束事件
  const handleEnded = () => {
    isActive = false;
    console.log('Howl-faptap: 视频播放结束');

    if (syncTimeout) {
      clearTimeout(syncTimeout);
      syncTimeout = null;
    }

    sendMessageToBackground('stop_player')
      .catch(error => console.log('Howl-faptap: 停止播放器失败:', error));
  };

  // 监听视频元素
  waitForElement(videlSelector, (videoElement) => {
    console.log('Howl-faptap: 找到视频元素，开始监听事件');

    // 添加事件监听器
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('waiting', handleWaiting); // 缓冲事件
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('seeked', handleSeeked);
    videoElement.addEventListener('ended', handleEnded);
    videoElement.addEventListener('canplay', handleCanPlay); // 视频恢复可播放状态事件

    // 如果视频已经在播放，激活同步
    if (!videoElement.paused && videoElement.currentTime > 0) {
      handlePlay();
    }

    // 清理函数
    window.addEventListener('beforeunload', () => {
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('waiting', handleWaiting);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('seeked', handleSeeked);
      videoElement.removeEventListener('ended', handleEnded);
      videoElement.removeEventListener('canplay', handleCanPlay);

      // 清除所有计时器
      if (syncTimeout) clearTimeout(syncTimeout);
      if (waitingTimer) clearTimeout(waitingTimer);
      if (canPlayTimer) clearTimeout(canPlayTimer);

      if (isActive) {
        sendMessageToBackground('stop_player')
          .catch(() => { });
      }
    });
  });
}

// 页面加载完成后初始化
function initializeExtension() {
  // 添加详细日志以诊断匹配问题
  console.log('Howl-faptap: 当前页面信息: hostname=' + window.location.hostname + ', pathname=' + window.location.pathname);
  
  const isVideoPage = window.location.pathname.startsWith('/v/');
  const isIframeMediaPage = (window.location.hostname === 'iframe.mediadelivery.net' && window.location.pathname === '/play');
  const isIframeMediaPagePartial = (window.location.hostname.includes('mediadelivery.net') && window.location.pathname.includes('/play'));
  
  console.log('Howl-faptap:  路径以/v/开头: ' + isVideoPage);
  console.log('Howl-faptap:  是否为iframe.mediadelivery.net/play: ' + isIframeMediaPage);
  console.log('Howl-faptap:  是否包含mediadelivery.net和play: ' + isIframeMediaPagePartial);
  
  // 检查当前是否在视频页面或新的iframe播放页面
  if (isVideoPage || isIframeMediaPagePartial) {
    console.log('Howl-faptap:  在视频页面或iframe播放页面，初始化扩展');
    initInject();
  } else {
    console.log('Howl-faptap:  不在视频页面或iframe播放页面，不执行初始化');
  }
}

// 首次加载时初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// 监听URL变化（用于SPA应用）
let currentUrl = window.location.href;

// 使用MutationObserver监听页面变化
const observer = new MutationObserver((mutations) => {
  // 检查URL是否发生变化
  if (window.location.href !== currentUrl) {
    console.log('Howl-faptap:  URL已变化:', currentUrl, '->', window.location.href);
    currentUrl = window.location.href;

    // 如果切换到视频页面或iframe播放页面，重新初始化
    const isVideoPage = window.location.pathname.startsWith('/v/');
    const isIframeMediaPagePartial = (window.location.hostname.includes('mediadelivery.net') && window.location.pathname.includes('/play'));
    
    if (isVideoPage || isIframeMediaPagePartial) {
      console.log('Howl-faptap:  切换到视频页面或iframe播放页面，重新初始化扩展');
      initializeExtension();
    }
  }
});

// 配置并启动观察者，监听整个文档的变化
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true
});

// 监听popstate事件（用户点击前进/后退按钮时触发）
window.addEventListener('popstate', () => {
  console.log('Howl-faptap:  检测到历史导航');
  // 延迟执行以确保DOM已更新
  setTimeout(() => {
    if (window.location.pathname.startsWith('/v/')) {
      console.log('Howl-faptap:  通过历史导航进入视频页面');
      initializeExtension();
    }
  }, 100);
});

// 改进版URL变化监听逻辑，添加防抖功能
let initTimer = null;
const INIT_DEBOUNCE_DELAY = 1000; // 初始化防抖延迟（毫秒）

// 改进URL变化检测逻辑，加入防抖功能
function debouncedInitialize() {
  // 清除之前的计时器
  if (initTimer) {
    clearTimeout(initTimer);
  }

  // 设置新的计时器，实现防抖
  initTimer = setTimeout(() => {
    console.log('Howl-faptap:  防抖延迟后执行初始化');
    initializeExtension();
  }, INIT_DEBOUNCE_DELAY);
}

// 更新现有的事件监听器，使用防抖初始化函数
function updateEventListeners() {
  // 移除之前可能存在的事件监听器，避免重复绑定
  const oldPopStateHandler = window.onpopstate;
  if (oldPopStateHandler) {
    window.removeEventListener('popstate', oldPopStateHandler);
  }

  // 绑定新的popstate事件处理
  window.addEventListener('popstate', () => {
    console.log('Howl-faptap:  检测到历史导航事件');
    debouncedInitialize();
  });

  // 绑定hashchange事件处理
  window.addEventListener('hashchange', () => {
    console.log('Howl-faptap:  检测到URL哈希变化');
    debouncedInitialize();
  });
}

// 调用更新事件监听器函数
updateEventListeners();

// 页面卸载时清理监听器
window.addEventListener('beforeunload', () => {
  // 清除初始化计时器
  if (initTimer) {
    clearTimeout(initTimer);
    initTimer = null;
  }
});