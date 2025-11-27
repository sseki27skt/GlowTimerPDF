// script.js (PDF & 画像 両対応版)

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
    mode: null,      // 'pdf' or 'image'
    // PDF用
    pdfDoc: null,
    renderTask: null,
    // 画像用
    images: [],
    currentImageUrl: null,
    
    // 共通
    currentPage: 1,
    totalPages: 0,
    timerId: null,
    remainingTime: 60,
    timerState: 'stopped', 
    countdownTimerId: null,
    countdownTime: 3,
};

// 4. DOM要素
let fileInput, canvas, ctx, slideImage, timerDisplay, loader, body, rootStyle;
let dragOverlay, countdownOverlay;
let configPanel, configTotalTime, configUseCountdown, configCountdownSeconds;

// 5. アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    
    fileInput = document.getElementById('fileInput');
    canvas = document.getElementById('pdf-canvas');
    ctx = canvas.getContext('2d');
    slideImage = document.getElementById('slide-image'); // 新規追加
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

    fileInput.addEventListener('change', handleFileChange);
    window.addEventListener('keydown', handleKeyDown);
    setupDragDropListeners();
    setupConfigListeners();

    resetTimer(); 
});


// 6. ファイル読み込み処理の分岐
async function loadFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    // 前回の状態をクリア
    cleanupPreviousFile();
    loader.style.display = 'block';

    const files = Array.from(fileList);
    
    // 判別ロジック
    // 1. PDFファイルが1つでも含まれていれば、最初のPDFをロード (複数PDFは非対応で、最初の1つを優先)
    const pdfFile = files.find(f => f.type === 'application/pdf');
    
    if (pdfFile) {
        // --- PDFモード ---
        await loadPdfMode(pdfFile);
    } else {
        // --- 画像モード ---
        // 画像ファイルのみ抽出
        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        if (imageFiles.length > 0) {
            await loadImageMode(imageFiles);
        } else {
            alert('対応していないファイル形式です。\nUnsupported file format.');
            loader.style.display = 'none';
        }
    }
}

function cleanupPreviousFile() {
    // 共通クリーンアップ
    body.classList.remove('pdf-loaded');
    appState.mode = null;
    appState.currentPage = 1;
    appState.totalPages = 0;

    // PDFクリーンアップ
    if (appState.pdfDoc) {
        appState.pdfDoc.destroy();
        appState.pdfDoc = null;
    }
    if (appState.renderTask) {
        appState.renderTask.cancel();
        appState.renderTask = null;
    }

    // 画像クリーンアップ
    if (appState.currentImageUrl) {
        URL.revokeObjectURL(appState.currentImageUrl);
        appState.currentImageUrl = null;
    }
    appState.images = [];
}

// 6-A. PDFモードの読み込み
async function loadPdfMode(file) {
    try {
        appState.mode = 'pdf';
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        appState.pdfDoc = await loadingTask.promise;
        appState.totalPages = appState.pdfDoc.numPages;

        // ビューア切り替え
        canvas.style.display = 'block';
        slideImage.style.display = 'none';

        await renderPage(1);
        resetTimer();
        body.classList.add('pdf-loaded');

    } catch (error) {
        console.error('PDF Load Error:', error);
        alert('PDFの読み込みに失敗しました。\nFailed to load PDF.');
    } finally {
        loader.style.display = 'none';
    }
}

// 6-B. 画像モードの読み込み
async function loadImageMode(files) {
    try {
        appState.mode = 'image';
        // ファイル名順にソート
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        appState.images = files;
        appState.totalPages = files.length;

        // ビューア切り替え
        canvas.style.display = 'none';
        slideImage.style.display = 'block';

        await renderPage(1);
        resetTimer();
        body.classList.add('pdf-loaded'); // CSSクラスは再利用

    } catch (error) {
        console.error('Image Load Error:', error);
        alert('画像の読み込みに失敗しました。\nFailed to load images.');
    } finally {
        loader.style.display = 'none';
    }
}


async function handleFileChange(e) {
    await loadFiles(e.target.files);
    fileInput.value = null; 
}

