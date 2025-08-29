class SeatLotteryApp {
    constructor() {
        this.selectedGroupSize = 0;
        this.isDrawing = false;
        this.seatMapViewer = null;
        
        this.init();
    }

    init() {
        // SeatMapViewerを初期化（読み取り専用）
        this.seatMapViewer = new SeatMapViewer('seatMapCanvas', {
            readonly: true,
            showNumbers: true
        });

        // DOM要素取得
        this.elements = {
            numberButtons: document.getElementById('numberButtons'),
            selectedSize: document.getElementById('selectedSize'),
            lotteryBtn: document.getElementById('lotteryBtn'),
            lotteryStatus: document.getElementById('lotteryStatus'),
            resultSection: document.getElementById('resultSection'),
            seatNumbers: document.getElementById('seatNumbers'),
            newLotteryBtn: document.getElementById('newLotteryBtn'),
            fullMessage: document.getElementById('fullMessage'),
            remainingCount: document.getElementById('remainingCount'),
            resetViewBtn: document.getElementById('resetViewBtn'),
            fitViewBtn: document.getElementById('fitViewBtn')
        };

        // イベントリスナー設定
        this.setupEventListeners();

        // ストア購読
        this.unsubscribe = window.seatStore.subscribe((state) => this.onStateChange(state));

        // 初期表示
        this.onStateChange(window.seatStore.getState());
        
        // 全体表示
        setTimeout(() => this.seatMapViewer.fitToView(), 100);
    }

    setupEventListeners() {
        // 抽選ボタン
        this.elements.lotteryBtn.addEventListener('click', () => this.drawSeats());
        
        // 新しい抽選ボタン
        this.elements.newLotteryBtn.addEventListener('click', () => this.resetLottery());
        
        // 表示コントロール
        this.elements.resetViewBtn.addEventListener('click', () => this.seatMapViewer.resetView());
    }

    onStateChange(state) {
        this.updateNumberButtons(state);
        this.updateRemainingCount(state);
        this.updateLotteryButton(state);
        this.checkFullCapacity(state);
        this.clearResultIfNeeded(state);
    }

    updateNumberButtons(state) {
        const maxGroup = state.settings.maxGroup;
        const remaining = state.seatState.remaining.size;
        
        this.elements.numberButtons.innerHTML = '';
        
        for (let i = 1; i <= Math.min(maxGroup, remaining); i++) {
            const button = document.createElement('button');
            button.className = 'number-btn';
            button.textContent = i;
            button.addEventListener('click', () => this.selectGroupSize(i));
            
            if (i === this.selectedGroupSize) {
                button.classList.add('selected');
            }
            
            this.elements.numberButtons.appendChild(button);
        }

        // 選択中の人数が無効になった場合はリセット
        if (this.selectedGroupSize > Math.min(maxGroup, remaining)) {
            this.selectedGroupSize = 0;
            this.updateSelectedSizeDisplay();
        }
    }

    selectGroupSize(size) {
        this.selectedGroupSize = size;
        this.updateSelectedSizeDisplay();
        this.updateNumberButtonsDisplay();
        this.updateLotteryButton(window.seatStore.getState());
    }

    updateSelectedSizeDisplay() {
        if (this.selectedGroupSize > 0) {
            this.elements.selectedSize.textContent = `${this.selectedGroupSize}名で抽選`;
            this.elements.selectedSize.classList.add('selected');
        } else {
            this.elements.selectedSize.textContent = '人数を選択してください';
            this.elements.selectedSize.classList.remove('selected');
        }
    }

    updateNumberButtonsDisplay() {
        const buttons = this.elements.numberButtons.querySelectorAll('.number-btn');
        buttons.forEach((button, index) => {
            if (parseInt(button.textContent) === this.selectedGroupSize) {
                button.classList.add('selected');
            } else {
                button.classList.remove('selected');
            }
        });
    }

    updateRemainingCount(state) {
        const remaining = state.seatState.remaining.size;
        this.elements.remainingCount.textContent = remaining;
        
        // 残席が少なくなったら色変更
        if (remaining < 10) {
            this.elements.remainingCount.classList.add('low');
        } else {
            this.elements.remainingCount.classList.remove('low');
        }
    }

    updateLotteryButton(state) {
        const canDraw = this.selectedGroupSize > 0 && 
                       !this.isDrawing && 
                       state.seatState.remaining.size >= this.selectedGroupSize &&
                       state.seatState.remaining.size > 0;

        this.elements.lotteryBtn.disabled = !canDraw;
        
        if (this.isDrawing) {
            this.elements.lotteryBtn.textContent = '抽選中...';
            this.elements.lotteryStatus.textContent = '座席を選んでいます';
        } else {
            this.elements.lotteryBtn.textContent = '抽選する';
            this.elements.lotteryStatus.textContent = '';
        }
    }

    checkFullCapacity(state) {
        const isFull = state.seatState.remaining.size === 0;
        
        if (isFull) {
            this.elements.fullMessage.style.display = 'block';
            this.elements.lotteryBtn.style.display = 'none';
            this.elements.selectedSize.style.display = 'none';
            this.elements.numberButtons.style.display = 'none';
        } else {
            this.elements.fullMessage.style.display = 'none';
            this.elements.lotteryBtn.style.display = 'block';
            this.elements.selectedSize.style.display = 'block';
            this.elements.numberButtons.style.display = 'flex';
        }
    }

    clearResultIfNeeded(state) {
        // 新しい抽選が行われたら前回の結果をクリア
        if (state.seatState.lastDrawn.length === 0) {
            this.elements.resultSection.style.display = 'none';
        }
    }

    async drawSeats() {
        if (this.isDrawing || this.selectedGroupSize === 0) return;

        this.isDrawing = true;
        this.updateLotteryButton(window.seatStore.getState());

        try {
            // 少し待ってから抽選実行（UX向上）
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const result = await window.seatStore.drawSeats(this.selectedGroupSize);
            
            // GA4 抽選イベント送信
            const state = window.seatStore.getState();
            const isContiguous = this.checkContiguous(result);
            if (typeof sendCustomEvent === 'function') {
                sendCustomEvent('draw', {
                    group_size: this.selectedGroupSize,
                    assigned_count: result.length,
                    contiguous: isContiguous,
                    remaining: state.seatState.remaining.size
                });
            }
            
            this.displayResult(result);
            
        } catch (error) {
            this.displayError(error.message);
        } finally {
            this.isDrawing = false;
            this.updateLotteryButton(window.seatStore.getState());
        }
    }

    displayResult(seats) {
        // 結果表示
        this.elements.seatNumbers.innerHTML = '';
        
        seats.forEach((seat, index) => {
            const seatElement = document.createElement('div');
            seatElement.className = 'seat-number';
            seatElement.textContent = seat.number;
            
            // アニメーション遅延
            setTimeout(() => {
                seatElement.classList.add('show');
            }, index * 200);
            
            this.elements.seatNumbers.appendChild(seatElement);
        });

        this.elements.resultSection.style.display = 'block';
        
        // 座席表で点滅アニメーション開始
        this.seatMapViewer.startBlinking(seats);
        
        // 結果セクションにスクロール
        setTimeout(() => {
            this.elements.resultSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }, seats.length * 200 + 300);
    }

    displayError(message) {
        this.elements.lotteryStatus.textContent = `エラー: ${message}`;
        this.elements.lotteryStatus.classList.add('error');
        
        setTimeout(() => {
            this.elements.lotteryStatus.textContent = '';
            this.elements.lotteryStatus.classList.remove('error');
        }, 3000);
    }

    resetLottery() {
        // GA4 リセットイベント送信
        if (typeof sendCustomEvent === 'function') {
            sendCustomEvent('reset', {
                action: 'new_lottery'
            });
        }
        
        // 結果表示を隠す
        this.elements.resultSection.style.display = 'none';
        
        // 選択状態をリセット
        this.selectedGroupSize = 0;
        this.updateSelectedSizeDisplay();
        this.updateNumberButtonsDisplay();
        
        // ハイライト解除のため空の配列をセット
        window.seatStore.state.seatState.lastDrawn = [];
        window.seatStore.notify();
    }
    
    // 連番チェック関数
    checkContiguous(seats) {
        if (seats.length <= 1) return true;
        
        // 同じ行かつ連続した列番号かチェック
        const sameRow = seats.every(seat => seat.row === seats[0].row);
        if (!sameRow) return false;
        
        const cols = seats.map(seat => seat.col).sort((a, b) => a - b);
        for (let i = 1; i < cols.length; i++) {
            if (cols[i] !== cols[i-1] + 1) return false;
        }
        return true;
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        if (this.seatMapViewer) {
            this.seatMapViewer.destroy();
        }
    }
}

// アプリ初期化
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SeatLotteryApp();
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.destroy();
    }
});

// フルスクリーン制御（キオスク向け）
document.addEventListener('keydown', (e) => {
    // F11でフルスクリーン切り替え
    if (e.key === 'F11') {
        e.preventDefault();
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
    
    // ESCでフルスクリーン解除阻止（キオスクモード）
    if (e.key === 'Escape' && document.fullscreenElement) {
        e.preventDefault();
    }
});

// タブレット対応：スリープ防止
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log('Wake Lock failed:', err);
    }
}

// ページ表示時にスリープ防止を有効化
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        requestWakeLock();
    }
});

// 初期化時にもスリープ防止
requestWakeLock();