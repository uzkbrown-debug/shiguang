# 云端部署说明（阿里云 2 核 2G）

线上地址：<http://139.196.36.166>（nginx 80 → Next 3000 → FastAPI 8000 → MySQL 3306，全部本机）

## 机器上都有什么

| 东西 | 位置 / 版本 |
| --- | --- |
| 代码 | `/srv/shiguang`（整个项目，含 `backend/media` 照片） |
| 后端 venv | `/srv/shiguang/backend/.venv`（Python 3.10） |
| 前端依赖 + 构建产物 | `/srv/shiguang/node_modules`、`/srv/shiguang/.next` |
| Node | 22.x（`/usr/local/node`，`/usr/bin/node` 指过去） |
| MySQL | 8.0，库 `shiguang`，账号 `shiguang / Shiguang2026!` |
| 前端服务 | `shiguang-web.service` → `next start --port 3000` |
| 后端服务 | `shiguang-api.service` → `uvicorn main:app --port 8000` |
| 反向代理 | `nginx` → `/etc/nginx/sites-available/shiguang` |
| 日志 | `/var/log/shiguang-web.log`、`/var/log/shiguang-api.log` |
| swap | 4G（`/swapfile`），2G 内存跑 Next + MySQL 必须留着 |

## 常用命令

```bash
systemctl status shiguang-web shiguang-api nginx mysql     # 看状态
systemctl restart shiguang-web                            # 重启前端
systemctl restart shiguang-api                            # 重启后端
journalctl -u shiguang-web -n 50 --no-pager               # 看日志
tail -f /var/log/shiguang-api.log
free -m && ps aux --sort=-%mem | head -6                  # 看内存
```

## 更新代码的正确姿势（这台机器**不要跑 next build**）

1.6G 可用内存跑 Next 16 的构建会把机器压到 swap 抖动、连 SSH 都握不上手（本项目踩过一次）。
所以走「本地构建 + 上传产物」：

```bash
# 本机
node node_modules/next/dist/bin/next build
tar -czf next-prod.tar.gz --exclude='.next/dev' --exclude='.next/cache' .next
scp next-prod.tar.gz root@139.196.36.166:/tmp/

# 服务器
tar -xzf /tmp/next-prod.tar.gz -C /srv/shiguang
systemctl restart shiguang-web
```

只改了后端 Python：`systemctl restart shiguang-api` 即可，没有构建步骤。

## 数据库

```bash
# 备份
mysqldump -uroot --single-transaction shiguang | gzip > /root/shiguang-$(date +%F).sql.gz
# 恢复
gunzip -c xxx.sql.gz | mysql -uroot --default-character-set=utf8mb4 shiguang
```

小内存专用参数在 `/etc/mysql/mysql.conf.d/99-shiguang.cnf`：`performance_schema=OFF`、
`innodb_buffer_pool_size=96M`，mysqld 常驻从 ~385MB 降到 ~160MB。

## 这台机器上被停掉的另一个项目

原来跑着 `classroom-wish-app-1` + `classroom-wish-caddy-1`（docker compose），
为了给本项目腾内存，容器已 `stop` 且 `docker` / `containerd` 服务已 `disable`。
**容器和镜像都没删**，要恢复：

```bash
systemctl enable --now docker
docker start classroom-wish-caddy-1 classroom-wish-app-1
```

注意它原本占着 80 端口，恢复前要先腾出端口或改用别的端口，否则会和本项目的 nginx 抢。

## 已知限制

- 只有 80，没上 HTTPS；要上就配域名 + `certbot --nginx`。
- 上传大视频会短时吃内存（nginx `client_max_body_size 500m`）。
- MySQL 只监听本机，安全组只需开 22 和 80。

## HTTPS / 语音弹幕

浏览器只在**安全上下文**里给麦克风（
avigator.mediaDevices），所以 http://IP 下语音按钮点不开。
现在 80 和 443 都在服务：

- <https://139.196.36.166>（自签证书，第一次访问点「高级 → 继续前往」，之后 Chrome 会记住）
- 也可以用 <https://139.196.36.166.nip.io>（nip.io 把 IP 变成一个主机名，同一张证书）

为什么是自签：这台机器是国内 IP，用未备案域名跑 HTTP-01 校验会被网络层重置（Let'''s Encrypt 报
Connection reset by peer），所以 ACME 签不下来。**有已备案域名后**换成正式证书只要三步：

`ash
certbot certonly --webroot -w /var/www/acme -d 你的域名
# 然后改 /etc/nginx/sites-available/shiguang 里的两行 ssl_certificate*，nginx -t && systemctl reload nginx
`

前端对这种情况有提示：在 http 下点「语音」不会静默失败，会直接在输入框上方显示
「语音要 HTTPS 才能录音……换成 https://xxx 再试」（lib/mic.ts）。

## 视频 / 图片 / 预加载（2 核 2G 的优化）

- 静态资源不再过 Next 和 FastAPI：nginx 直接 lias 到 ackend/media、public/*、.next/static，
  带 sendfile + Accept-Ranges + 30 天缓存。视频因此能拖进度、首帧 7ms 就到
  （之前三层转发，一个 200MB 的视频能把整页拖死）。
- 视频封面：上传时用 **ffmpeg** 抽首帧存 media/posters/*.jpg，列表缩略图直接用这张图
  （<video preload=metadata> 在 moov 位于文件尾的 mp4 上画不出帧，只会剩黑框）。
  **服务器必须装 ffmpeg**：pt-get install -y ffmpeg，装完跑一次
  ackend/.venv/bin/python backend/migrate_video_poster.py 给老视频补封面。
- 前端 components/system/Preload.tsx：空闲时预取 /api/auth/me、/api/timeline/years、
  /api/memories?limit=12 等轻接口，并把首屏外的封面图用 link rel=prefetch 排进队列；
  省流模式（saveData）直接跳过。图片统一走 MediaThumb，默认 loading=lazy。
