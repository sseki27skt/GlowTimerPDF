// script.js (設定機能・日英併記対応版)

// 1. pdf.js ワーカーの設定
const { pdfjsLib } = window;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// 2. グローバル設定
const appConfig = {
    totalTime: 60,
    useCountdown: true,
    countdownSeconds: 3,
};

// 3. グローバル状態管理
const appState = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    timerId: null,
    remainingTime: 60,
    timerState: 'stopped', // 'stopped', 'running', 'paused', 'countdown'
    renderTask: null,
    countdownTimerId: null,
    countdownTime: 3,
};

// 4. DOM要素
let fileInput, canvas, ctx, timerDisplay, loader, body, rootStyle;
let dragOverlay, countdownOverlay;
let configPanel, configTotalTime, configUseCountdown, configCountdownSeconds;

// 5. アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    
    // 5.1. DOM要素の取得
    fileInput = document.getElementById('fileInput');
    canvas = document.getElementById('pdf-canvas');
    ctx = canvas.getContext('2d');
    timerDisplay = document.getElementById('timerDisplay');
    loader = document.getElementById('loader');
    dragOverlay = document.getElementById('drag-overlay');
    countdownOverlay = document.getElementById('countdown-overlay');
    body = document.body;
    rootStyle = document.documentElement.style;
    configPanel = document.getElementById('config-panel');
    configTotalTime = document.getElementById('config-total-time');
    configUseCountdown = document.getElementById('config-use-countdown');
    configCountdownSeconds = document.getElementById('config-countdown-seconds');

    // 5.2. イベントリスナーの設定
    fileInput.addEventListener('change', handleFileChange);
    window.addEventListener('keydown', handleKeyDown);
    setupDragDropListeners();
    setupConfigListeners();

    // 5.3. 初期UI状態の設定
    resetTimer(); 
});


// 6. PDF処理
async function loadPdfFile(file) {
    if (!file || file.type !== 'application/pdf') {
        // ▼ 修正: アラートを日英併記
        alert('PDFファイルのみドロップしてください。\nPlease drop PDF files only.');
        return;
    }

    loader.style.display = 'block';
    if (appState.pdfDoc) {
        appState.pdfDoc.destroy();
        appState.pdfDoc = null;
        body.classList.remove('pdf-loaded'); 
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        
        appState.pdfDoc = pdfDoc;
        appState.totalPages = pdfDoc.numPages;
        appState.currentPage = 1;

        await renderPage(appState.currentPage);
        resetTimer();

        body.classList.add('pdf-loaded'); 

    } catch (error) {
        console.error('PDFの読み込みに失敗しました:', error);
        // ▼ 修正: アラートを日英併記
        alert('PDFの読み込みに失敗しました。\nFailed to load PDF.');
        body.classList.remove('pdf-loaded'); 
    } finally {
        loader.style.display = 'none';
    }
}

async function handleFileChange(e) {
    const file = e.target.files[0];
    if (file) { await loadPdfFile(file); }
    fileInput.value = null; 
}
async function renderPage(pageNum) {
    if (!appState.pdfDoc || pageNum < 1 || pageNum > appState.totalPages) return;
    if (appState.renderTask) { appState.renderTask.cancel(); }
    try {
        loader.style.display = 'block';
        const page = await appState.pdfDoc.getPage(pageNum);
        const container = document.getElementById('pdf-viewer-container');
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(
            container.clientWidth / viewport.width, 
            container.clientHeight / viewport.height
        );
        const scaledViewport = page.getViewport({ scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const renderContext = { canvasContext: ctx, viewport: scaledViewport };
        appState.renderTask = page.render(renderContext);
        await appState.renderTask.promise;
        appState.currentPage = pageNum;
    } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
            console.error('ページのレンダリングに失敗:', error);
        }
    } finally {
        loader.style.display = 'none';
        appState.renderTask = null;
    }
}

