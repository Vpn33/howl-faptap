async function initInject() {
    let videoId = window.location.href.match(/v\/([a-zA-Z0-9]+)/)[1];
    if (!videoId) {
      console.error('视频ID不存在');
      return null;
    }

    const t = await this.getVideoData(videoId);
    console.log("视频id = ", videoId, " 数据 = ", t);
    if (!t) {
      return;
    }
    if (t.script.url) {
      const e = await this.getScript(t.script.url), n = {
        metadata: {
          title: t.name,
          description: t.description,
          performers: t.performers ? t.performers.map(s => s.name) : [],
          video_url: t.stream_url,
          tags: t.tags ? t.tags.map(s => s.name) : [],
          duration: 1e3 * t.duration,
          average_speed: t.script.average_speed,
          creator: t.user.username
        },
        actions: e.map(s => ({
          at: s[0],
          pos: s[1]
        }))
      };
      console.log("视频id = ", videoId, " 脚本数据 = ", n);
      
      if (false === t.downloadable) {
        // 等待目标元素加载完成后再添加下载按钮
        this.waitForElement('.gap-y-2 .relative .scroller button:first-child', (likeBtn) => {
          if (likeBtn && likeBtn.parentNode) {
            const r = document.createElement("a");
            r.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"></path></svg><span>Script</span>';
            r.setAttribute("class", "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 block rounded-md px-3 py-1.5 text-center font-semibold md:text-sm overflow-hidden disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-x-2 !px-3");
            r.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(JSON.stringify(n)));
            r.setAttribute("download", `${t.name}.funscript`);
            likeBtn.parentNode.insertBefore(r, likeBtn.nextSibling); // 添加到likeBtn右侧
            console.log("Coyote Faptap Plugin: Script下载按钮已成功添加");
          } else {
            console.error("Coyote Faptap Plugin: 无法找到目标元素，使用后备方案");
            // 后备方案：创建按钮并添加到body
            const fallbackBtn = document.createElement("a");
            fallbackBtn.innerHTML = '<svg viewBox="0 0 24 24" class="h-5 w-5"><path fill="currentColor" d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"></path></svg><span>Script</span>';
            fallbackBtn.className = "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 block rounded-md px-3 py-1.5 text-center font-semibold md:text-sm overflow-hidden disabled:opacity-75 cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-x-2 !px-3 fixed bottom-4 right-4 z-50";
            fallbackBtn.href = "data:text/plain;charset=utf-8," + encodeURIComponent(JSON.stringify(n));
            fallbackBtn.download = `${t.name}.funscript`;
            document.body.appendChild(fallbackBtn);
          }
        });
      }
    }
  }


  async function getVideoData(videoId) {
    return this.request('/videos/' + videoId);
  }
  async function getScript(url) {
    return new Promise((e, n) => {
      let t = this.baseUrl + "/assets/" + url;
      fetch(t, {
        method: 'GET'
      }).then(o => o.text())
        .then(r => {
          if (r.startsWith('{"error"'))
            return n("Failed to fetch script");
          const s = [];
          r.split(`
`).forEach(o => {
            if (o.length === 0)
              return;
            const a = o.split(",")
              , l = parseInt(a[0])
              , c = parseInt(a[1]);
            s.push([l, c])
          }
          );
          const i = (o => {
            let a = []
              , l = -1;
            for (let c = 1; c < o.length; c++) {
              const u = o[c - 1]
                , d = o[c]
                , h = u[0]
                , p = d[0]
                , g = u[1]
                , f = p - h;
              if (f > 3e3) {
                a.push(u);
                const v = [h + f / 2, g];
                a.push(v)
              } else
                a.push(u);
              l = c
            }
            return a.push(o[l]),
              a
          }
          )(s);
          e(i)
        })
        .catch(o => {
          console.error('Error fetching the url: %s body = %s', t, n, o);
          s(new Error("请求发生异常"))
        });
    }
    );
    return t;
  }

  request(t, e = "GET", n) {
    return new Promise((r, s) => {
      !n || n instanceof FormData || (n = JSON.stringify(n));
      let i = "";
      if (t.includes("uploadfile") && e === "POST")
        console.log("File-Upload"),
          i = t.split(":")[1],
          t = "https://upload.faptap.net/api/video/upload";
      else if (t.includes("updatefile") && e === "POST") {
        console.log("File-update");
        let o = t.split(":");
        i = o[1],
          t = `https://upload.faptap.net/api/video/update/${o[2]}`
      } else
        t = this.baseUrl + t;
      fetch(t, {
        method: e,
        body: n || void 0,
        credentials: "include",
        headers: {
          Fileuploadtoken: i
        }
      }).then(o => o.json())
        .then(o => "error" in o ? s(o.error) : (o.ci_environment === void 0 || o.ci_environment == "" || o.ci_environment !== "development", r(o.data)))
        .catch(o => {
          console.error('Error fetching the url: %s body = %s', t, n, o);
          s(new Error("请求发生异常"))
        });
    }
    );
  }