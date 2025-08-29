class SeatLotteryAdmin {
    constructor() {
        this.seatMapViewer = null;
        this.editMode = true;
        this.init();
    }

    init() {
        // 管理用SeatMapViewerを初期化（編集可能）
        this.seatMapViewer = new SeatMapViewer('adminSeatMapCanvas', {
            readonly: false,
            showNumbers: true,
            cellSize: 28 // 抽選画面と同程度のサイズ
        });
        this.seatMapViewer.setEditMode(true);

        // DOM要素取得
        this.elements = {
            // レイアウト
            rowsInput: document.getElementById('rowsInput'),
            colsInput: document.getElementById('colsInput'),
            applyLayoutBtn: document.getElementById('applyLayoutBtn'),
            
            // 番号付け
            numberingType: document.getElementById('numberingType'),
            rowLabels: document.getElementById('rowLabels'),
            zeroPad: document.getElementById('zeroPad'),
            stagePosition: document.getElementById('stagePosition'),
            applyNumberingBtn: document.getElementById('applyNumberingBtn'),
            
            // 設定
            maxGroup: document.getElementById('maxGroup'),
            strictConsecutive: document.getElementById('strictConsecutive'),
            pinLock: document.getElementById('pinLock'),
            applySettingsBtn: document.getElementById('applySettingsBtn'),
            
            // プリセット
            exportBtn: document.getElementById('exportBtn'),
            importBtn: document.getElementById('importBtn'),
            importFile: document.getElementById('importFile'),
            presetData: document.getElementById('presetData'),
            loadPresetBtn: document.getElementById('loadPresetBtn'),
            
            // 状態表示
            totalSeats: document.getElementById('totalSeats'),
            remainingSeats: document.getElementById('remainingSeats'),
            usedSeats: document.getElementById('usedSeats'),
            startTime: document.getElementById('startTime'),
            
            // コントロール
            editModeBtn: document.getElementById('editModeBtn'),
            resetViewBtn: document.getElementById('resetViewBtn'),
            savePresetBtn: document.getElementById('savePresetBtn'),
            resetSeatsBtn: document.getElementById('resetSeatsBtn')
        };

        // イベントリスナー設定
        this.setupEventListeners();

        // ストア購読
        this.unsubscribe = window.seatStore.subscribe((state) => this.onStateChange(state));

        // 初期表示
        this.loadCurrentSettings();
        this.onStateChange(window.seatStore.getState());
        
        // 表示リセット（中央上揃え）
        setTimeout(() => this.seatMapViewer.resetView(), 100);
    }

    setupEventListeners() {
        // レイアウト設定
        this.elements.applyLayoutBtn.addEventListener('click', () => this.applyLayout());
        
        // 番号付け設定
        this.elements.applyNumberingBtn.addEventListener('click', () => this.applyNumbering());
        
        // 抽選設定
        this.elements.applySettingsBtn.addEventListener('click', () => this.applySettings());
        
        // プリセット管理
        this.elements.exportBtn.addEventListener('click', () => this.exportPreset());
        this.elements.importBtn.addEventListener('click', () => this.elements.importFile.click());
        this.elements.importFile.addEventListener('change', (e) => this.importPreset(e));
        this.elements.loadPresetBtn.addEventListener('click', () => this.loadPresetFromText());
        
        // コントロール
        this.elements.editModeBtn.addEventListener('click', () => this.toggleEditMode());
        this.elements.resetViewBtn.addEventListener('click', () => this.seatMapViewer.resetView());
        this.elements.savePresetBtn.addEventListener('click', () => this.savePreset());
        this.elements.resetSeatsBtn.addEventListener('click', () => this.resetSeats());
        
        // リアルタイム更新（番号付けプレビュー用）
        this.elements.numberingType.addEventListener('change', () => this.previewNumbering());
        this.elements.rowLabels.addEventListener('change', () => this.previewNumbering());
        this.elements.zeroPad.addEventListener('input', () => this.previewNumbering());
        this.elements.stagePosition.addEventListener('change', () => this.previewNumbering());
    }

    loadCurrentSettings() {
        const state = window.seatStore.getState();
        
        // レイアウト設定
        this.elements.rowsInput.value = state.layout.rows;
        this.elements.colsInput.value = state.layout.cols;
        
        // 番号付け設定
        this.elements.numberingType.value = state.layout.numbering.type;
        this.elements.rowLabels.value = state.layout.numbering.rowLabels;
        this.elements.zeroPad.value = state.layout.numbering.zeroPad;
        this.elements.stagePosition.value = state.layout.numbering.stagePosition;
        
        // 抽選設定
        this.elements.maxGroup.value = state.settings.maxGroup;
        this.elements.strictConsecutive.checked = state.settings.strictConsecutive;
        this.elements.pinLock.value = state.settings.pinLock || '';
    }

    onStateChange(state) {
        this.updateStatusInfo(state);
    }

    updateStatusInfo(state) {
        const totalSeats = this.countTotalSeats(state);
        const remainingSeats = state.seatState.remaining.size;
        const usedSeats = state.seatState.used.size;
        const startTime = state.seatState.startedAt;

        this.elements.totalSeats.textContent = totalSeats;
        this.elements.remainingSeats.textContent = remainingSeats;
        this.elements.usedSeats.textContent = usedSeats;
        this.elements.startTime.textContent = startTime ? 
            new Date(startTime).toLocaleString() : '未開始';
    }

    countTotalSeats(state) {
        const { rows, cols, cells } = state.layout;
        let count = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (cells[row] && cells[row][col] === 'seat') {
                    count++;
                }
            }
        }
        return count;
    }

    applyLayout() {
        const rows = parseInt(this.elements.rowsInput.value);
        const cols = parseInt(this.elements.colsInput.value);
        
        if (rows < 1 || rows > 50 || cols < 1 || cols > 50) {
            alert('行数・列数は1〜50の範囲で入力してください');
            return;
        }

        if (confirm('レイアウトを変更すると座席の使用状況がリセットされます。よろしいですか？')) {
            window.seatStore.updateLayout({ rows, cols });
            window.seatStore.resetSeats();
            setTimeout(() => this.seatMapViewer.resetView(), 100);
            this.showMessage('レイアウトを更新しました');
        }
    }

    applyNumbering() {
        const numbering = {
            type: this.elements.numberingType.value,
            rowLabels: this.elements.rowLabels.value,
            zeroPad: parseInt(this.elements.zeroPad.value),
            stagePosition: this.elements.stagePosition.value
        };

        window.seatStore.updateLayout({ numbering });
        this.showMessage('番号付け設定を更新しました');
    }

    previewNumbering() {
        // リアルタイムプレビューのため即座に更新
        const numbering = {
            type: this.elements.numberingType.value,
            rowLabels: this.elements.rowLabels.value,
            zeroPad: parseInt(this.elements.zeroPad.value),
            stagePosition: this.elements.stagePosition.value
        };

        window.seatStore.updateLayout({ numbering });
    }

    applySettings() {
        const maxGroup = parseInt(this.elements.maxGroup.value);
        const strictConsecutive = this.elements.strictConsecutive.checked;
        const pinLock = this.elements.pinLock.value.trim() || null;

        if (maxGroup < 1 || maxGroup > 20) {
            alert('最大グループ人数は1〜20の範囲で入力してください');
            return;
        }

        if (pinLock && !/^\d{4}$/.test(pinLock)) {
            alert('PINロックは4桁の数字で入力してください');
            return;
        }

        const settings = { maxGroup, strictConsecutive, pinLock };
        window.seatStore.updateSettings(settings);
        this.showMessage('抽選設定を更新しました');
    }

    exportPreset() {
        try {
            const presetData = window.seatStore.exportPreset();
            this.elements.presetData.value = presetData;
            this.showMessage('設定をエクスポートしました');
        } catch (error) {
            this.showError('エクスポートに失敗しました: ' + error.message);
        }
    }

    importPreset(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                window.seatStore.importPreset(e.target.result);
                this.loadCurrentSettings();
                setTimeout(() => this.seatMapViewer.resetView(), 100);
                this.showMessage('設定をインポートしました');
            } catch (error) {
                this.showError('インポートに失敗しました: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    loadPresetFromText() {
        const presetData = this.elements.presetData.value.trim();
        if (!presetData) {
            alert('プリセットデータを入力してください');
            return;
        }

        try {
            window.seatStore.importPreset(presetData);
            this.loadCurrentSettings();
            setTimeout(() => this.seatMapViewer.resetView(), 100);
            this.showMessage('プリセットを読み込みました');
        } catch (error) {
            this.showError('読み込みに失敗しました: ' + error.message);
        }
    }

    toggleEditMode() {
        this.editMode = !this.editMode;
        this.seatMapViewer.setEditMode(this.editMode);
        this.elements.editModeBtn.textContent = this.editMode ? 
            '編集モード ON' : '編集モード OFF';
        this.elements.editModeBtn.classList.toggle('active', this.editMode);
    }

    savePreset() {
        // localStorage保存は自動で行われているが、明示的に保存処理
        window.seatStore.saveToLocalStorage();
        this.showMessage('設定を保存しました');
    }

    resetSeats() {
        if (confirm('すべての座席使用状況をリセットします。よろしいですか？')) {
            window.seatStore.resetSeats();
            this.showMessage('座席をリセットしました');
        }
    }

    showMessage(message) {
        // 簡易メッセージ表示
        const messageEl = document.createElement('div');
        messageEl.className = 'admin-message success';
        messageEl.textContent = message;
        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.classList.add('show');
        }, 10);

        setTimeout(() => {
            messageEl.classList.remove('show');
            setTimeout(() => messageEl.remove(), 300);
        }, 2000);
    }

    showError(message) {
        const messageEl = document.createElement('div');
        messageEl.className = 'admin-message error';
        messageEl.textContent = message;
        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.classList.add('show');
        }, 10);

        setTimeout(() => {
            messageEl.classList.remove('show');
            setTimeout(() => messageEl.remove(), 300);
        }, 3000);
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
    window.adminApp = new SeatLotteryAdmin();
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
    if (window.adminApp) {
        window.adminApp.destroy();
    }
});