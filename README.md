# Bilibili Surface

为 Surface/iPad 等触屏设备优化的 Bilibili 播放器手势控制脚本，支持鼠标操作。

## 功能特性

### 手势操作

| 手势 | 动作 | 反馈 |
|------|------|------|
| **单击** | 切换控制栏显示/隐藏 | — |
| **双击** | 播放/暂停 | — |
| **长按** (>300ms) | 进入 3.0x 倍速播放 | 三箭头闪烁动画 |
| **横向滑动** | 调节视频进度 | 显示当前时间 / 总时长 |
| **左半屏纵向滑动** | 调节屏幕亮度 | 显示亮度百分比 (0-100%) |
| **右半屏纵向滑动** | 调节音量 | 显示音量百分比 (0-100%) |

### 灵敏度配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `HORIZONTAL_SENSITIVITY` | 0.7 | 横向滑动灵敏度 |
| `VERTICAL_SENSITIVITY` | 0.5 | 纵向滑动灵敏度 |
| `PRESS_DELAY` | 300ms | 长按触发时间 |
| `TARGET_SPEED` | 3.0x | 长按倍速值 |
| `CLICK_TIMEOUT` | 200ms | 双击判定间隔 |

## 安装

### 方式一：Greasy Fork（推荐）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 访问 [Greasy Fork 脚本页面](https://greasyfork.org/zh-CN/scripts/573952-bilibili-surface)
3. 点击"安装此脚本"

### 方式二：手动安装

1. 复制 `surface pro.js` 文件内容
2. 在 Tampermonkey 中创建新脚本
3. 粘贴代码并保存

## 使用方法

### 基本操作

- **切换控制栏**：单击视频画面
- **播放/暂停**：快速双击
- **加速播放**：长按视频（松开恢复原速）
- **调节进度**：左右滑动
- **调节亮度**：左半屏上下滑动
- **调节音量**：右半屏上下滑动

### 自定义设置

编辑脚本顶部的配置参数：

```javascript
const PRESS_DELAY = 300;           // 长按触发时间（毫秒）
const TARGET_SPEED = 3.0;          // 长按倍速
const CLICK_TIMEOUT = 200;         // 双击间隔（毫秒）
const HORIZONTAL_SENSITIVITY = 0.7; // 横向灵敏度（越小越灵敏）
const VERTICAL_SENSITIVITY = 0.5;   // 纵向灵敏度（越小越灵敏）
