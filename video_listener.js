function initVideoListener() {

    const isPornHubPage = (window.location.hostname.includes('pornhub.com') && window.location.pathname.includes('/view_video.php'));
    console.log('Howl-faptap:  是否为pornhub.com/view_video: ' + isPornHubPage);
    const isXVideoPage = (window.location.hostname.includes('xvideos.com') && window.location.pathname.includes('/video.'));
    console.log('Howl-faptap:  是否为xvideos.com/videos.: ' + isXVideoPage);
    const isXhamsterPage = (window.location.hostname.includes('xhamster.com') && window.location.pathname.includes('/videos'));
    console.log('Howl-faptap:  是否为xhamster.com/videos: ' + isXhamsterPage);
    const isPixeldrainPage = (window.location.hostname.includes('pixeldrain.com') && window.location.pathname.includes('/u'));
    console.log('Howl-faptap:  是否为pixeldrain.com/u: ' + isPixeldrainPage);
    const isRule34videoPage = (window.location.hostname.includes('rule34video.com') && window.location.pathname.includes('/video'));
    console.log('Howl-faptap:  是否为rule34video.com/video: ' + isRule34videoPage);
    const isMegaPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/file'));
    console.log('Howl-faptap:  是否为mega.nz/file: ' + isMegaPage);
    const isMegaFolderPage = (window.location.hostname.includes('mega.nz') && window.location.pathname.includes('/folder'));
    console.log('Howl-faptap:  是否为mega.nz/folder: ' + isMegaFolderPage);
    const isGoFilePage = (window.location.hostname.includes('gofile.io') && window.location.pathname.includes('/d'));
    console.log('Howl-faptap:  是否为gofile.io/d: ' + isGoFilePage);
    const isSpankbangPage = (window.location.hostname.includes('spankbang.com') && window.location.pathname.includes('/video'));
    console.log('Howl-faptap:  是否为spankbang.com/video: ' + isSpankbangPage);


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
    } 
    return;
}

function autoLoadFunscript(titleSelector) {
    waitForElement(titleSelector, (titleElement) => {
        if (titleElement) {
            // 提取视频标题（去掉文件后缀）
            const videoTitle = titleElement.textContent.replace(/\.[^/.]+$/, '').trim();
            console.log('Howl-faptap: 视频标题:', videoTitle);

            // 从缓存获取Funscript列表
            chrome.storage.local.get(['cached_funscripts'], (result) => {
                const funscripts = result.cached_funscripts || [];

                // 查找匹配的Funscript
                const matchingFunscript = funscripts.find(funscript => {
                    const funscriptTitle = funscript.metadata?.title?.replace(/\.[^/.]+$/, '') || '';
                    return funscriptTitle === videoTitle;
                });

                if (matchingFunscript) {
                    console.log('Howl-faptap: 找到匹配的Funscript:', matchingFunscript.metadata?.title);
                    // 发送更新选中状态的消息
                    chrome.runtime.sendMessage({
                        action: 'update_funscript_selection',
                        funscriptTitle: matchingFunscript.metadata?.title || '缓存的Funscript'
                    });
                    // 发送load_funscript请求到background
                    chrome.runtime.sendMessage({
                        action: 'load_funscript',
                        title: matchingFunscript.metadata?.title || '缓存的Funscript',
                        funscriptContent: JSON.stringify(matchingFunscript)
                    }, (response) => {
                        if (response && response.success) {
                            console.log('Howl-faptap: Funscript加载成功');


                        } else {
                            console.log('Howl-faptap: Funscript加载失败:', response?.error || '未知错误');
                        }

                        // 无论Funscript加载是否成功，都设置视频事件监听器
                        setupVideoEventListeners('video');
                    });
                } else {
                    console.log('Howl-faptap: 没有找到匹配的Funscript');
                }
            });
        } else {
            console.log('Howl-faptap: 未找到视频标题元素');
        }
    });
}
initVideoListener();