// 7. 描画処理 (共通エントリーポイント)
async function renderPage(pageNum) {
    if (pageNum < 1 || pageNum > appState.totalPages) return;
    
    appState.currentPage = pageNum;
    loader.style.display = 'block';

    if (appState.mode === 'pdf') {
        await renderPdfPage(pageNum);
    } else if (appState.mode === 'image') {
        await renderImagePage(pageNum);
    }
    
    loader.style.display = 'none';
}

// 7-A. PDF描画
async function renderPdfPage(pageNum) {
    if (!appState.pdfDoc) return;
    if (appState.renderTask) { appState.renderTask.cancel(); }

    try {
        const page = await appState.pdfDoc.getPage(pageNum);
        const container = document.getElementById('pdf-viewer-container');
        const viewport = page.getViewport({ scale: 1 });
        
        // コンテナに収まるスケールを計算
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
    } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
            console.error('PDF Render Error:', error);
        }
    }
}

// 7-B. 画像描画
async function renderImagePage(pageNum) {
    if (appState.images.length === 0) return;

    try {
        const file = appState.images[pageNum - 1];
        
        if (appState.currentImageUrl) {
            URL.revokeObjectURL(appState.currentImageUrl);
        }
        
        const url = URL.createObjectURL(file);
        appState.currentImageUrl = url;

        // 読み込み完了待ち
        await new Promise((resolve, reject) => {
            slideImage.onload = () => resolve();
            slideImage.onerror = () => reject();
            slideImage.src = url;
        });

    } catch (error) {
        console.error('Image Render Error:', error);
    }
}

// 8. タイマーロジック (変更なし)
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

        if (appState.countdownTime <= 0) { 
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
    if (appState.timerState !== 'running') return;
    appState.remainingTime -= 0.1;
    updateTimerUI();
}

function mapRange(value, inMin, inMax, outMin, outMax) {
    const val = Math.max(Math.min(value, inMax), inMin);
    const ratio = (val - inMin) / (inMax - inMin);
    return ratio * (outMax - outMin) + outMin;
}

// 9. UI更新 (変更なし)
function updateTimerUI() {
    if (!timerDisplay || !rootStyle || !body) return;

    const time = appState.remainingTime;
    const displayTime = Math.ceil(time); 
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
            if (time > 11) { currentHue = HUE_GREEN; }
            else if (time > 10) { currentHue = mapRange(time, 10, 11, HUE_YELLOW, HUE_GREEN); }
            else if (time > 5) { currentHue = HUE_YELLOW; }
            else if (time > 4) { currentHue = mapRange(time, 4, 5, HUE_RED, HUE_YELLOW); }
            else { currentHue = HUE_RED; } 
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
            body.classList.add('timer-over'); 
        } else {
            body.classList.add('timer-running'); 
        }
    } else if (appState.timerState === 'countdown') {
        body.classList.add('timer-countdown');
    } else if (appState.timerState === 'paused') {
        body.classList.add('timer-paused'); 
    } else { 
        body.classList.add('timer-stopped');
    }
}

function updateCountdownUI() {
    if (!countdownOverlay) return;
    if (appState.timerState === 'countdown' && appState.countdownTime > 0) { 
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

// 10. キーボードショートカット
function handleKeyDown(e) {
    if (body.classList.contains('show-settings') && e.key !== 's' && e.key !== 'S') return;
    
    // モードがセットされていなければ操作無効
    if (!appState.mode && e.key !== 's' && e.key !== 'S') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') return;

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

// 11. ドラッグ＆ドロップ設定 (loadFilesへ委譲)
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
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await loadFiles(e.dataTransfer.files);
        }
    });
}

// 12. 全画面・設定・リサイズ
function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

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

let resizeTimeout;
window.addEventListener('resize', () => {
    if (appState.mode === 'pdf' && appState.pdfDoc) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            renderPage(appState.currentPage);
        }, 200);
    }
    // 画像モードの場合はCSSのmax-width/max-heightで追従するので再描画不要
});