function initVideoListener() {
    const isPornHubPage = (window.location.hostname.includes('pornhub.com') && window.location.pathname.includes('/view_video.php'));
    console.log('Howl-faptap:  是否为 pornhub.com/view_video: ' + isPornHubPage);
    const isXVideoPage = (window.location.hostname.includes('xvideos.com') && window.location.pathname.includes('/video.'));
    console.log('Howl-faptap:  是否为 xvideos.com/videos.: ' + isXVideoPage);
    const isXhamsterPage = (window.location.hostname.includes('xhamster.com') && window.location.pathname.includes('/videos'));
    console.log('Howl-faptap:  是否为 xhamster.com/videos: ' + isXhamsterPage);
    const isPixeldrainPage = (window.location.hostname.includes('pixeldrain.com') && window.location.pathname.includes('/u'));
    console.log('Howl-faptap:  是否为 pixeldrain.com/u: ' + isPixeldrainPage);
    const isRule34videoPage = (window.location.hostname.includes('rule34video.com') && window.location.pathname.includes('/video'));
    console.log('Howl-faptap:  是否为 rule34video.com/video: ' + isRule34videoPage);
    const isMegaPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/file'));
    console.log('Howl-faptap:  是否为 mega.nz/file: ' + isMegaPage);
    const isMegaFolderPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/folder'));
    console.log('Howl-faptap:  是否为 mega.nz/folder: ' + isMegaFolderPage);
    const isGoFilePage = (window.location.hostname.includes('gofile.io') && window.location.pathname.includes('/d'));
    console.log('Howl-faptap:  是否为 gofile.io/d: ' + isGoFilePage);
    const isSpankbangPage = (window.location.hostname.includes('spankbang.com') && window.location.pathname.includes('/video'));
    console.log('Howl-faptap:  是否为 spankbang.com/video: ' + isSpankbangPage);


    if (isPornHubPage) {
        // 获取视频标题元素
        autoLoadFunscript('.title-container h1');
        setupVideoEventListeners('video.mgp_videoElement');
    } else if (isXVideoPage) {
        // 获取视频标题元素
        autoLoadFunscript('.page-title');
        setupVideoEventListeners('#html5video video');
    } else if (isXhamsterPage) {
        // 获取视频标题元素
        autoLoadFunscript('[data-role="video-title"] h1');
        setupVideoEventListeners('video#xplayer__video');
    } else if (isPixeldrainPage) {
        // 获取视频标题元素
        autoLoadFunscript('.file_viewer_headerbar_title');
        setupVideoEventListeners('video');
    } else if (isRule34videoPage) {
        // 获取视频标题元素
        autoLoadFunscript('.title_video');
        setupVideoEventListeners('video');
    } else if (isMegaPage || isMegaFolderPage) {
        // 获取视频标题元素
        if (isMegaPage) {
            autoLoadFunscript('.title-block.big-txt .filename');
            setupVideoEventListeners('video#video');
        } else {
            autoLoadFunscript('.file-info .filename');
            setupVideoEventListeners('video#video');
        }
    } else if (isGoFilePage) {
        // 获取视频标题元素
        autoLoadFunscript('.div.truncate a');
        setupVideoEventListeners('video');
    } else if (isSpankbangPage) {
        // 获取视频标题元素
        autoLoadFunscript('.main_content_title');
        setupVideoEventListeners('video#main_video_player_html5_api');
    } else {
        // 从缓存读取监听器列表
        chrome.storage.local.get(['listeners'], function (result) {
            const listeners = result.listeners || [];

            if (listeners.length > 0) {
                // 获取当前页面 URL
                const currentUrl = window.location.href;

                // 遍历监听器列表，查找匹配的监听器（从后往前找，优先匹配后面添加的）
                for (let i = listeners.length - 1; i >= 0; i--) {
                    const listener = listeners[i];
                    try {
                        // 使用正则表达式匹配 URL
                        const regex = new RegExp(listener.url);
                        if (regex.test(currentUrl)) {
                            console.log('Howl-faptap: 匹配到自定义监听器:', listener.url);
                            autoLoadFunscript(listener.titleSelector);
                            setupVideoEventListeners(listener.videoSelector);
                            return; // 找到第一个匹配的监听器就返回
                        }
                    } catch (e) {
                        console.log('Howl-faptap: URL 正则表达式错误:', e, '监听器 URL:', listener.url);
                    }
                }
            }

            // 如果没有自定义监听器匹配，使用原有的网站特定检测逻辑
        });
    }
    return;
}

function autoLoadFunscript(titleSelector) {
    waitForElement(titleSelector, (titleElement) => {
        if (titleElement) {
            // 提取视频标题（去掉文件后缀）
            const videoTitle = titleElement.textContent.replace(/\.[^/.]+$/, '').trim();
            console.log('Howl-faptap: 视频标题:', videoTitle);

            // 从缓存获取 Funscript 列表
            chrome.storage.local.get(['cached_funscripts'], (result) => {
                const funscripts = result.cached_funscripts || [];

                // 查找匹配的 Funscript
                const matchingFunscript = funscripts.find(funscript => {
                    const funscriptTitle = funscript.metadata?.title?.replace(/\.[^/.]+$/, '') || '';
                    return funscriptTitle === videoTitle;
                });

                if (matchingFunscript) {
                    console.log('Howl-faptap: 找到匹配的 Funscript:', matchingFunscript.metadata?.title);
                    // 发送更新选中状态的消息
                    chrome.runtime.sendMessage({
                        action: 'update_funscript_selection',
                        funscriptTitle: matchingFunscript.metadata?.title || '缓存的 Funscript'
                    });
                    // 发送 load_funscript 请求到 background
                    chrome.runtime.sendMessage({
                        action: 'load_funscript',
                        title: matchingFunscript.metadata?.title || '缓存的 Funscript',
                        funscriptContent: JSON.stringify(matchingFunscript)
                    }, (response) => {
                        if (response && response.success) {
                            console.log('Howl-faptap: Funscript 加载成功');


                        } else {
                            console.log('Howl-faptap: Funscript 加载失败:', response?.error || '未知错误');
                        }

                        // 无论 Funscript 加载是否成功，都设置视频事件监听器
                        setupVideoEventListeners('video');
                    });
                } else {
                    console.log('Howl-faptap: 没有找到匹配的 Funscript');
                }
            });
        } else {
            console.log('Howl-faptap: 未找到视频标题元素');
        }
    });
}
initVideoListener();