// 7. タイマーロジック
function startCountdown() {
    if (appState.timerState === 'countdown' || appState.timerState === 'running') return;
    clearInterval(appState.timerId);
    clearInterval(appState.countdownTimerId);

    appState.timerState = 'countdown';
    appState.countdownTime = appConfig.countdownSeconds; 

    updateTimerUI();
    updateCountdownUI(); 

    appState.countdownTimerId = setInterval(() => {
        appState.countdownTime--;
        updateCountdownUI();

        if (appState.countdownTime <= 0) { // 「0」を表示せずに終了
            clearInterval(appState.countdownTimerId);
            appState.countdownTimerId = null;
            
            updateCountdownUI(); 
            startTimer();
        }
    }, 1000);
}

function startTimer() {
    if (appState.timerState === 'running' && appState.timerId) return;
    
    appState.timerState = 'running';
    clearInterval(appState.timerId); 
    appState.timerId = setInterval(tick, 100); 
    
    updateTimerUI();
}

function pauseTimer() {
    if (appState.timerState !== 'running' && appState.timerState !== 'countdown') return;
    
    appState.timerState = 'paused';
    clearInterval(appState.timerId); 
    appState.timerId = null;
    clearInterval(appState.countdownTimerId); 
    appState.countdownTimerId = null;
    
    updateTimerUI();
    updateCountdownUI();
}

function resumeTimer() {
    if (appState.timerState !== 'paused') return;
    
    if (appConfig.useCountdown && appState.remainingTime === appConfig.totalTime) {
        startCountdown();
    } else {
        startTimer(); 
    }
}

function resetTimer() {
    clearInterval(appState.timerId); 
    appState.timerId = null;
    clearInterval(appState.countdownTimerId); 
    appState.countdownTimerId = null;
    
    appState.remainingTime = appConfig.totalTime; 
    appState.timerState = 'stopped';
    
    updateTimerUI();
    updateCountdownUI();
}

function tick() {
    if (appState.timerState !== 'running') {
        return; 
    }
    appState.remainingTime -= 0.1;
    updateTimerUI();
}


function mapRange(value, inMin, inMax, outMin, outMax) {
    const val = Math.max(Math.min(value, inMax), inMin);
    const ratio = (val - inMin) / (inMax - inMin);
    return ratio * (outMax - outMin) + outMin;
}


// 8. UI更新 (メインの枠色)
function updateTimerUI() {
    if (!timerDisplay || !rootStyle || !body) {
        return;
    }

    const time = appState.remainingTime;
    const displayTime = Math.ceil(time); // 「0」を1秒表示するロジック
    timerDisplay.textContent = displayTime;

    let currentHue;
    let newColorHsl;
    let newColorHsla;

    const HUE_GREEN = 120, HUE_YELLOW = 60, HUE_RED = 0;
    const saturation = 90, lightness = 55;

    if (appState.timerState !== 'countdown') {
        if (appState.timerState === 'stopped' && time === appConfig.totalTime) {
            newColorHsl = 'var(--color-gray)';
            newColorHsla = 'rgba(52, 73, 94, 0.5)';
        } else {
            // 色変化のポイント (11秒, 5秒)
            if (time > 11) { currentHue = HUE_GREEN; }
            else if (time > 10) { currentHue = mapRange(time, 10, 11, HUE_YELLOW, HUE_GREEN); }
            else if (time > 5) { currentHue = HUE_YELLOW; }
            else if (time > 4) { currentHue = mapRange(time, 4, 5, HUE_RED, HUE_YELLOW); }
            else { currentHue = HUE_RED; } // 4秒以下 (マイナス含む) は赤

            newColorHsl = `hsl(${currentHue}, ${saturation}%, ${lightness}%)`;
            newColorHsla = `hsla(${currentHue}, ${saturation}%, ${lightness}%, 0.5)`;
        }
        
        rootStyle.setProperty('--timer-color', newColorHsl);
        rootStyle.setProperty('--timer-color-alpha', newColorHsla);
    } else {
        rootStyle.setProperty('--timer-color-alpha', 'rgba(236, 240, 241, 0.5)');
    }

    body.classList.remove('timer-running', 'timer-paused', 'timer-over', 'timer-stopped', 'timer-countdown');

    if (appState.timerState === 'running') {
        if (time <= 0) {
            body.classList.add('timer-over'); // 赤い高速明滅
        } else {
            body.classList.add('timer-running'); // 通常呼吸
        }
    } else if (appState.timerState === 'countdown') {
        body.classList.add('timer-countdown');
    } else if (appState.timerState === 'paused') {
        body.classList.add('timer-paused'); 
    } else { // 'stopped'
        body.classList.add('timer-stopped');
    }
}

