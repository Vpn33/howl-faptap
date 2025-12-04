
// 查找视频元素
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

// 获取视频标题的函数
function getVideoTitle() {
    // 根据不同网站使用不同的标题选择器
    const isPixeldrainPage = (window.location.hostname.includes('pixeldrain.com') && window.location.pathname.includes('/u'));
    const isRule34videoPage = (window.location.hostname.includes('rule34video.com') && window.location.pathname.includes('/video'));
    const isMegaPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/file'));
    const isMegaFolderPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/folder'));
    const isGoFilePage = (window.location.hostname.includes('gofile.io') && window.location.pathname.includes('/d'));
    const isXhamsterPage = (window.location.hostname.includes('xhamster.com') && window.location.pathname.includes('/videos'));
    
    let titleElement;
    
    if (isPixeldrainPage) {
        titleElement = document.querySelector('.file_viewer_headerbar_title');
    } else if (isRule34videoPage) {
        titleElement = document.querySelector('.title_video');
    } else if (isMegaPage) {
        titleElement = document.querySelector('.title-block.big-txt .filename');
    } else if (isMegaFolderPage) {
        titleElement = document.querySelector('.file-info .filename');
    } else if (isGoFilePage) {
        titleElement = document.querySelector('.div.truncate a');
    } else if (isXhamsterPage) {
        titleElement = document.querySelector('[data-role="video-title"] h1');
    } else {
        // 尝试一些通用的标题选择器
        titleElement = document.querySelector('h1') || 
                      document.querySelector('h2') || 
                      document.querySelector('title');
    }
    
    if (titleElement) {
        // 提取视频标题（去掉文件后缀和特殊字符）
        return titleElement.textContent.replace(/\.[^/.]+$/, '').trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_');
    }
    
    return 'video';
}

// 设置视频事件监听器
function setupVideoEventListeners(videlSelector) {
    let isActive = false;
    let lastPosition = 0;
    let syncTimeout = null;


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

        // 创建视频下载按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '下载视频';
        downloadBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            border-radius: 4px;
            z-index: 9999;
        `;
        
        // 添加下载点击事件
        downloadBtn.addEventListener('click', async () => {
            try {
                // 获取视频URL
                const videoUrl = videoElement.src || videoElement.querySelector("source")?.src;
                if (!videoUrl) {
                    console.log('Howl-faptap: 无法获取视频URL');
                    alert('无法获取视频URL');
                    return;
                }
                
                console.log('Howl-faptap: 视频URL:', videoUrl);
                
                // 获取视频标题作为文件名
                const videoTitle = getVideoTitle();
                
                // 获取视频格式（从URL中提取）
                const videoFormat = videoUrl.split('.').pop().split('?')[0].slice(0, 4);
                const fileExtension = ['mp4', 'webm', 'ogg', 'mov'].includes(videoFormat.toLowerCase()) ? videoFormat : 'mp4';
                
                // 创建下载链接
                const downloadLink = document.createElement('a');
                downloadLink.href = videoUrl;
                downloadLink.download = `${videoTitle}.${fileExtension}`;
                
                // 触发下载
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                
                console.log('Howl-faptap: 视频下载已开始');
            } catch (error) {
                console.error('Howl-faptap: 视频下载失败:', error);
                alert('视频下载失败: ' + error.message);
            }
        });
        
        // 将下载按钮添加到视频元素的父容器
        if (videoElement.parentElement) {
            // 确保父容器是相对定位的，以便按钮的绝对定位生效
            if (getComputedStyle(videoElement.parentElement).position === 'static') {
                videoElement.parentElement.style.position = 'relative';
            }
            
            videoElement.parentElement.appendChild(downloadBtn);
        }
    });
}

// 向background发送消息的函数
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
function waitForElement(selector, callback, timeout = 600000) {
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
        }
    };

    checkElement();
}