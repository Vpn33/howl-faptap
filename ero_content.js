// 页面加载完成后初始化
function initializeExtension() {
    // 添加详细日志以诊断匹配问题
    console.log('Howl-faptap: 当前页面信息: hostname=' + window.location.hostname + ', pathname=' + window.location.pathname);

    const isEroScriptPage = (window.location.hostname.includes('eroscripts.com') && window.location.pathname.includes('/t'));
    console.log('Howl-faptap:  是否为eroscripts.com/t: ' + isEroScriptPage);

    // 检查当前是否在视频页面或新的iframe播放页面
    if (isEroScriptPage) {
        console.log('Howl-faptap:  在eroscripts.com/t页面，初始化扩展');
        initInject();
    } else {
        console.log('Howl-faptap:  不在eroscripts.com/t页面，不执行初始化');
    }
}

// 等待元素加载完成
function waitForElement(selector, callback, timeout = 10000) {
    const interval = 100;
    const maxAttempts = timeout / interval;
    let attempts = 0;

    const checkElement = () => {
        const element = document.querySelectorAll(selector);
        if (element && element.length > 0) {
            callback(element);
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(checkElement, interval);
        } else {
            console.log(`Howl-faptap: 等待元素超时: ${selector}`);
        }
    };

    checkElement();
}

initInject = () => {
    waitForElement('.cooked a[download$=".funscript"].funscript-link-container, .cooked a[href$=".funscript"].funscript-link-container', async (titleElements) => {
        // 循环处理每个DOM元素
        const funscripts = [];
        for (const titleElement of titleElements) {
            const title = titleElement.querySelector('a').textContent.trim();

            console.log('Howl-faptap:  检测到脚本链接:', titleElement.href, '脚本名称:', title);
            try {
                const funscript = await getFunscript(titleElement.href);

                // 设置脚本标题
                if (!funscript.metadata) {
                    funscript.metadata = {};
                }
                if (!funscript.metadata.title) {
                    funscript.metadata.title = title;
                }
                console.log('Howl-faptap:  脚本内容:', funscript);
                // 缓存funscript数据到chrome.storage.local，以便popup页面可以访问
                try {
                    funscripts.push(funscript);
                } catch (cacheError) {
                    console.log('Howl-faptap: 缓存funscript数据失败:', cacheError);
                }
            } catch (error) {
                console.log('Howl-faptap: 获取Funscript数据失败:', error);
            }
        }
        // 获取现有缓存数据并合并
        chrome.storage.local.get(['cached_funscripts'], (result) => {
            const existingFunscripts = result.cached_funscripts || [];
            
            // 获取配置以检查最大缓存数量
            chrome.storage.sync.get(['maxCachedScripts'], configResult => {
                const maxCachedScripts = configResult.maxCachedScripts || 10;
                
                // 合并新获取的Funscript和现有数据，避免重复
                const updatedFunscripts = [...existingFunscripts];
                for (const newFunscript of funscripts) {
                    const existingIndex = updatedFunscripts.findIndex(funscript => {
                        return funscript.metadata?.title === newFunscript.metadata?.title;
                    });
                    if (existingIndex === -1) {
                        updatedFunscripts.push(newFunscript);
                        
                        // 检查是否超过最大缓存数量
                        if (updatedFunscripts.length > maxCachedScripts) {
                            // 移除最旧的脚本（数组中的第一个）
                            updatedFunscripts.shift();
                        }
                    } else {
                        // 如果标题相同，更新现有数据
                        updatedFunscripts[existingIndex] = newFunscript;
                    }
                }
                
                // 保存更新后的数组
                chrome.storage.local.set({
                    'cached_funscripts': updatedFunscripts
                }, () => {
                    console.log('Howl-faptap: Funscript数据已缓存到本地存储');
                });
            });
        });
        
        // 向background发送funscript数据
        if (funscripts.length == 1) {
            try {
                sendMessageToBackground('load_funscript', {
                    title: funscripts[0].metadata.title,
                    funscriptContent: JSON.stringify(funscripts[0])
                }).then(response => {
                    if (response.success) {
                        console.log('Howl-faptap:  Funscript加载成功');
                    } else {
                        console.log('Howl-faptap:  Funscript加载失败:', response.error || '未知错误');
                    }
                });
            } catch (sendError) {
                console.log('Howl-faptap: 发送Funscript数据失败:', sendError);
            }
        }
    });
}
// 发送消息到background脚本
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

async function getFunscript(url) {
    return fetch(url)
        .then(response => response.json())
        .then(data => {
            console.log('Howl-faptap:  ' + url + ' 成功获取脚本数据:', data);
            return data;
        })
        .catch(error => {
            console.error('Howl-faptap:  ' + url + ' 获取脚本数据失败:', error);
            throw error;
        });
}

initializeExtension();
