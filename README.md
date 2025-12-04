# Howl-Faptap Chrome 插件

## 功能介绍
这个Chrome插件用于监测Faptap、PornHub、XVideos、XHamster、rule34video等主流视频网站和网盘（如Pixeldrain、mega、gofile等）上的视频操作，并将操作同步到Howl服务。并且修复了由于网站问题或作者限制导致部分脚本和视频不能下载的问题(如果源文件丢失，则另当别论)，当用户播放、暂停或跳转到特定时间点时，插件会自动调用Howl服务接口。

## 安装方法
1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 启用右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择插件所在的文件夹（包含manifest.json的目录）

## 配置说明
1. 点击插件图标打开配置页面
2. 在弹出的页面中输入Howl服务器的IP地址（默认：localhost）和端口（默认：4695）
3. 设置延迟时间（毫秒），用于调整同步操作的时机
4. 点击「保存设置」按钮

## 使用方法
1. 访问Faptap网站上的视频页面（例如：https://faptap.net/v/xxx）
2. 开始播放视频
3. 插件会自动加载funscript数据并同步到Howl服务
4. 所有视频操作（播放、暂停、跳转）都会实时同步到Howl服务