// 8.5 UI更新 (カウントダウン数字)
function updateCountdownUI() {
    if (!countdownOverlay) return;

    if (appState.timerState === 'countdown' && appState.countdownTime > 0) { // 「0」は表示しない
        countdownOverlay.textContent = appState.countdownTime;
        countdownOverlay.style.display = 'flex';
        setTimeout(() => { countdownOverlay.style.opacity = '1'; }, 10); 
    } else {
        countdownOverlay.style.opacity = '0';
        setTimeout(() => { 
            countdownOverlay.style.display = 'none';
            countdownOverlay.textContent = '';
        }, 200);
    }
}


// 9. キーボードショートカット
function handleKeyDown(e) {
    if (body.classList.contains('show-settings') && e.key !== 's' && e.key !== 'S') {
        return;
    }

    if (!appState.pdfDoc && e.key !== 's' && e.key !== 'S') { 
        return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        return; 
    }

    // Pキーを削除
    const preventKeys = ['ArrowRight', 'ArrowLeft', ' ', 'Backspace', 'Enter', 'r', 'f', 'F', 's', 'S'];
    if (preventKeys.includes(e.key)) {
        e.preventDefault();
    }

    switch (e.key) {
        
        case 'Enter': 
        case 'ArrowRight':
            if (appState.currentPage < appState.totalPages) {
                renderPage(appState.currentPage + 1);
                resetTimer(); 
            }
            break;

        case 'ArrowLeft':
        case 'Backspace': 
            if (appState.currentPage > 1) {
                renderPage(appState.currentPage - 1);
                resetTimer(); 
            }
            break;

        case ' ':
            // Pキーのケースを削除 (Spaceに統合)
            if (appState.timerState === 'running') {
                pauseTimer();
            } else if (appState.timerState === 'countdown') {
                pauseTimer();
            } else {
                if (appConfig.useCountdown && appState.remainingTime === appConfig.totalTime) {
                    startCountdown();
                } else {
                    startTimer();
                }
            }
            break;

        case 'r':
        case 'R':
            resetTimer();
            break;
        
        case 'f':
        case 'F':
            toggleFullScreen();
            break;
        
        case 's':
        case 'S':
            toggleSettingsPanel();
            break;
    }
}

// 10. ドラッグ＆ドロップ設定
function setupDragDropListeners() {
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        body.classList.add('dragging');
        dragOverlay.style.display = 'flex';
    });
    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || typeof e.relatedTarget === 'undefined') {
            body.classList.remove('dragging');
            dragOverlay.style.display = 'none';
        }
    });
    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        body.classList.remove('dragging');
        dragOverlay.style.display = 'none';
        let file;
        if (e.dataTransfer.items) {
            if (e.dataTransfer.items[0].kind === 'file') {
                file = e.dataTransfer.items[0].getAsFile();
            }
        } else {
            file = e.dataTransfer.files[0];
        }
        if (file) { await loadPdfFile(file); }
    });
}

// 11. 全画面切り替え
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

// 12. 設定パネル
function setupConfigListeners() {
    configTotalTime.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        if (value > 0) {
            appConfig.totalTime = value;
            resetTimer(); 
        }
    });
    configUseCountdown.addEventListener('change', (e) => {
        appConfig.useCountdown = e.target.checked;
    });
    configCountdownSeconds.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        if (value > 0) {
            appConfig.countdownSeconds = value;
        }
    });
}

function toggleSettingsPanel() {
    body.classList.toggle('show-settings');
    if (body.classList.contains('show-settings')) {
        configTotalTime.value = appConfig.totalTime;
        configUseCountdown.checked = appConfig.useCountdown;
        configCountdownSeconds.value = appConfig.countdownSeconds;
    }
}

// 13. ウィンドウリサイズ対応
let resizeTimeout;
window.addEventListener('resize', () => {
    // PDFが読み込まれていない場合は何もしない
    if (!appState.pdfDoc) return;

    // 連続してイベントが発生するので、少し待ってから処理する (デバウンス処理)
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        renderPage(appState.currentPage);
    }, 200); // 0.2秒後に再描画
});