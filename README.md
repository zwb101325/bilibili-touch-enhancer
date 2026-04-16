# Bilibili Touch Enhancer

为 Surface/Yoga/MateBook 等触屏 Windows 设备优化的 Bilibili 网站播放器手势控制脚本，支持触屏和鼠标操作。

## 功能特性

### 手势操作

| 手势 | 动作 | 反馈 |
|------|------|------|
| **单指单击** | 显示/隐藏控制栏 | — |
| **单指双击** | 播放/暂停 | — |
| **单指长按** | 进入倍速播放 | 倍速闪烁动画 |
| **横向滑动** | 调节视频进度 | 显示当前时间 / 总时长 |
| **左半屏纵向滑动** | 调节亮度 | 显示亮度百分比 (0-100%) |
| **右半屏纵向滑动** | 调节音量 | 显示音量百分比 (0-100%) |

### 参数配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `PRESS_DELAY` | 300ms | 长按触发时间 |
| `TARGET_SPEED` | 3.0 | 长按播放速度 |
| `CLICK_TIMEOUT` | 200ms | 双击判定间隔 |
| `HORIZONTAL_SENSITIVITY` | 0.7 | 横向滑动灵敏度 |
| `VERTICAL_SENSITIVITY` | 0.5 | 纵向滑动灵敏度 |

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 访问 [Greasy Fork 脚本页面](https://greasyfork.org/zh-CN/scripts/573952-bilibili-surface)
3. 点击"安装此脚本"

## 使用方法
