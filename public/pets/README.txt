路线小人 = 大肥鱼桌宠立绘

dafeiyu-front.png   到站站着（呼吸 + 左右张望）
walk/f1..f6.png     走路 6 帧，JS 每 130ms 切一张（用整张图切换，不用雪碧图——
                    雪碧图 background-position 在缩放时会同时露出相邻两帧，看着像残影）
dafeiyu-side.png    退路：没有 walk 帧时用静态侧面 + CSS 步态振荡
dafeiyu-back.png    备用

想换动画：把连续帧按 f1.png f2.png … 放进 walk/ 目录（数量改 components/shiguang/RouteWalker.tsx
里的 WALK_FRAMES），帧率改同一文件里的 130。

立绘来源：https://github.com/mdd111/deepseek-dafeiyu-pet （MIT）
