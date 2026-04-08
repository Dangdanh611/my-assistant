/**
 * ============================================================
 *  FLOATING WEB ASSISTANT v1.0
 *  Tác giả: Claude | Không cần backend | Chạy được trên GitHub Pages
 * ============================================================
 *
 *  Cách dùng:
 *    <script src="floating-assistant.js" data-config="https://yourdomain.com/config.json"></script>
 *
 *  Hoặc tự set config:
 *    window.FloatingAssistantConfig = { enableTTS: true, ... }
 *    <script src="floating-assistant.js"></script>
 * ============================================================
 */

(function () {
  "use strict";

  // ============================================================
  // CẤU HÌNH MẶC ĐỊNH
  // ============================================================
  const DEFAULT_CONFIG = {
    enableTTS: true,
    enableHighlight: true,
    enableReadingMode: true,
    enableScroll: true,
    enableReadingProgress: true,
    enableReadingTime: true,
    enableFind: true,
    enableFontCustomize: true,
    enableSavePosition: true,
    link: null,
    linkLabel: "Liên kết",
    accentColor: "#6C63FF",
    position: null, // Lưu trong localStorage
  };

  let CONFIG = { ...DEFAULT_CONFIG };

  // ============================================================
  // STATE TOÀN CỤC
  // ============================================================
  const STATE = {
    isOpen: false,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    ttsActive: false,
    ttsUtterance: null,
    ttsVoices: [],
    selectedVoice: null,
    readingMode: false,
    hiddenElements: [],
    fontSize: 16,
    lineHeight: 1.6,
    selectedFont: "inherit",
    highlights: [],
    readingProgressVisible: true,
  };

  // ============================================================
  // KHỞI ĐỘNG
  // ============================================================
  async function init() {
    // Lấy config từ attribute hoặc global var
    const scriptTag = document.currentScript || document.querySelector('script[src*="floating-assistant"]');
    const configUrl = scriptTag ? scriptTag.getAttribute("data-config") : null;

    if (configUrl) {
      try {
        const res = await fetch(configUrl);
        const remoteConfig = await res.json();
        // Hỗ trợ config theo domain
        const domain = window.location.hostname;
        if (remoteConfig[domain]) {
          CONFIG = { ...DEFAULT_CONFIG, ...remoteConfig[domain] };
        } else {
          CONFIG = { ...DEFAULT_CONFIG, ...remoteConfig };
        }
      } catch (e) {
        console.warn("[FloatingAssistant] Không load được config từ server, dùng mặc định.", e);
      }
    } else if (window.FloatingAssistantConfig) {
      CONFIG = { ...DEFAULT_CONFIG, ...window.FloatingAssistantConfig };
    }

    injectStyles();
    buildUI();
    restorePosition();
    restoreHighlights();
    restoreReadingPosition();
    initReadingProgress();
    initTTSVoices();

    // Lưu vị trí đọc mỗi 5 giây
    setInterval(saveReadingPosition, 5000);
  }

  // ============================================================
  // CSS NỘI BỘ (SCOPED, không xung đột)
  // ============================================================
  function injectStyles() {
    const accent = CONFIG.accentColor || "#6C63FF";
    const css = `
      /* ===== FLOATING ASSISTANT STYLES ===== */
      #fa-root * { box-sizing: border-box; margin: 0; padding: 0; }

      #fa-root {
        --fa-accent: ${accent};
        --fa-bg: #1a1a2e;
        --fa-surface: #16213e;
        --fa-surface2: #0f3460;
        --fa-text: #e0e0e0;
        --fa-text-dim: #888;
        --fa-border: rgba(255,255,255,0.1);
        --fa-shadow: 0 8px 32px rgba(0,0,0,0.5);
        --fa-radius: 16px;
        --fa-btn-size: 52px;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }

      /* NÚT NỔI CHÍNH */
      #fa-btn {
        position: fixed;
        width: var(--fa-btn-size);
        height: var(--fa-btn-size);
        border-radius: 50%;
        background: var(--fa-accent);
        border: none;
        cursor: pointer;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(108,99,255,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        user-select: none;
        -webkit-user-select: none;
        touch-action: none;
        overflow: visible;
      }
      #fa-btn:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(108,99,255,0.7); }
      #fa-btn svg { width: 24px; height: 24px; fill: white; transition: transform 0.3s; }
      #fa-btn.fa-open svg { transform: rotate(45deg); }

      /* VÒNG TRÒN READING PROGRESS */
      #fa-progress-ring {
        position: absolute;
        top: -4px; left: -4px;
        width: calc(var(--fa-btn-size) + 8px);
        height: calc(var(--fa-btn-size) + 8px);
        transform: rotate(-90deg);
        pointer-events: none;
      }
      #fa-progress-ring circle {
        fill: none;
        stroke: white;
        stroke-width: 3;
        stroke-dasharray: 188;
        stroke-dashoffset: 188;
        stroke-linecap: round;
        opacity: 0.8;
        transition: stroke-dashoffset 0.3s;
      }

      /* MENU POPUP */
      #fa-menu {
        position: fixed;
        width: 300px;
        background: var(--fa-bg);
        border: 1px solid var(--fa-border);
        border-radius: var(--fa-radius);
        box-shadow: var(--fa-shadow);
        z-index: 999998;
        overflow: hidden;
        transform-origin: bottom right;
        transform: scale(0.8) translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      #fa-menu.fa-visible {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      /* HEADER MENU */
      #fa-menu-header {
        padding: 16px 20px 12px;
        background: linear-gradient(135deg, var(--fa-accent), #a78bfa);
        color: white;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      #fa-menu-header span { opacity: 0.9; font-size: 11px; font-weight: 400; }

      /* READING PROGRESS BAR TOP */
      #fa-progress-bar-top {
        height: 3px;
        background: linear-gradient(90deg, var(--fa-accent), #a78bfa);
        width: 0%;
        transition: width 0.2s;
      }

      /* SECTIONS */
      .fa-section {
        padding: 12px 16px;
        border-bottom: 1px solid var(--fa-border);
      }
      .fa-section:last-child { border-bottom: none; }
      .fa-section-title {
        color: var(--fa-text-dim);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 10px;
      }

      /* GRID BUTTONS */
      .fa-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .fa-grid-3 { grid-template-columns: 1fr 1fr 1fr; }

      .fa-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 10px 8px;
        background: var(--fa-surface);
        border: 1px solid var(--fa-border);
        border-radius: 12px;
        color: var(--fa-text);
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.15s;
        text-align: center;
        line-height: 1.3;
      }
      .fa-action-btn:hover {
        background: var(--fa-surface2);
        border-color: var(--fa-accent);
        color: white;
        transform: translateY(-1px);
      }
      .fa-action-btn.fa-active {
        background: var(--fa-accent);
        border-color: var(--fa-accent);
        color: white;
      }
      .fa-action-btn .fa-icon { font-size: 18px; }

      /* TTS CONTROLS */
      #fa-tts-panel {
        display: none;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--fa-border);
      }
      #fa-tts-panel.fa-show { display: flex; }
      .fa-tts-row { display: flex; gap: 6px; }
      .fa-tts-btn {
        flex: 1;
        padding: 7px;
        background: var(--fa-surface2);
        border: 1px solid var(--fa-border);
        border-radius: 8px;
        color: var(--fa-text);
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s;
      }
      .fa-tts-btn:hover { background: var(--fa-accent); color: white; }
      #fa-voice-select {
        width: 100%;
        padding: 6px 8px;
        background: var(--fa-surface);
        border: 1px solid var(--fa-border);
        border-radius: 8px;
        color: var(--fa-text);
        font-size: 11px;
        cursor: pointer;
      }

      /* FIND PANEL */
      #fa-find-panel {
        display: none;
        gap: 6px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--fa-border);
      }
      #fa-find-panel.fa-show { display: flex; }
      #fa-find-input {
        flex: 1;
        padding: 7px 10px;
        background: var(--fa-surface);
        border: 1px solid var(--fa-border);
        border-radius: 8px;
        color: var(--fa-text);
        font-size: 12px;
        outline: none;
      }
      #fa-find-input:focus { border-color: var(--fa-accent); }
      #fa-find-btn {
        padding: 7px 12px;
        background: var(--fa-accent);
        border: none;
        border-radius: 8px;
        color: white;
        cursor: pointer;
        font-size: 12px;
      }

      /* FONT CONTROLS */
      #fa-font-panel {
        display: none;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--fa-border);
      }
      #fa-font-panel.fa-show { display: flex; }
      .fa-font-row { display: flex; align-items: center; gap: 8px; }
      .fa-font-row label { color: var(--fa-text-dim); font-size: 11px; min-width: 70px; }
      .fa-font-row input[type=range] {
        flex: 1;
        accent-color: var(--fa-accent);
        cursor: pointer;
      }
      .fa-font-row span { color: var(--fa-text); font-size: 11px; min-width: 30px; text-align: right; }
      #fa-font-select {
        width: 100%;
        padding: 6px 8px;
        background: var(--fa-surface);
        border: 1px solid var(--fa-border);
        border-radius: 8px;
        color: var(--fa-text);
        font-size: 11px;
        cursor: pointer;
      }

      /* INFO ROW */
      #fa-info-row {
        display: flex;
        gap: 8px;
        padding: 10px 16px;
        background: var(--fa-surface);
        border-top: 1px solid var(--fa-border);
      }
      .fa-info-badge {
        flex: 1;
        text-align: center;
        color: var(--fa-text-dim);
        font-size: 10px;
      }
      .fa-info-badge strong { display: block; color: var(--fa-accent); font-size: 14px; }

      /* HIGHLIGHT STYLES (inject vào trang) */
      .fa-highlight {
        background: rgba(255,220,50,0.5) !important;
        border-bottom: 2px solid #ffdc32 !important;
        border-radius: 2px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .fa-highlight:hover { background: rgba(255,200,0,0.7) !important; }

      /* FIND HIGHLIGHT */
      .fa-find-highlight {
        background: rgba(108,99,255,0.4) !important;
        border-bottom: 2px solid var(--fa-accent) !important;
        border-radius: 2px;
      }

      /* READING MODE */
      .fa-reading-mode-hidden { display: none !important; }
      #fa-reading-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        z-index: 99990;
        backdrop-filter: blur(4px);
      }
      #fa-reading-overlay.fa-show { display: block; }

      /* SCROLLBAR ĐẸP */
      #fa-menu::-webkit-scrollbar { width: 4px; }
      #fa-menu::-webkit-scrollbar-track { background: transparent; }
      #fa-menu::-webkit-scrollbar-thumb { background: var(--fa-border); border-radius: 4px; }
    `;

    const style = document.createElement("style");
    style.id = "fa-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // XÂY DỰNG UI
  // ============================================================
  function buildUI() {
    // Root container (để tránh xung đột CSS)
    const root = document.createElement("div");
    root.id = "fa-root";
    document.body.appendChild(root);

    // Floating Button
    const btn = document.createElement("button");
    btn.id = "fa-btn";
    btn.setAttribute("aria-label", "Web Assistant");
    btn.innerHTML = `
      <svg id="fa-progress-ring" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="29" id="fa-ring-circle"/>
      </svg>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
      </svg>
    `;
    root.appendChild(btn);

    // Menu
    const menu = document.createElement("div");
    menu.id = "fa-menu";
    menu.innerHTML = buildMenuHTML();
    root.appendChild(menu);

    // Set default position
    const savedPos = JSON.parse(localStorage.getItem("fa-position") || "null");
    if (savedPos) {
      btn.style.left = savedPos.left;
      btn.style.top = savedPos.top;
      btn.style.right = "auto";
      btn.style.bottom = "auto";
    } else {
      btn.style.right = "24px";
      btn.style.bottom = "24px";
    }

    setupDrag(btn);
    setupMenuEvents(btn, menu, root);
  }

  function buildMenuHTML() {
    const readingTime = calcReadingTime();
    return `
      <div id="fa-progress-bar-top"></div>
      <div id="fa-menu-header">
        <div>🤖 Web Assistant</div>
        <span>${window.location.hostname}</span>
      </div>

      <!-- INFO -->
      <div id="fa-info-row">
        <div class="fa-info-badge">
          <strong id="fa-progress-pct">0%</strong>
          Đã đọc
        </div>
        <div class="fa-info-badge">
          <strong id="fa-read-time">${readingTime}</strong>
          phút đọc
        </div>
      </div>

      <!-- ĐIỀU HƯỚNG -->
      ${CONFIG.enableScroll !== false ? `
      <div class="fa-section">
        <div class="fa-section-title">Điều hướng</div>
        <div class="fa-grid fa-grid-3">
          <button class="fa-action-btn" onclick="FloatingAssistant.scrollTop()">
            <span class="fa-icon">⬆️</span>Đầu trang
          </button>
          <button class="fa-action-btn" onclick="FloatingAssistant.scrollBottom()">
            <span class="fa-icon">⬇️</span>Cuối trang
          </button>
          <button class="fa-action-btn" onclick="FloatingAssistant.translatePage()">
            <span class="fa-icon">🌐</span>Dịch trang
          </button>
        </div>
      </div>` : ""}

      <!-- CÔNG CỤ ĐỌC -->
      <div class="fa-section">
        <div class="fa-section-title">Công cụ đọc</div>
        <div class="fa-grid">
          ${CONFIG.enableReadingMode !== false ? `
          <button class="fa-action-btn" id="fa-reading-mode-btn" onclick="FloatingAssistant.toggleReadingMode()">
            <span class="fa-icon">🧘</span>Chế độ đọc
          </button>` : ""}
          ${CONFIG.enableHighlight !== false ? `
          <button class="fa-action-btn" onclick="FloatingAssistant.highlightSelection()">
            <span class="fa-icon">📌</span>Highlight
          </button>` : ""}
          ${CONFIG.enableSavePosition !== false ? `
          <button class="fa-action-btn" onclick="FloatingAssistant.saveReadingPosition()">
            <span class="fa-icon">💾</span>Lưu vị trí
          </button>` : ""}
          ${CONFIG.enableFontCustomize !== false ? `
          <button class="fa-action-btn" id="fa-font-toggle-btn" onclick="FloatingAssistant.toggleFontPanel()">
            <span class="fa-icon">🔤</span>Cỡ chữ
          </button>` : ""}
          ${CONFIG.link ? `
          <button class="fa-action-btn" onclick="FloatingAssistant.openLink()">
            <span class="fa-icon">🔗</span>${CONFIG.linkLabel || "Liên kết"}
          </button>` : ""}
        </div>
        ${CONFIG.enableFontCustomize !== false ? `
        <div id="fa-font-panel">
          <div class="fa-font-row">
            <label>Cỡ chữ</label>
            <input type="range" id="fa-font-size" min="12" max="28" value="16" oninput="FloatingAssistant.setFontSize(this.value)">
            <span id="fa-font-size-val">16px</span>
          </div>
          <div class="fa-font-row">
            <label>Giãn dòng</label>
            <input type="range" id="fa-line-height" min="1.2" max="2.5" step="0.1" value="1.6" oninput="FloatingAssistant.setLineHeight(this.value)">
            <span id="fa-lh-val">1.6</span>
          </div>
          <select id="fa-font-select" onchange="FloatingAssistant.setFont(this.value)">
            <option value="inherit">Font mặc định</option>
            <option value="Georgia, serif">Georgia (Serif)</option>
            <option value="'Courier New', monospace">Courier New (Mono)</option>
            <option value="Arial, sans-serif">Arial (Sans)</option>
            <option value="'Times New Roman', serif">Times New Roman</option>
          </select>
        </div>` : ""}
      </div>

      <!-- TÌM KIẾM -->
      ${CONFIG.enableFind !== false ? `
      <div class="fa-section">
        <div class="fa-section-title">Tìm trong bài</div>
        <button class="fa-action-btn" id="fa-find-toggle-btn" onclick="FloatingAssistant.toggleFindPanel()" style="width:100%;flex-direction:row;gap:8px;">
          <span class="fa-icon">🔎</span>Tìm kiếm từ khóa
        </button>
        <div id="fa-find-panel">
          <input id="fa-find-input" type="text" placeholder="Nhập từ cần tìm..." onkeyup="if(event.key==='Enter')FloatingAssistant.findInPage()">
          <button id="fa-find-btn" onclick="FloatingAssistant.findInPage()">Tìm</button>
        </div>
      </div>` : ""}

      <!-- TEXT TO SPEECH -->
      ${CONFIG.enableTTS !== false ? `
      <div class="fa-section">
        <div class="fa-section-title">Đọc văn bản (TTS)</div>
        <button class="fa-action-btn" id="fa-tts-toggle-btn" onclick="FloatingAssistant.toggleTTSPanel()" style="width:100%;flex-direction:row;gap:8px;">
          <span class="fa-icon">🔊</span>Text to Speech
        </button>
        <div id="fa-tts-panel">
          <select id="fa-voice-select" onchange="FloatingAssistant.setVoice(this.value)">
            <option value="">-- Chọn giọng đọc --</option>
          </select>
          <div class="fa-tts-row">
            <button class="fa-tts-btn" onclick="FloatingAssistant.ttsPlay()">▶ Play</button>
            <button class="fa-tts-btn" onclick="FloatingAssistant.ttsPause()">⏸ Pause</button>
            <button class="fa-tts-btn" onclick="FloatingAssistant.ttsResume()">↩ Resume</button>
            <button class="fa-tts-btn" onclick="FloatingAssistant.ttsStop()">⏹ Stop</button>
          </div>
        </div>
      </div>` : ""}

    `;
  }

  // ============================================================
  // SETUP SỰ KIỆN MENU
  // ============================================================
  function setupMenuEvents(btn, menu, root) {
    btn.addEventListener("click", (e) => {
      if (STATE.isDragging) return;
      toggleMenu(btn, menu);
    });

    // Đóng menu khi click ngoài
    document.addEventListener("click", (e) => {
      if (STATE.isOpen && !root.contains(e.target)) {
        closeMenu(btn, menu);
      }
    });

    // Responsive: tính vị trí menu
    const resizeObs = new ResizeObserver(() => positionMenu(btn, menu));
    resizeObs.observe(document.documentElement);
  }

  function toggleMenu(btn, menu) {
    STATE.isOpen ? closeMenu(btn, menu) : openMenu(btn, menu);
  }

  function openMenu(btn, menu) {
    STATE.isOpen = true;
    btn.classList.add("fa-open");
    positionMenu(btn, menu);
    menu.classList.add("fa-visible");
    updateInfo();
  }

  function closeMenu(btn, menu) {
    STATE.isOpen = false;
    btn.classList.remove("fa-open");
    menu.classList.remove("fa-visible");
  }

  function positionMenu(btn, menu) {
    const btnRect = btn.getBoundingClientRect();
    const menuW = 300;
    const menuH = menu.offsetHeight || 400;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = btnRect.right - menuW;
    let top = btnRect.top - menuH - 8;

    // Tự điều chỉnh nếu tràn màn hình
    if (left < 8) left = 8;
    if (left + menuW > vw - 8) left = vw - menuW - 8;
    if (top < 8) top = btnRect.bottom + 8;
    if (top + menuH > vh - 8) top = vh - menuH - 8;

    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  // ============================================================
  // DRAG & DROP
  // ============================================================
  function setupDrag(btn) {
    let startX, startY, startLeft, startTop, moved;

    function onStart(e) {
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      const rect = btn.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      moved = false;
      STATE.isDragging = false;

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    }

    function onMove(e) {
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!moved && Math.hypot(dx, dy) > 5) {
        moved = true;
        STATE.isDragging = true;
      }

      if (STATE.isDragging) {
        if (e.cancelable) e.preventDefault();
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        // Giữ trong màn hình
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - btn.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - btn.offsetHeight));

        btn.style.left = newLeft + "px";
        btn.style.top = newTop + "px";
        btn.style.right = "auto";
        btn.style.bottom = "auto";
      }
    }

    function onEnd() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);

      if (STATE.isDragging) {
        snapToEdge(btn);
        setTimeout(() => { STATE.isDragging = false; }, 100);
      }
    }

    btn.addEventListener("mousedown", onStart);
    btn.addEventListener("touchstart", onStart, { passive: true });
  }

  // Snap vào cạnh gần nhất
  function snapToEdge(btn) {
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const centerX = rect.left + rect.width / 2;
    const margin = 16;

    let finalLeft;
    if (centerX < vw / 2) {
      finalLeft = margin;
    } else {
      finalLeft = vw - btn.offsetWidth - margin;
    }

    btn.style.transition = "left 0.3s cubic-bezier(0.34,1.56,0.64,1)";
    btn.style.left = finalLeft + "px";
    btn.style.right = "auto";

    setTimeout(() => {
      btn.style.transition = "";
      savePosition(btn);
    }, 350);
  }

  function savePosition(btn) {
    const rect = btn.getBoundingClientRect();
    localStorage.setItem("fa-position", JSON.stringify({
      left: btn.style.left,
      top: btn.style.top,
    }));
  }

  function restorePosition() {
    // Đã xử lý trong buildUI
  }

  // ============================================================
  // READING PROGRESS
  // ============================================================
  function initReadingProgress() {
    window.addEventListener("scroll", updateProgress, { passive: true });
    updateProgress();
  }

  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min(100, Math.round(scrollTop / docHeight * 100)) : 0;

    // Vòng tròn
    const circle = document.getElementById("fa-ring-circle");
    if (circle) {
      const circumference = 188; // 2 * pi * 29 ≈ 182.2, dùng 188 để gần đúng
      const offset = circumference - (pct / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }

    // Progress bar và số %
    const bar = document.getElementById("fa-progress-bar-top");
    if (bar) bar.style.width = pct + "%";

    const pctEl = document.getElementById("fa-progress-pct");
    if (pctEl) pctEl.textContent = pct + "%";
  }

  function updateInfo() {
    updateProgress();
    const rt = calcReadingTime();
    const rtEl = document.getElementById("fa-read-time");
    if (rtEl) rtEl.textContent = rt;
  }

  // ============================================================
  // READING TIME
  // ============================================================
  function calcReadingTime() {
    const text = document.body.innerText || "";
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return minutes;
  }

  // ============================================================
  // TEXT TO SPEECH
  // ============================================================
  function initTTSVoices() {
    if (!window.speechSynthesis) return;

    function loadVoices() {
      STATE.ttsVoices = window.speechSynthesis.getVoices();
      const sel = document.getElementById("fa-voice-select");
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Chọn giọng đọc --</option>';
      STATE.ttsVoices.forEach((v, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})`;
        sel.appendChild(opt);
      });
    }

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  function getPageText() {
    // Lấy nội dung chính (ưu tiên article, main, .content)
    const main = document.querySelector("article, main, .content, .post-content, #content, .entry-content");
    return (main || document.body).innerText.trim();
  }

  // ============================================================
  // HIGHLIGHT
  // ============================================================
  function restoreHighlights() {
    if (CONFIG.enableHighlight === false) return;
    const saved = JSON.parse(localStorage.getItem("fa-highlights") || "[]");
    STATE.highlights = saved;
    // Không apply lại (vì DOM có thể thay đổi, khó match chính xác)
    // Có thể mở rộng sau với Range API
  }

  // ============================================================
  // READING POSITION
  // ============================================================
  function saveReadingPosition() {
    if (CONFIG.enableSavePosition === false) return;
    const key = "fa-pos-" + location.pathname;
    localStorage.setItem(key, window.scrollY);
  }

  function restoreReadingPosition() {
    if (CONFIG.enableSavePosition === false) return;
    const key = "fa-pos-" + location.pathname;
    const saved = localStorage.getItem(key);
    if (saved && parseInt(saved) > 100) {
      setTimeout(() => {
        window.scrollTo({ top: parseInt(saved), behavior: "smooth" });
      }, 800);
    }
  }

  // ============================================================
  // API CÔNG KHAI (gọi từ HTML)
  // ============================================================
  window.FloatingAssistant = {
    scrollTop() {
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    scrollBottom() {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    },
    translatePage() {
      const url = encodeURIComponent(location.href);
      window.open(`https://translate.google.com/translate?sl=auto&tl=vi&u=${url}`, "_blank");
    },
    openLink() {
      if (CONFIG.link) window.open(CONFIG.link, "_blank");
    },

    // TTS
    toggleTTSPanel() {
      const panel = document.getElementById("fa-tts-panel");
      if (panel) panel.classList.toggle("fa-show");
    },
    ttsPlay() {
      if (!window.speechSynthesis) return alert("Trình duyệt không hỗ trợ TTS");
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(getPageText());
      if (STATE.selectedVoice !== null && STATE.ttsVoices[STATE.selectedVoice]) {
        u.voice = STATE.ttsVoices[STATE.selectedVoice];
      }
      u.rate = 0.9;
      STATE.ttsUtterance = u;
      window.speechSynthesis.speak(u);
    },
    ttsPause() {
      window.speechSynthesis && window.speechSynthesis.pause();
    },
    ttsResume() {
      window.speechSynthesis && window.speechSynthesis.resume();
    },
    ttsStop() {
      window.speechSynthesis && window.speechSynthesis.cancel();
    },
    setVoice(idx) {
      STATE.selectedVoice = idx !== "" ? parseInt(idx) : null;
    },

    // READING MODE
    toggleReadingMode() {
      const btn = document.getElementById("fa-reading-mode-btn");
      if (!STATE.readingMode) {
        // Ẩn header, sidebar, ads
        const selectors = ["header", "footer", "aside", ".sidebar", ".advertisement", ".ads", "nav", ".nav", ".header", ".footer"];
        STATE.hiddenElements = [];
        selectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            if (!el.closest("#fa-root")) {
              el.classList.add("fa-reading-mode-hidden");
              STATE.hiddenElements.push(el);
            }
          });
        });
        STATE.readingMode = true;
        if (btn) btn.classList.add("fa-active");
      } else {
        STATE.hiddenElements.forEach(el => el.classList.remove("fa-reading-mode-hidden"));
        STATE.hiddenElements = [];
        STATE.readingMode = false;
        if (btn) btn.classList.remove("fa-active");
      }
    },

    // HIGHLIGHT
    highlightSelection() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        alert("Hãy bôi đen text trước!");
        return;
      }
      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();
      if (!text) return;

      const span = document.createElement("span");
      span.className = "fa-highlight";
      span.title = "Click để xóa highlight";
      span.onclick = function () {
        const parent = this.parentNode;
        while (this.firstChild) parent.insertBefore(this.firstChild, this);
        parent.removeChild(this);
        removeHighlightFromStorage(text);
      };

      try {
        range.surroundContents(span);
        selection.removeAllRanges();
        // Lưu vào localStorage
        STATE.highlights.push({ text, timestamp: Date.now() });
        localStorage.setItem("fa-highlights", JSON.stringify(STATE.highlights));
      } catch (e) {
        alert("Không thể highlight vùng này (có thể chứa nhiều loại phần tử khác nhau).");
      }
    },

    saveReadingPosition() {
      saveReadingPosition();
      alert("✅ Đã lưu vị trí đọc!");
    },

    // FIND IN PAGE
    toggleFindPanel() {
      const panel = document.getElementById("fa-find-panel");
      if (panel) panel.classList.toggle("fa-show");
      setTimeout(() => {
        const inp = document.getElementById("fa-find-input");
        if (inp) inp.focus();
      }, 100);
    },
    findInPage() {
      // Xóa highlight cũ
      document.querySelectorAll(".fa-find-highlight").forEach(el => {
        const parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
      });

      const keyword = document.getElementById("fa-find-input")?.value.trim();
      if (!keyword) return;

      const body = document.querySelector("article, main, .content, #content") || document.body;
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (node.parentElement?.closest("#fa-root")) return NodeFilter.FILTER_REJECT;
          return node.textContent.toLowerCase().includes(keyword.toLowerCase())
            ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      let first = null;
      nodes.forEach(node => {
        const idx = node.textContent.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx === -1) return;
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + keyword.length);
        const span = document.createElement("span");
        span.className = "fa-find-highlight";
        range.surroundContents(span);
        if (!first) first = span;
      });

      if (first) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        alert(`Không tìm thấy: "${keyword}"`);
      }
    },

    // FONT
    toggleFontPanel() {
      const panel = document.getElementById("fa-font-panel");
      if (panel) panel.classList.toggle("fa-show");
    },
    setFontSize(val) {
      STATE.fontSize = parseInt(val);
      const el = document.getElementById("fa-font-size-val");
      if (el) el.textContent = val + "px";
      applyFontStyles();
    },
    setLineHeight(val) {
      STATE.lineHeight = parseFloat(val);
      const el = document.getElementById("fa-lh-val");
      if (el) el.textContent = parseFloat(val).toFixed(1);
      applyFontStyles();
    },
    setFont(val) {
      STATE.selectedFont = val;
      applyFontStyles();
    },
  };

  function applyFontStyles() {
    const target = document.querySelector("article, main, .content, #content, .post-content") || document.body;
    target.style.fontSize = STATE.fontSize + "px";
    target.style.lineHeight = STATE.lineHeight;
    target.style.fontFamily = STATE.selectedFont;
  }

  function removeHighlightFromStorage(text) {
    STATE.highlights = STATE.highlights.filter(h => h.text !== text);
    localStorage.setItem("fa-highlights", JSON.stringify(STATE.highlights));
  }

  // ============================================================
  // KHỞI ĐỘNG KHI DOM SẴN SÀNG
  // ============================================================
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
