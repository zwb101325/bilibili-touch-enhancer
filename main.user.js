// ==UserScript==
// @name         bilibili-touch-enhancer
// @namespace    http://tampermonkey.net/
// @version      1.8.9
// @description  单击显示/隐藏控制栏，双击播放/暂停，长按倍速播放，左右滑动调节播放进度，上下滑动调节亮度/音量
// @author       You
// @match        *://*.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @run-at       document-end
// @noframes
// @grant        unsafeWindow
// @license      MIT
// ==/UserScript==


(function() {
    "use strict";

    // ============================================================
    // #region 参数配置
    // ============================================================
    const PRESS_DELAY = 300;
    const TARGET_SPEED = 3.0;
    const CLICK_TIMEOUT = 200;
    const TOAST_DELAY = 500;
    const HORIZONTAL_SENS = 0.8;
    const VERTICAL_SENS = 0.5;
    const MAX_BRIGHTNESS = 1.0;
    const MAX_VOLUME = 1.0;
    const TOAST_ID = "gesture-toast";
    const SHIELD_ID = "gesture-shield";

    let videoArea = null;
    let shield = null;

    let isDown = false;
    let gestureType = "";
    let pressTimer = null;
    let clickTimer = null;
    let toastTimer = null;

    let startVal = 0;
    let originalSpeed = 1.0;
    let wasPlaying = false;

    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let deltaY = 0;
    let absX = 0;
    let absY = 0;
    let prevX = 0;
    let prevY = 0;

    // #endregion



    // ============================================================
    // #region 图标
    // ============================================================

    const style = document.createElement("style");
    style.textContent = `
        @keyframes gestureSpeedPulse {
            0%   { opacity: 0.3; filter: brightness(0.3); }
            25%  { opacity: 0.6; filter: brightness(0.6); }
            50%  { opacity: 1.0; filter: brightness(1.0); }
            75%  { opacity: 0.6; filter: brightness(0.6); }
            100% { opacity: 0.3; filter: brightness(0.3); }
        }
    `;
    document.head.appendChild(style);


    const speedIcon = `
        <svg viewBox="0 0 111 66" width="34" height="20" style="overflow:visible">
            <g transform="matrix(0,3,-3,0,94.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:gestureSpeedPulse 1.2s infinite;animation-delay:0.36s"/>
            </g>
            <g transform="matrix(0,3,-3,0,55.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:gestureSpeedPulse 1.2s infinite;animation-delay:0.18s"/>
            </g>
            <g transform="matrix(0,3,-3,0,16.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:gestureSpeedPulse 1.2s infinite;animation-delay:0s"/>
            </g>
        </svg>`;


    const brightnessIcon = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" fill="currentColor" />
        </svg>`;


    const volumeIcon = `
        <svg viewBox="0 0 24 24" width="24" height="24">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06Z" fill="currentColor" />
            <path d="M15.9 8.2 A4.5 4.5 0 0 1 15.9 15.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M19.1 5.7 A8.25 8.25 0 0 1 19.1 18.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>`;

    // #endregion



    // ============================================================
    // #region 工具类函数
    // ============================================================

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }


    function sendMouseEvent(element, type, x = 0, y = 0) {
        if (!element) return;

        element.dispatchEvent(new unsafeWindow.MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            view: unsafeWindow
        }));
    }


    function formatTime(seconds) {
        const hr = Math.floor(seconds / 3600);
        const min = Math.floor((seconds % 3600) / 60);
        const sec = Math.ceil(seconds % 60);

        if (hr > 0) return `${hr}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
        return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    }

    // #endregion



    // ============================================================
    // #region 提示框
    // ============================================================

    function createToast(videoArea) {
        let toastContainer = videoArea.querySelector("#" + TOAST_ID);
        if (!toastContainer) {
            toastContainer = document.createElement("div");
            toastContainer.id = TOAST_ID;
            toastContainer.style.cssText = `
                display: none;
                align-items: center;
                gap: 8px;

                position: absolute;
                z-index: 100001;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);

                padding: 12px 24px;
                border-radius: 8px;

                color: #fff;
                background: rgba(0,0,0,0.75);
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                backdrop-filter: blur(4px);

                font-family: "Segoe UI", sans-serif;
                font-size: 20px;
                font-weight: 500;
                text-align: center;
                white-space: nowrap;

                pointer-events: none;
            `;
            videoArea.appendChild(toastContainer);
        }
        return toastContainer;
    }


    function showToast(videoArea, text) {
        const toastContainer = createToast(videoArea);
        toastContainer.innerHTML = "";
        toastContainer.style.display = "flex";
        toastContainer.appendChild(document.createTextNode(text));
    }


    function showIconToast(videoArea, svg, text) {
        const toastContainer = createToast(videoArea);
        toastContainer.innerHTML = "";
        toastContainer.style.display = "flex";

        const iconContainer = document.createElement("span");
        iconContainer.innerHTML = svg;
        iconContainer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        `;

        toastContainer.appendChild(iconContainer);
        toastContainer.appendChild(document.createTextNode(text));
    }


    function hideToast(videoArea) {
        clearTimeout(toastTimer);
        const toastContainer = videoArea.querySelector("#" + TOAST_ID);
        if (toastContainer) toastContainer.style.display = "none";
    }

    // #endregion



    // ============================================================
    // #region 单指单击：显示/隐藏控制栏
    // ============================================================

    function showCtrl(videoArea) {
        const videoRect = videoArea.getBoundingClientRect();
        sendMouseEvent(videoArea, "mousemove", videoRect.left + videoRect.width / 2, videoRect.top + videoRect.height * 0.1);
    }


    function hideCtrl(videoArea) {
        const videoRect = videoArea.getBoundingClientRect();
        sendMouseEvent(videoArea, "mouseleave", videoRect.right + 10, videoRect.bottom + 10);
    }


    function handleCtrl(videoArea) {
        const playerContainer = videoArea.closest(".bpx-player-container");
        if (!playerContainer) return;
        const isHidden = playerContainer.getAttribute("data-ctrl-hidden") === "true";
        isHidden ? showCtrl(videoArea) : hideCtrl(videoArea);
    }

    // #endregion



    // ============================================================
    // #region 单指双击：播放/暂停
    // ============================================================

    function onDoubleTap(video) {
        video.paused ? video.play() : video.pause();
    }

    // #endregion



    // ============================================================
    // #region 单指长按：倍速播放
    // ============================================================

    function onLongPressStart(video, videoArea) {
        originalSpeed = video.playbackRate;
        video.playbackRate = TARGET_SPEED;
        showIconToast(videoArea, speedIcon, TARGET_SPEED.toFixed(1) + "x");
    }


    function onLongPressEnd(video, videoArea) {
        video.playbackRate = originalSpeed;
        hideToast(videoArea);
    }

    // #endregion



    // ============================================================
    // #region 横向滑动：调节进度
    // ============================================================

    function getProgressPoint(videoArea, ratio) {
        const progressBar = videoArea.querySelector(".bpx-player-progress");
        if (!progressBar) return;

        const barRect = progressBar.getBoundingClientRect();
        const x = barRect.left + barRect.width * (ratio + 0.005);
        const y = barRect.top + barRect.height / 2;

        return { progressBar, x, y };
    }


    function onSeekStart(video, videoArea, clientX) {
        prevX = clientX;
        startVal = video.currentTime;
        wasPlaying = !video.paused;
        video.pause();

        const point = getProgressPoint(videoArea, startVal / video.duration);
        if (point) sendMouseEvent(point.progressBar, "mouseenter", point.x, point.y);

        showCtrl(videoArea);
    }


    function onSeek(video, videoArea, clientX) {
        startVal = startVal + (clientX - prevX) / (videoArea.clientWidth * HORIZONTAL_SENS) * video.duration;
        startVal = clamp(startVal, 0, video.duration);
        prevX = clientX;
        video.currentTime = startVal;

        const point = getProgressPoint(videoArea, startVal / video.duration);
        if (point) sendMouseEvent(point.progressBar, "mousemove", point.x, point.y);
        const previewTime = videoArea.querySelector(".bpx-player-progress-preview-time");
        if (previewTime) previewTime.textContent = formatTime(startVal);

        showToast(videoArea, `${formatTime(startVal)} / ${formatTime(video.duration)}`);
    }


    function onSeekEnd(video, videoArea) {
        if (wasPlaying) video.play();

        const point = getProgressPoint(videoArea, startVal / video.duration);
        if (point) sendMouseEvent(point.progressBar, "mouseleave", point.x, point.y);

        hideCtrl(videoArea);
        hideToast(videoArea);
    }

    // #endregion



    // ============================================================
    // #region 左纵向滑动：调节亮度
    // ============================================================

    function getCurrentBrightness(video) {
        const filter = video.style.filter;
        if (!filter || !filter.includes("brightness")) return 1;
        const match = filter.match(/brightness\(([\d.]+)\)/);
        return match ? parseFloat(match[1]) : 1;
    }


    function onBrightnessStart(video, clientY) {
        prevY = clientY;
        startVal = getCurrentBrightness(video);
    }


    function onBrightness(video, videoArea, clientY) {
        startVal = startVal + (prevY - clientY) / (videoArea.clientHeight * VERTICAL_SENS);
        startVal = clamp(startVal, 0, MAX_BRIGHTNESS);
        prevY = clientY;
        video.style.filter = `brightness(${startVal})`;
        showIconToast(videoArea, brightnessIcon, `${Math.round(startVal * 100)}%`);
    }


    function onBrightnessEnd(videoArea) {
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => hideToast(videoArea), TOAST_DELAY);
    }

    // #endregion



    // ============================================================
    // #region 右纵向滑动：调节音量
    // ============================================================

    function onVolumeStart(video, clientY) {
        prevY = clientY;
        startVal = video.volume;
    }


    function onVolume(video, videoArea, clientY) {
        startVal = startVal + (prevY - clientY) / (videoArea.clientHeight * VERTICAL_SENS);
        startVal = clamp(startVal, 0, MAX_VOLUME);
        prevY = clientY;
        video.volume = startVal;
        showIconToast(videoArea, volumeIcon, `${Math.round(startVal * 100)}%`);
    }


    function onVolumeEnd(videoArea) {
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => hideToast(videoArea), TOAST_DELAY);
    }

    // #endregion



    // ============================================================
    // #region 手势识别与分发
    // ============================================================

    // 手指按下时 → 长按
    function handleDown(e, videoArea) {
        if (!e.isPrimary || e.button == 2) return;
        const video = videoArea.querySelector("video");
        if (!video) return;

        e.preventDefault();
        e.stopPropagation();

        isDown = true;
        gestureType = "";
        startX = e.clientX;
        startY = e.clientY;

        // 启动长按计时器
        pressTimer = setTimeout(() => {
            if (gestureType == "") {
                gestureType = "speed";
                onLongPressStart(video, videoArea);
            }
        }, PRESS_DELAY);
    }


    // 手指移动时 → 横向滑动/纵向滑动
    function handleMove(e, videoArea) {
        if (!isDown) return;
        const video = videoArea.querySelector("video");
        if (!video) return;

        deltaX = e.clientX - startX;
        deltaY = startY - e.clientY;
        absX = Math.abs(deltaX);
        absY = Math.abs(deltaY);

        // 手势未确定，判断滑动方向
        if (gestureType == "" && (absX > 15 || absY > 15)) {
            clearTimeout(pressTimer)

            if (absX > absY) {
                gestureType = "seek";
                onSeekStart(video, videoArea, e.clientX);
            } else if (startX < videoArea.clientWidth / 2) {
                gestureType = "brightness";
                onBrightnessStart(video, e.clientY);
            } else {
                gestureType = "volume";
                onVolumeStart(video, e.clientY);
            }
        }

        // 手势已确定，持续更新
        if (gestureType != "") {
            if (gestureType == "seek") {
                onSeek(video, videoArea, e.clientX);
            } else if (gestureType == "brightness") {
                onBrightness(video, videoArea, e.clientY);
            } else if (gestureType == "volume") {
                onVolume(video, videoArea, e.clientY);
            }
        }
    }


    // 手指抬起时 → 单击/双击/长按结束/滑动结束
    function handleUp(e, videoArea) {
        clearTimeout(pressTimer);

        const video = videoArea.querySelector("video");
        if (!video) {
            isDown = false;
            gestureType = "";
            return;
        }

        deltaX = e.clientX - startX;
        deltaY = startY - e.clientY;
        absX = Math.abs(deltaX);
        absY = Math.abs(deltaY);

        // 无滑动、无长按 → 单击或双击
        if (gestureType == "" && (absX < 10 && absY < 10)) {
            if (!clickTimer) {
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    handleCtrl(videoArea);
                }, CLICK_TIMEOUT);
            } else {
                clearTimeout(clickTimer);
                clickTimer = null;
                onDoubleTap(video);
            }
        }

        // 手势结束收尾
        if (gestureType != "") {
            if (gestureType == "speed") {
                onLongPressEnd(video, videoArea);
            } else if (gestureType == "seek") {
                onSeekEnd(video, videoArea);
            } else if (gestureType == "brightness") {
                onBrightnessEnd(videoArea);
            } else if (gestureType == "volume") {
                onVolumeEnd(videoArea);
            }
        }

        isDown = false;
        gestureType = "";
    }

    // #endregion



    // ============================================================
    // #region 初始化
    // ============================================================
    function blockNativeEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }


    function createSafeShield() {
        videoArea = document.querySelector(".bpx-player-video-area");
        if (!videoArea) return;
        if (videoArea.querySelector("#" + SHIELD_ID)) return;

        shield = document.createElement("div");
        shield.id = SHIELD_ID;
        shield.style.cssText = `
            position: absolute;
            z-index: 20;
            top: 0;
            left: 0;

            width: 100%;
            height: 85%;

            background: transparent;

            touch-action: none !important;
            user-select: none;
        `;
        videoArea.appendChild(shield);

        shield.addEventListener("pointerdown", (e) => handleDown(e, videoArea), true);
        document.addEventListener("pointermove", (e) => handleMove(e, videoArea), true);
        document.addEventListener("pointerup", (e) => handleUp(e, videoArea), true);
        document.addEventListener("pointercancel", (e) => handleUp(e, videoArea), true);

        shield.addEventListener("contextmenu", blockNativeEvent, true);
        shield.addEventListener("click", blockNativeEvent, true);
        shield.addEventListener("dblclick", blockNativeEvent, true);
        shield.addEventListener("auxclick", blockNativeEvent, true);
    }


    const observer = new MutationObserver(() => createSafeShield());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", createSafeShield);

    // #endregion

})();
