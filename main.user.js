// ==UserScript==
// @name         bilibili-touch-enhancer
// @namespace    http://tampermonkey.net/
// @version      1.9.6
// @description  给 B 站网页端视频播放器添加触屏手势，并提供可视化设置面板
// @author       You
// @match        *://*.bilibili.com/video/*
// @icon         https://www.bilibili.com/favicon.ico
// @run-at       document-end
// @noframes
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @license      MIT
// ==/UserScript==

(function() {
    "use strict";

    // ============================================================
    // #region 参数配置
    // ============================================================

    const SETTINGS_KEY = "bte-settings-v1";
    const TOAST_ID = "bte-toast";
    const SHIELD_ID = "bte-shield";
    const SETTINGS_PANEL_ID = "bte-settings-panel";

    const BUTTON_CLASS = "bte-side-button";
    const LEFT_BUTTON_ID = "bte-left-button";
    const LEFT_BACKWARD_BUTTON_ID = "bte-left-backward-button";
    const LEFT_FORWARD_BUTTON_ID = "bte-left-forward-button";
    const RIGHT_BUTTON_ID = "bte-right-button";
    const RIGHT_BACKWARD_BUTTON_ID = "bte-right-backward-button";
    const RIGHT_FORWARD_BUTTON_ID = "bte-right-forward-button";
    const LEFT_BUTTON_IDS = [LEFT_BUTTON_ID, LEFT_BACKWARD_BUTTON_ID, LEFT_FORWARD_BUTTON_ID];
    const RIGHT_BUTTON_IDS = [RIGHT_BUTTON_ID, RIGHT_BACKWARD_BUTTON_ID, RIGHT_FORWARD_BUTTON_ID];

    const ENDING_INTERACTIVE_SELECTOR = [
        "a",
        "button",
        "input",
        "textarea",
        "select",
        "[role='button']",
        "[data-action]",
        ".bpx-player-ending-related",
        ".bpx-player-relation-context-item"
    ].join(",");

    const FULLSCREEN_BUTTON_SIZE = 52;
    const BUTTON_SIZE = 40;
    const TOAST_DELAY = 500;
    const BUTTON_EXPAND_DURATION = 180;
    
    const VERTICAL_ACTIONS = {
        none: "无操作",
        brightness: "调节亮度",
        volume: "调节音量"
    };

    const BUTTON_ACTIONS = {
        none: "无操作",
        lock: "锁定按钮",
        menu: "菜单按钮"
    };

    const DEFAULT_SETTINGS = {
        // 双击
        doubleTapPause: true,
        clickTimeout: 200,

        // 长按
        longPressSpeed: true,
        targetSpeed: 3.0,
        pressDelay: 300,

        // 横向滑动
        horizontalSwipeSeek: true,
        horizontalSens: 100,

        // 纵向滑动
        verticalSwipeLeft: "brightness",
        verticalSwipeRight: "volume",
        verticalSens: 50,
        maxBrightness: 100,
        maxVolume: 100,

        // 按钮区域
        leftButtonAction: "lock",
        rightButtonAction: "menu",
        btnSeekStep: 10,
    };

    let userSettings = loadSettings();

    let videoArea = null;
    let shield = null;
    let ctrlObserver = null;
    let currentPlayerContainer = null;

    let isLocked = false;
    const expandedButtonIds = new Set();
    
    let isDown = false;
    let gestureType = "";
    let pressTimer = null;
    let clickTimer = null;
    let toastTimer = null;
    let shieldTimer = null;
    
    let startVal = 0;
    let originalSpeed = 1.0;
    let wasPlaying = false;

    let ctx;
    let sourceNode;
    let gainNode;

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
    // #region CSS样式
    // ============================================================

    const style = document.createElement("style");
    style.textContent = /*css*/`
        @keyframes bteSpeedPulse {
            0%   { opacity: 0.3; filter: brightness(0.3); }
            25%  { opacity: 0.6; filter: brightness(0.6); }
            50%  { opacity: 1.0; filter: brightness(1.0); }
            75%  { opacity: 0.6; filter: brightness(0.6); }
            100% { opacity: 0.3; filter: brightness(0.3); }
        }


        /* #region 设置面板容器 */
        #bte-settings-panel {
            --bte-primary-blue: #6366f1;
            --bte-primary-blue-soft: rgba(99, 102, 241, 0.14);
            --bte-black: #111827;
            --bte-gray: #f1f2f3;
        }

        #bte-settings-panel,
        #bte-settings-panel * {
            box-sizing: border-box;
        }

        .bte-card-wrap {
            width: min(540px, calc(100vw - 48px));
            max-height: min(720px, calc(100vh - 48px));
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.55);
            border-radius: 30px;
            color: var(--bte-black);
            background: var(--bte-gray);
            box-shadow: 0 22px 70px rgba(15, 23, 42, 0.22);
        }

        .bte-card {
            max-height: min(720px, calc(100vh - 48px));
            overflow: auto;
            padding: 24px;
        }

        .bte-card::-webkit-scrollbar {
            width: 10px;
        }

        .bte-card::-webkit-scrollbar-thumb {
            border-radius: 999px;
            background: rgba(148, 163, 184, 0.45);
        }

        /* #endregion */


        /* #region 设置面板页头 */
        .bte-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
            padding-bottom: 18px;
        }

        .bte-title {
            min-width: 0;
            font-size: 25px;
            font-weight: 800;
            line-height: 1.2;
            letter-spacing: -0.03em;
        }

        .bte-title,
        .bte-summary-title,
        .bte-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        /* #endregion */

        
        /* #region 设置面板按钮 */
        .bte-button {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid transparent;
            border-radius: 999px;
            padding: 10px 18px;
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            font-weight: 700;
            transition: 
                border-color 0.18s ease,
                box-shadow 0.18s ease,
                transform 0.18s ease;
        }

        .bte-section:hover,
        .bte-button:hover {
            z-index: 1;
            border-color: #4aa3ff;
            box-shadow: 0 12px 26px rgba(59, 130, 246, 0.16), 0 8px 18px rgba(15, 23, 42, 0.08);
            transform: translateY(-2px);
        }

        #bte-close-button {
            width: 46px;
            height: 46px;
            flex: 0 0 auto;
            padding: 0;
            color: var(--bte-black);
            background: #ffffff;
        }

        #bte-close-button svg {
            width: 23px;
            height: 23px;
            pointer-events: none;
        }

        #bte-reset-button {
            color: var(--bte-black);
            background: #ffffff;
        }

        #bte-finish-button {
            color: #ffffff;
            background: var(--bte-primary-blue);
        }
        /* #endregion */


        /* #region 设置面板分组 */
        .bte-section {
            position: relative;
            margin-bottom: 14px;
            border: 1px solid transparent;
            border-radius: 22px;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
            overflow: hidden;
            transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .bte-section > summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 62px;
            padding: 0 22px;
            cursor: pointer;
            list-style: none;
            font-size: 18px;
            font-weight: 800;
            user-select: none;
        }

        .bte-section > summary::-webkit-details-marker {
            display: none;
        }

        .bte-summary-arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 0 0 auto;
            width: 20px;
            height: 20px;
            transition: transform 0.16s ease;
            pointer-events: none;
        }

        .bte-summary-arrow svg {
            width: 18px;
            height: 18px;
            display: block;
        }

        .bte-section[open] > summary .bte-summary-arrow {
            transform: rotate(90deg);
        }

        .bte-summary {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .bte-summary-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 999px;
            flex: 0 0 auto;
        }

        .bte-summary-icon svg {
            width: 21px;
            height: 21px;
            display: block;
        }

        .bte-summary-icon-purple {
            color: #8b5cf6;
            background: rgba(139, 92, 246, 0.14);
        }

        .bte-summary-icon-blue {
            color: var(--bte-primary-blue);
            background: var(--bte-primary-blue-soft);
        }

        .bte-summary-icon-green {
            color: #22c55e;
            background: rgba(34, 197, 94, 0.14);
        }

        .bte-summary-icon-orange {
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.14);
        }

        .bte-summary-icon-red {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.14);
        }

        .bte-summary-title {
            min-width: 0;
        }

        .bte-section[open] {
            padding-bottom: 14px;
        }
        /* #endregion */


        /* #region 设置面板行和标签 */
        .bte-row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 12px;
            min-height: 56px;
            margin: 0 22px 10px;
            padding: 0 18px;
            border: 1px solid rgba(17, 24, 39, 0.06);
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.9);
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
        }

        .bte-section .bte-row:last-child {
            margin-bottom: 0;
        }

        .bte-label {
            min-width: 0;
            font-size: 15px;
            font-weight: 700;
        }

        /* #endregion */


        /* #region 开关控件 */
        .bte-switch-row {
            position: relative;
            width: 38px;
            height: 22px;
        }

        .bte-switch-row input {
            display: none;
        }

        .bte-slider {
            position: absolute;
            inset: 0;
            cursor: pointer;
            border-radius: 999px;
            background: #d1d5db;
            transition: background 0.18s ease;
        }

        .bte-slider::before {
            content: "";
            position: absolute;
            width: 18px;
            height: 18px;
            left: 2px;
            top: 2px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 4px rgba(15, 23, 42, 0.25);
            transition: transform 0.18s ease;
        }

        .bte-switch-row input:checked + .bte-slider {
            background: var(--bte-primary-blue);
        }

        .bte-switch-row input:checked + .bte-slider::before {
            transform: translateX(16px);
        }
        /* #endregion */


        /* #region 选择控件 */
        .bte-select-control {
            width: 144px;
            height: 34px;
            border: 1px solid #e5e7eb;
            border-radius: 14px;
            outline: none;
            color: #111827;
            background: #fff;
            font-family: inherit;
            font-size: 13px;
            padding: 0 34px 0 12px;
        }

        /*#endregion */


        /*#region 数字控件 */
        .bte-number-setting-row {
            grid-template-columns: minmax(112px, 1fr) minmax(210px, 1fr);
        }

        .bte-number-row {
            width: 100%;
            min-width: 0;
            height: 40px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 62px;
            align-items: center;
            column-gap: 10px;
        }

        .bte-number-control {
            width: 100%;
            height: 28px;
            margin: 0;
            accent-color: var(--bte-primary-blue);
            cursor: pointer;
        }

        .bte-number-txt {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 62px;
            height: 30px;
            border-radius: 999px;
            color: var(--bte-black);
            background: var(--bte-gray);
            font-size: 14px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            user-select: none;
        }
        /* #endregion */
        

        /* #region 设置面板页尾 */
        .bte-footer {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            padding-top: 4px;
        }
        /* #endregion */


        /* #region 播放器按钮 */
        .${BUTTON_CLASS} svg {
            width: 55%;
            height: 55%;
            display: block;
            pointer-events: none;
        }
        /* #endregion */
    `;
    document.head.appendChild(style);

    // #endregion



    // ============================================================
    // #region 图标
    // ============================================================

    const speedIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="20" viewBox="0 0 111 66" style="overflow:visible">
            <g transform="matrix(0,3,-3,0,94.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:bteSpeedPulse 1.2s infinite;animation-delay:0.36s"/>
            </g>
            <g transform="matrix(0,3,-3,0,55.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:bteSpeedPulse 1.2s infinite;animation-delay:0.18s"/>
            </g>
            <g transform="matrix(0,3,-3,0,16.5,32.5)">
                <path d="M6.138,3.546 C6.468,4.106 6.278,4.826 5.718,5.156 C5.538,5.266 5.338,5.326 5.118,5.326 C5.118,5.326 -5.122,5.326 -5.122,5.326 C-5.772,5.326 -6.302,4.796 -6.302,4.146 C-6.302,3.936 -6.242,3.726 -6.142,3.546 C-6.142,3.546 -1.352,-4.554 -1.352,-4.554 C-0.912,-5.294 0.048,-5.544 0.798,-5.104 C1.028,-4.974 1.218,-4.784 1.348,-4.554 C1.348,-4.554 6.138,3.546 6.138,3.546z" fill="rgb(255,255,255)" style="animation:bteSpeedPulse 1.2s infinite;animation-delay:0s"/>
            </g>
        </svg>`;

    const brightnessIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" fill="currentColor" />
        </svg>`;

    const volumeIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06Z" fill="currentColor" />
            <path d="M15.9 8.2 A4.5 4.5 0 0 1 15.9 15.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path d="M19.1 5.7 A8.25 8.25 0 0 1 19.1 18.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>`;

    const lockIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" fill="currentColor" />
        </svg>`;

    const unlockIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" fill="currentColor" />
        </svg>`;

    const menuIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill="currentColor" />
        </svg>`;

    const closeIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
        </svg>`;

    const forwardIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" fill="currentColor" />
        </svg>`;

    const backwardIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" fill="currentColor" />
        </svg>`;

    const arrowIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M8.5 5L15.5 12L8.5 19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    const doubleTapIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M7 6.5L12 11L17 6.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 14.5L12 19L17 14.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        `;

    const longPressIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M12 4V16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M8 12L12 16L16 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 19V21H18V19" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    const horizontalSwipeIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <path d="M3 11H21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            <path d="M7 7L3 11L7 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M17 7L21 11L17 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;

    const verticalSwipeIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <g transform="rotate(90 12 12)">
                <path d="M3 11H21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
                <path d="M7 7L3 11L7 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M17 7L21 11L17 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
        </svg>`;


    const buttonAreaIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
            <rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/>
            <circle cx="8.5" cy="12" r="1.8" fill="currentColor"/>
            <circle cx="15.5" cy="12" r="1.8" fill="currentColor"/>
        </svg>`;
        
    // #endregion



    // ============================================================
    // #region 工具类函数
    // ============================================================

    function clamp(value, min, max) {
        value = Number(value);
        min = Number(min);
        max = Number(max);
        return Math.min(max, Math.max(min, value));
    }


    function formatNumberText(value, step, unit = "") {
        const number = Number(value);
        const decimals = String(step).match(/\.(\d+)/)?.[1].length ?? 0;

        let text;

        if (!Number.isFinite(number)) {
            text = "0";
        } else if (decimals <= 0) {
            text = String(Math.round(number));
        } else {
            text = number.toFixed(decimals).replace(/\.?0+$/, "");
        }

        return `${text}${unit}`;
    }


    function formatTime(seconds) {
        seconds = Math.ceil(Number.isFinite(seconds) ? seconds : 0);
        const hr = Math.floor(seconds / 3600);
        const min = Math.floor((seconds % 3600) / 60);
        const sec = seconds % 60;

        if (hr > 0) return `${hr}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
        return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    }

    
    function isPlayerFullscreen(videoArea) {
        const playerContainer = videoArea?.closest(".bpx-player-container");
        const screenType = playerContainer?.getAttribute("data-screen");
        return screenType === "web" || screenType === "full";
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


    function getGestureZone(videoArea, clientX) {
        const rect = videoArea.getBoundingClientRect();
        const localX = clientX - rect.left;
        return localX < rect.width / 2 ? "left" : "right";
    }


    function blockNativeEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    
    function resetTimeout(timer, callback, delay) {
        clearTimeout(timer);
        return setTimeout(callback, delay);
    }

    // #endregion



    // ============================================================
    // #region 设置数据
    // ============================================================

    function deepMerge(defaultValue, userValue) {
        if (!userValue || typeof userValue !== "object") return JSON.parse(JSON.stringify(defaultValue));

        const result = {};
        for (const key of Object.keys(defaultValue)) {
            if (defaultValue[key] && typeof defaultValue[key] === "object" && !Array.isArray(defaultValue[key])) {
                result[key] = deepMerge(defaultValue[key], userValue[key]);
            } else {
                result[key] = userValue[key] ?? defaultValue[key];
            }
        }
        return result;
    }


    function loadSettings() {
        return deepMerge(DEFAULT_SETTINGS, GM_getValue(SETTINGS_KEY, DEFAULT_SETTINGS));
    }


    function saveSettings() {
        GM_setValue(SETTINGS_KEY, userSettings);
    }

    // #endregion



    // ============================================================
    // #region 设置面板
    // ============================================================

    function buildSummaryRow(title, icon, colorClass) {
        return `
            <div class="bte-summary">
                <span class="bte-summary-icon ${colorClass}">${icon}</span>
                <span class="bte-summary-title">${title}</span>
            </div>
            <span class="bte-summary-arrow">${arrowIcon}</span>
        `;
    }


    function buildSwitchRow(label, key) {
        const checked = userSettings[key] ? "checked" : "";
        return `
            <div class="bte-row">
                <span class="bte-label">${label}</span>
                <label class="bte-switch-row" data-setting-key="${key}">
                    <input class="bte-switch-control" type="checkbox" ${checked} >
                    <span class="bte-slider"></span>
                </label>
            </div>
        `;
    }


    function buildSelectRow(label, key, options) {
        const value = userSettings[key] ?? DEFAULT_SETTINGS[key];
        const optionHtml = Object.entries(options).map(([optionValue, label]) => {
            const selected = optionValue === value ? "selected" : "";
            return `<option value="${optionValue}" ${selected}>${label}</option>`;
        }).join("");

        return `
            <div class="bte-row">
                <span class="bte-label">${label}</span>
                <div class="bte-select-row" data-setting-key="${key}">
                    <select class="bte-select-control">${optionHtml}</select>
                </div>
            </div>
        `;
    }


    function buildNumberRow(label, key, min, max, step, unit = "") {
        const value = userSettings[key] ?? DEFAULT_SETTINGS[key];
        return `
            <div class="bte-row bte-number-setting-row">
                <span class="bte-label">${label}</span>
                <div class="bte-number-row" data-setting-key="${key}" data-unit="${unit}">
                    <input class="bte-number-control" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
                    <span class="bte-number-txt">${formatNumberText(value, step, unit)}</span>
                </div>
            </div>
        `;
    }


    function updateSettingsPanel(panel) {
        panel.querySelectorAll(".bte-switch-row").forEach((switchRow) => {
            const key = switchRow.dataset.settingKey;
            switchRow.querySelector(".bte-switch-control").checked = userSettings[key];
        });

        panel.querySelectorAll(".bte-select-row").forEach((selectRow) => {
            const key = selectRow.dataset.settingKey;
            selectRow.querySelector(".bte-select-control").value = userSettings[key];
        });

        panel.querySelectorAll(".bte-number-row").forEach((numberRow) => {
            const key = numberRow.dataset.settingKey;
            const step = numberRow.querySelector(".bte-number-control").step;
            const unit = numberRow.dataset.unit;
            numberRow.querySelector(".bte-number-control").value = userSettings[key];
            numberRow.querySelector(".bte-number-txt").textContent = formatNumberText(userSettings[key], step, unit);
        });
    }

    
    function createSettingsPanel() {
        let panel = document.querySelector("#" + SETTINGS_PANEL_ID);
        if (!panel) {
            panel = document.createElement("div");
            panel.id = SETTINGS_PANEL_ID;
            panel.innerHTML = `
                <div class="bte-card-wrap">
                    <div class="bte-card">
                        <div class="bte-header">
                            <div class="bte-title">Bilibili Touch Enhancer 设置</div>
                            <button id="bte-close-button" class="bte-button" type="button" data-action="close">${closeIcon}</button>
                        </div>

                        <details class="bte-section">
                            <summary>${buildSummaryRow("双击", doubleTapIcon, "bte-summary-icon-purple")}</summary>
                            ${buildSwitchRow("双击暂停", "doubleTapPause")}
                            ${buildNumberRow("双击判定间隔", "clickTimeout", 100, 1000, 100, "ms")}
                        </details>

                        <details class="bte-section">
                            <summary>${buildSummaryRow("长按", longPressIcon, "bte-summary-icon-blue")}</summary>
                            ${buildSwitchRow("长按倍速", "longPressSpeed")}
                            ${buildNumberRow("长按播放速度", "targetSpeed", 0.25, 10, 0.25, "x")}
                            ${buildNumberRow("长按触发延迟", "pressDelay", 100, 1000, 100, "ms")}
                        </details>

                        <details class="bte-section">
                            <summary>${buildSummaryRow("横向滑动", horizontalSwipeIcon, "bte-summary-icon-green")}</summary>
                            ${buildSwitchRow("横向滑动快进", "horizontalSwipeSeek")}
                            ${buildNumberRow("横向滑动灵敏度", "horizontalSens", 10, 300, 10, "%")}
                        </details>

                        <details class="bte-section">
                            <summary>${buildSummaryRow("纵向滑动", verticalSwipeIcon, "bte-summary-icon-orange")}</summary>
                            ${buildSelectRow("左侧", "verticalSwipeLeft", VERTICAL_ACTIONS)}
                            ${buildSelectRow("右侧", "verticalSwipeRight", VERTICAL_ACTIONS)}
                            ${buildNumberRow("纵向滑动灵敏度", "verticalSens", 10, 300, 10, "%")}
                            ${buildNumberRow("最大亮度", "maxBrightness", 10, 300, 10, "%")}
                            ${buildNumberRow("最大音量", "maxVolume", 10, 300, 10, "%")}
                        </details>

                        <details class="bte-section">
                            <summary>${buildSummaryRow("按钮区域", buttonAreaIcon, "bte-summary-icon-red")}</summary>
                            ${buildSelectRow("左侧", "leftButtonAction", BUTTON_ACTIONS)}
                            ${buildSelectRow("右侧", "rightButtonAction", BUTTON_ACTIONS)}
                            ${buildNumberRow("按钮跳转时长", "btnSeekStep", 1, 30, 1, "s")}
                        </details>

                        <div class="bte-footer">
                            <button id="bte-reset-button" class="bte-button" type="button" data-action="reset">恢复默认</button>
                            <button id="bte-finish-button" class="bte-button" type="button" data-action="close">完成</button>
                        </div>
                    </div>
                </div>
            `;
            panel.style.cssText = `
                position: fixed;
                z-index: 2147483647;
                inset: 0;

                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;

                background: rgba(15, 23, 42, 0.28);
                backdrop-filter: blur(6px);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
            `;

            // 关闭面板，重置面板
            panel.addEventListener("click", (e) => {
                if (e.target.dataset.action === "close" || e.target === panel) {
                    panel.style.display = "none";
                    return;
                }

                if (e.target.dataset.action === "reset") {
                    userSettings = deepMerge(DEFAULT_SETTINGS, {});
                    saveSettings();
                    updateSettingsPanel(panel);
                    setupButtons(videoArea);
                    return;
                }

            });

            // 开关行，选择行
            panel.addEventListener("change", (e) => {
                const switchRow = e.target.closest(".bte-switch-row");
                if (switchRow) {
                    const key = switchRow.dataset.settingKey;
                    userSettings[key] = e.target.checked;
                    saveSettings();
                    setupButtons(videoArea);
                    return;
                }

                const selectRow = e.target.closest(".bte-select-row");
                if (selectRow) {
                    const key = selectRow.dataset.settingKey;
                    userSettings[key] = e.target.value;
                    saveSettings();
                    setupButtons(videoArea);
                    return;
                }
            });

            // 数值行
            panel.addEventListener("input", (e) => {
                const numberRow = e.target.closest(".bte-number-row");
                if (numberRow) {
                    const key = numberRow.dataset.settingKey;
                    const value = clamp(e.target.value, e.target.min, e.target.max);
                    userSettings[key] = value;
                    numberRow.querySelector(".bte-number-txt").textContent = formatNumberText(value, e.target.step, numberRow.dataset.unit);
                    saveSettings();
                    setupButtons(videoArea);
                    return;
                }
            });

            document.body.appendChild(panel);
        }
        panel.style.display = "flex";
        return panel;
    }

    GM_registerMenuCommand("设置", createSettingsPanel);

    // #endregion



    // ============================================================
    // #region 提示框
    // ============================================================

    function createToast(videoArea) {
        let toast = videoArea.querySelector("#" + TOAST_ID);
        if (!toast) {
            toast = document.createElement("div");
            toast.id = TOAST_ID;
            toast.style.cssText = `
                position: absolute;
                z-index: 100001;
                top: 15%;
                left: 50%;
                transform: translateX(-50%);

                display: none;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px 24px;
                border-radius: 8px;

                color: #ffffff;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);

                font-family: "Segoe UI", sans-serif;
                font-size: 20px;
                font-weight: 600;
                line-height: 1;
                text-align: center;
                white-space: nowrap;
                
                pointer-events: none;
            `;
            videoArea.appendChild(toast);
        }
        return toast;
    }


    function showToast(videoArea, svg, text) {
        const toast = createToast(videoArea);
        toast.innerHTML = "";
        toast.style.display = "flex";
        
        if (svg) {
            const iconContainer = document.createElement("span");
            iconContainer.innerHTML = svg;
            iconContainer.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            `;
            toast.appendChild(iconContainer);
        }

        toast.appendChild(document.createTextNode(text));
    }


    function hideToast(videoArea) {
        clearTimeout(toastTimer);
        const toast = videoArea.querySelector("#" + TOAST_ID);
        if (toast) toast.style.display = "none";
    }

    // #endregion



    // ============================================================
    // #region 按钮
    // ============================================================

    function createButton(videoArea, id, action) {
        let button = videoArea.querySelector("#" + id);
        if (!button) {
            button = document.createElement("button");
            button.id = id;
            button.className = BUTTON_CLASS;
            button.type = "button";
            button.style.cssText = `
                position: absolute;
                z-index: 100002;
                top: 50%;
                transform: translateY(-50%);
                
                display: none;
                align-items: center;
                justify-content: center;
                border: 1px solid rgba(255, 255, 255, 0.4);
                border-radius: 999px;

                color: #ffffff;
                background: rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(6px);
                opacity: 0;
                
                line-height: 1;
                
                cursor: pointer;
                pointer-events: none;
                user-select: none;
                touch-action: manipulation;
                transition: opacity ${Number(BUTTON_EXPAND_DURATION)/1000}s ease, 
                            transform ${Number(BUTTON_EXPAND_DURATION)/1000}s ease; 
            `;
            
            button.addEventListener("pointerdown", blockNativeEvent, true);
            button.addEventListener("pointerup", blockNativeEvent, true);
            button.addEventListener("click", (e) => {
                blockNativeEvent(e);
                showCtrl(videoArea);
                if (button.dataset.action == "lock") {
                    onLockButtonClick(videoArea);
                } else if (button.dataset.action == "menu") {
                    onMenuButtonClick(videoArea, button);
                } else if (button.dataset.action == "backward") {
                    onQuickSeek(videoArea, -userSettings.btnSeekStep);
                } else if (button.dataset.action == "forward") {
                    onQuickSeek(videoArea, userSettings.btnSeekStep);
                }
            }, true);

            videoArea.appendChild(button);
        }

        button.dataset.action = action;
        return button;
    }


    function setButtonVisible(button, visible, offsetY = 0) {
        clearTimeout(button.hideTimer);

        if (visible) {
            button.style.display = "flex";
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    button.style.opacity = "1";
                    button.style.pointerEvents = "auto";
                    button.style.transform = `translateY(calc(-50% + ${offsetY}px))`;
                });
            });
        } else {
            button.style.opacity = "0";
            button.style.pointerEvents = "none";
            button.style.transform = "translateY(-50%)";
            button.hideTimer = setTimeout(() => { if (button.style.opacity === "0") button.style.display = "none"; }, BUTTON_EXPAND_DURATION);
        }
    }

    
    function updateButtons(videoArea) {
        const buttonSize = isPlayerFullscreen(videoArea) ? FULLSCREEN_BUTTON_SIZE : BUTTON_SIZE;
        const buttonSide = videoArea.clientWidth * 0.04;
        const showMainButton = isLocked || !isCtrlHidden(videoArea);

        videoArea.querySelectorAll("." + BUTTON_CLASS).forEach((button) => {
            button.style.width = `${buttonSize}px`;
            button.style.height = `${buttonSize}px`;
            button.style.left = LEFT_BUTTON_IDS.includes(button.id) ? `${buttonSide}px` : "";
            button.style.right = RIGHT_BUTTON_IDS.includes(button.id) ? `${buttonSide}px` : "";

            const isExpanded = expandedButtonIds.has(button.id);
            if (button.dataset.action == "lock") {
                button.innerHTML = isLocked ? lockIcon : unlockIcon;
                setButtonVisible(button, showMainButton);
            } else if (button.dataset.action == "menu") {
                button.innerHTML = isExpanded ? closeIcon : menuIcon;
                setButtonVisible(button, showMainButton);
            } else if (button.dataset.action == "backward") {
                button.innerHTML = backwardIcon;
                setButtonVisible(button, showMainButton && isExpanded, -buttonSize * 1.25);
            } else if (button.dataset.action == "forward") {
                button.innerHTML = forwardIcon;
                setButtonVisible(button, showMainButton && isExpanded, buttonSize * 1.25);
            } else {
                button.innerHTML = "";
                setButtonVisible(button, false);
            }
        });
    }


    function setupButtons(videoArea) {
        if (!videoArea) return;

        const leftAction = userSettings.leftButtonAction ?? DEFAULT_SETTINGS.leftButtonAction;
        const rightAction = userSettings.rightButtonAction ?? DEFAULT_SETTINGS.rightButtonAction;

        if (isLocked && leftAction !== "lock" && rightAction !== "lock") { isLocked = false; shield.style.zIndex = "20"; }
        if (leftAction !== "menu") LEFT_BUTTON_IDS.forEach((id) => expandedButtonIds.delete(id));
        if (rightAction !== "menu") RIGHT_BUTTON_IDS.forEach((id) => expandedButtonIds.delete(id));

        createButton(videoArea, LEFT_BUTTON_ID, leftAction);
        createButton(videoArea, LEFT_BACKWARD_BUTTON_ID, "backward");
        createButton(videoArea, LEFT_FORWARD_BUTTON_ID, "forward");
        createButton(videoArea, RIGHT_BUTTON_ID, rightAction);
        createButton(videoArea, RIGHT_BACKWARD_BUTTON_ID, "backward");
        createButton(videoArea, RIGHT_FORWARD_BUTTON_ID, "forward");
        updateButtons(videoArea);
    }

    // #endregion



    // ============================================================
    // #region 锁定按钮
    // ============================================================

    function finishCurrentGesture(videoArea) {
        clearTimeout(pressTimer);
        clearTimeout(clickTimer);
        clickTimer = null;

        const video = videoArea.querySelector("video");
        if (video && gestureType != "") {
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


    function onLockButtonClick(videoArea) {
        isLocked = !isLocked;
        if (isLocked) finishCurrentGesture(videoArea);
        isLocked ? shield.style.zIndex = "100000" : shield.style.zIndex = "20";
        isLocked ? hideCtrl(videoArea) : showCtrl(videoArea);
        updateButtons(videoArea);
    }

    // #endregion



    // ============================================================
    // #region 菜单按钮
    // ============================================================

    function onMenuButtonClick(videoArea, button) {
        const buttonIds = button.id === LEFT_BUTTON_ID ? LEFT_BUTTON_IDS : RIGHT_BUTTON_IDS;
        const method = expandedButtonIds.has(button.id) ? "delete" : "add";
        buttonIds.forEach((id) => expandedButtonIds[method](id));
        updateButtons(videoArea);
    }


    function onQuickSeek(videoArea, seconds) {
        const video = videoArea.querySelector("video");
        if (!video) return;
        video.currentTime = clamp(video.currentTime + seconds, 0, video.duration);

        showToast(videoArea, "", `${seconds > 0 ? "快进" : "快退"} ${Math.abs(seconds)}s`);
        toastTimer = resetTimeout(toastTimer, () => hideToast(videoArea), TOAST_DELAY);
    }

    // #endregion



    // ============================================================
    // #region 单指单击：控制栏
    // ============================================================

    function showCtrl(videoArea) {
        const videoRect = videoArea.getBoundingClientRect();
        sendMouseEvent(videoArea, "mousemove", videoRect.left + videoRect.width / 2, videoRect.top + videoRect.height * 0.1);
    }


    function hideCtrl(videoArea) {
        const videoRect = videoArea.getBoundingClientRect();
        sendMouseEvent(videoArea, "mouseleave", videoRect.right + 10, videoRect.bottom + 10);
    }


    function isCtrlHidden(videoArea) {
        const playerContainer = videoArea.closest(".bpx-player-container");
        return playerContainer?.getAttribute("data-ctrl-hidden") === "true";
    }

    // #endregion



    // ============================================================
    // #region 单指双击：播放暂停
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
        video.playbackRate = userSettings.targetSpeed;
        const targetSpeed = Number(userSettings.targetSpeed);
        const speedText = Number.isInteger(targetSpeed) ? targetSpeed.toFixed(1) : String(targetSpeed);
        showToast(videoArea, speedIcon, speedText + "x");
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
        const x = barRect.left + barRect.width * ratio;
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
        startVal = startVal + (clientX - prevX) / (videoArea.clientWidth * (userSettings.horizontalSens / 100)) * video.duration;
        startVal = clamp(startVal, 0, video.duration);
        prevX = clientX;
        video.currentTime = startVal;

        const point = getProgressPoint(videoArea, (startVal + 3) / video.duration);
        if (point) sendMouseEvent(point.progressBar, "mousemove", point.x, point.y);

        const previewTime = videoArea.querySelector(".bpx-player-progress-preview-time");
        if (previewTime) previewTime.textContent = formatTime(startVal);

        showToast(videoArea, "", `${formatTime(startVal)} / ${formatTime(video.duration)}`);
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
    // #region 纵向滑动：调节亮度
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
        startVal = startVal + (prevY - clientY) / (videoArea.clientHeight * (userSettings.verticalSens / 100));
        startVal = clamp(startVal, 0, userSettings.maxBrightness / 100);
        prevY = clientY;

        video.style.filter = `brightness(${startVal})`;
        showToast(videoArea, brightnessIcon, `${Math.round(startVal * 100)}%`);
    }


    function onBrightnessEnd(videoArea) {
        toastTimer = resetTimeout(toastTimer, () => hideToast(videoArea), TOAST_DELAY);
    }

    // #endregion



    // ============================================================
    // #region 纵向滑动：调节音量
    // ============================================================

    function getGainNode(video) {
        if (!gainNode) {
            ctx = ctx || new (unsafeWindow.AudioContext || unsafeWindow.webkitAudioContext)();
            sourceNode = ctx.createMediaElementSource(video);

            gainNode = ctx.createGain();
            gainNode.gain.value = 1;

            sourceNode.connect(gainNode);
            gainNode.connect(ctx.destination);
        }
        return gainNode;
    }


    function onVolumeStart(video, clientY) {
        prevY = clientY;
        startVal = gainNode?.gain.value > 1 ? gainNode.gain.value : video.volume;
    }


    function onVolume(video, videoArea, clientY) {
        startVal = startVal + (prevY - clientY) / (videoArea.clientHeight * (userSettings.verticalSens / 100));
        startVal = clamp(startVal, 0, userSettings.maxVolume / 100);
        prevY = clientY;

        if (startVal <= 1) {
            video.volume = startVal;
            if (gainNode) gainNode.gain.value = 1;
        } else {
            video.volume = 1;
            getGainNode(video).gain.value = startVal;
        }
        showToast(videoArea, volumeIcon, `${Math.round(startVal * 100)}%`);
    }


    function onVolumeEnd(videoArea) {
        toastTimer = resetTimeout(toastTimer, () => hideToast(videoArea), TOAST_DELAY);
    }

    // #endregion



    // ============================================================
    // #region 手势识别与分发
    // ============================================================

    function handleDown(e, videoArea) {
        blockNativeEvent(e);
        if (isLocked) return;
        if (!e.isPrimary || e.button == 2) return;

        const video = videoArea.querySelector("video");
        if (!video) return;

        isDown = true;
        gestureType = "";
        startX = e.clientX;
        startY = e.clientY;

        // 启动长按计时器
        if (userSettings.longPressSpeed) {
            pressTimer = setTimeout(() => {
                if (gestureType == "") {
                    gestureType = "speed";
                    onLongPressStart(video, videoArea);
                }
            }, userSettings.pressDelay);
        }
    }


    function handleMove(e, videoArea) {
        blockNativeEvent(e);
        if (isLocked) return;
        if (!isDown) return;

        const video = videoArea.querySelector("video");
        if (!video) return;

        deltaX = e.clientX - startX;
        deltaY = startY - e.clientY;
        absX = Math.abs(deltaX);
        absY = Math.abs(deltaY);

        // 手势未确定，判断滑动方向
        if (gestureType == "" && (absX > 15 || absY > 15)) {
            clearTimeout(pressTimer);

            if (absX > absY) {
                if (userSettings.horizontalSwipeSeek) {
                    gestureType = "seek";
                    onSeekStart(video, videoArea, e.clientX);
                } else {
                    gestureType = "none";
                }
            } else {
                const zone = getGestureZone(videoArea, startX);
                const action = zone === "left" ? userSettings.verticalSwipeLeft : userSettings.verticalSwipeRight;

                if (action == "brightness") {
                    gestureType = "brightness";
                    onBrightnessStart(video, e.clientY);
                } else if (action == "volume") {
                    gestureType = "volume";
                    onVolumeStart(video, e.clientY);
                } else {
                    gestureType = "none";
                }
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


    function handleUp(e, videoArea) {
        blockNativeEvent(e);
        if (isLocked) return;
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
                    isCtrlHidden(videoArea) ? showCtrl(videoArea) : hideCtrl(videoArea);
                }, userSettings.clickTimeout);
            } else {
                clearTimeout(clickTimer);
                clickTimer = null;
                if (userSettings.doubleTapPause) onDoubleTap(video);
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

    function init() {
        // 查找视频区域
        videoArea = document.querySelector(".bpx-player-video-area");
        if (!videoArea) return;

        // 创建手势遮罩层
        shield = videoArea.querySelector("#" + SHIELD_ID);
        if (!shield) {
            shield = document.createElement("div");
            shield.id = SHIELD_ID;
            shield.style.cssText = `
                position: absolute;
                z-index: 20;
                top: 0;
                left: 0;

                width: 100%;
                height: 100%;

                background: transparent;

                user-select: none;
                touch-action: none !important;
            `;
            videoArea.appendChild(shield);

            shield.addEventListener("pointerdown", (e) => { handleDown(e, videoArea); shield.setPointerCapture(e.pointerId); }, true);
            shield.addEventListener("pointermove", (e) => { handleMove(e, videoArea); }, true);
            shield.addEventListener("pointerup", (e) => { handleUp(e, videoArea); shield.releasePointerCapture(e.pointerId); }, true);
            shield.addEventListener("pointercancel", (e) => { handleUp(e, videoArea); shield.releasePointerCapture(e.pointerId); }, true);
            
            shield.addEventListener("click", blockNativeEvent, true);
            shield.addEventListener("dblclick", blockNativeEvent, true);
            shield.addEventListener("auxclick", blockNativeEvent, true);
            shield.addEventListener("contextmenu", blockNativeEvent, true);
        }

        // 监听结束页手势
        const endingWrap = videoArea.querySelector(".bpx-player-ending-wrap");
        if (endingWrap && endingWrap.dataset.bteBound !== "true") {
            endingWrap.addEventListener("pointerdown", (e) => {
                blockNativeEvent(e);
                isCtrlHidden(videoArea) ? showCtrl(videoArea) : hideCtrl(videoArea);
            }, true);
            endingWrap.addEventListener("click", (e) => {
                if (e.target.closest(ENDING_INTERACTIVE_SELECTOR)) return;
                blockNativeEvent(e);
            }, true);
            endingWrap.addEventListener("dblclick", blockNativeEvent, true);
            endingWrap.addEventListener("auxclick", blockNativeEvent, true);
            endingWrap.addEventListener("contextmenu", blockNativeEvent, true);
            endingWrap.addEventListener("selectstart", blockNativeEvent, true);
            endingWrap.dataset.bteBound = "true";
        }

        // 监听控制栏变化
        const playerContainer = videoArea.closest(".bpx-player-container");
        if (playerContainer && currentPlayerContainer !== playerContainer) {
            ctrlObserver?.disconnect();
            ctrlObserver = new MutationObserver(() => updateButtons(videoArea));
            ctrlObserver.observe(playerContainer, { attributes: true, attributeFilter: ["data-screen", "data-ctrl-hidden"] });
            currentPlayerContainer = playerContainer;
        }

        // 初始化侧边按钮
        setupButtons(videoArea);
    }

    
    function scheduleInit() {
        if (shieldTimer) return;
        shieldTimer = setTimeout(() => { shieldTimer = null; init(); }, 200);
    }


    const observer = new MutationObserver(scheduleInit);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", init);
    init();

    // #endregion

})();
