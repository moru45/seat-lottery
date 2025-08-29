class SeatLotteryStore {
    constructor() {
        this.listeners = [];
        this.initializeState();
        this.loadFromLocalStorage();
    }

    // 初期状態
    initializeState() {
        this.state = {
            layout: {
                rows: 10,
                cols: 10,
                cells: [], // 'seat', 'aisle', 'block'
                numbering: {
                    type: 'row-major', // 'row-major', 'snake', 'col-major'
                    rowLabels: 'A', // 'A', '1', 'あ'
                    zeroPad: 2,
                    stagePosition: 'top' // 'top', 'bottom', 'left', 'right'
                }
            },
            seatState: {
                used: new Set(),
                remaining: new Set(),
                startedAt: null,
                lastDrawn: []
            },
            settings: {
                maxGroup: 4,
                strictConsecutive: false, // 厳密連番モード
                pinLock: null // 4桁PIN
            }
        };
        this.initializeCells();
        this.updateRemaining();
    }

    // セル初期化
    initializeCells() {
        const { rows, cols } = this.state.layout;
        this.state.layout.cells = Array(rows).fill(null).map(() => 
            Array(cols).fill('seat')
        );
    }

    // 残席更新
    updateRemaining() {
        const { rows, cols, cells } = this.state.layout;
        const remaining = new Set();
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (cells[row] && cells[row][col] === 'seat') {
                    const seatKey = `${row}-${col}`;
                    if (!this.state.seatState.used.has(seatKey)) {
                        remaining.add(seatKey);
                    }
                }
            }
        }
        
        this.state.seatState.remaining = remaining;
        this.notify();
    }

    // 座席番号生成
    generateSeatNumber(row, col) {
        const { numbering } = this.state.layout;
        const { type, rowLabels, zeroPad, stagePosition } = numbering;

        let rowLabel, colNum;
        
        // ステージ位置から前方向を判定
        const rowIndexFromFront = this.getRowIndexFromFront(row, stagePosition);
        
        // 行ラベル生成
        if (rowLabels === 'A') {
            rowLabel = String.fromCharCode(65 + rowIndexFromFront); // A, B, C...
        } else if (rowLabels === '1') {
            rowLabel = String(rowIndexFromFront + 1); // 1, 2, 3...
        } else if (rowLabels === 'あ') {
            rowLabel = String.fromCharCode(12354 + rowIndexFromFront); // あ, い, う...
        }

        // 番号付けタイプ別の列番号計算
        switch (type) {
            case 'row-major':
                colNum = col + 1;
                break;
            case 'snake':
                colNum = row % 2 === 0 ? col + 1 : this.state.layout.cols - col;
                break;
            case 'col-major':
                colNum = row + 1;
                [rowLabel, colNum] = [String(col + 1), rowLabel];
                break;
        }

        const paddedNum = String(colNum).padStart(zeroPad, '0');
        return `${rowLabel}${paddedNum}`;
    }


    // ステージ位置から前方向を判定
    getRowIndexFromFront(row, stagePosition) {
        const { rows } = this.state.layout;
        
        switch (stagePosition) {
            case 'top':
                return row; // 上がステージ = 0行目が前
            case 'bottom':
                return rows - 1 - row; // 下がステージ = 最下行が前
            case 'left':
                return row; // 左がステージ = 0行目が前（便宜上）
            case 'right':
                return row; // 右がステージ = 0行目が前（便宜上）
            default:
                return row;
        }
    }

    // 抽選実行
    async drawSeats(groupSize) {
        if (groupSize > this.state.seatState.remaining.size) {
            throw new Error('残席不足');
        }

        this.state.seatState.startedAt = this.state.seatState.startedAt || new Date().toISOString();
        
        // 連番探索
        const consecutive = this.findConsecutiveSeats(groupSize);
        if (consecutive.length > 0) {
            const selected = consecutive[Math.floor(Math.random() * consecutive.length)];
            return this.reserveSeats(selected);
        }

        // 厳密連番モードで連番がない場合の確認
        if (this.state.settings.strictConsecutive) {
            const confirmed = await this.confirmNearbySeats();
            if (!confirmed) {
                throw new Error('抽選をキャンセルしました');
            }
        }

        // 近接クラスタ探索
        const cluster = this.findBestCluster(groupSize);
        if (cluster.length === 0) {
            throw new Error('適切な座席が見つかりません');
        }

        return this.reserveSeats(cluster);
    }

    // 連番座席探索
    findConsecutiveSeats(groupSize) {
        const { rows, cols } = this.state.layout;
        const candidates = [];

        for (let row = 0; row < rows; row++) {
            for (let startCol = 0; startCol <= cols - groupSize; startCol++) {
                const seats = [];
                let valid = true;

                for (let i = 0; i < groupSize; i++) {
                    const col = startCol + i;
                    const seatKey = `${row}-${col}`;
                    
                    if (!this.state.seatState.remaining.has(seatKey) || 
                        this.state.layout.cells[row][col] !== 'seat') {
                        valid = false;
                        break;
                    }
                    seats.push({ row, col, key: seatKey });
                }

                if (valid) {
                    candidates.push(seats);
                }
            }
        }

        return candidates;
    }

    // 最適クラスタ探索（マンハッタン距離最小）
    findBestCluster(groupSize) {
        const available = Array.from(this.state.seatState.remaining).map(key => {
            const [row, col] = key.split('-').map(Number);
            return { row, col, key };
        });

        if (available.length < groupSize) return [];

        let bestCluster = [];
        let minDistance = Infinity;

        // 全組み合わせを試す（小さいグループサイズを想定）
        const combinations = this.getCombinations(available, groupSize);
        
        for (const combo of combinations) {
            const distance = this.calculateTotalDistance(combo);
            if (distance < minDistance || (distance === minDistance && Math.random() < 0.5)) {
                minDistance = distance;
                bestCluster = combo;
            }
        }

        return bestCluster;
    }

    // 組み合わせ生成
    getCombinations(arr, size) {
        if (size > arr.length || size <= 0) return [];
        if (size === arr.length) return [arr];
        if (size === 1) return arr.map(el => [el]);

        const combinations = [];
        for (let i = 0; i < arr.length - size + 1; i++) {
            const head = arr[i];
            const tailCombos = this.getCombinations(arr.slice(i + 1), size - 1);
            for (const tailCombo of tailCombos) {
                combinations.push([head, ...tailCombo]);
            }
        }
        return combinations;
    }

    // マンハッタン距離の総和計算
    calculateTotalDistance(seats) {
        let total = 0;
        for (let i = 0; i < seats.length; i++) {
            for (let j = i + 1; j < seats.length; j++) {
                const seat1 = seats[i];
                const seat2 = seats[j];
                total += Math.abs(seat1.row - seat2.row) + Math.abs(seat1.col - seat2.col);
            }
        }
        return total;
    }

    // 近接座席確認ダイアログ
    async confirmNearbySeats() {
        return new Promise((resolve) => {
            const result = confirm('連番の席が空いていません。\n近くの席でもよろしいですか？');
            resolve(result);
        });
    }

    // 座席予約
    reserveSeats(seats) {
        const seatNumbers = [];
        
        for (const seat of seats) {
            this.state.seatState.used.add(seat.key);
            this.state.seatState.remaining.delete(seat.key);
            seatNumbers.push({
                key: seat.key,
                number: this.generateSeatNumber(seat.row, seat.col),
                row: seat.row,
                col: seat.col
            });
        }

        this.state.seatState.lastDrawn = seatNumbers;
        this.saveToLocalStorage();
        this.notify();
        
        return seatNumbers;
    }

    // 状態更新メソッド
    updateLayout(layout) {
        this.state.layout = { ...this.state.layout, ...layout };
        this.updateRemaining();
        this.saveToLocalStorage();
    }

    updateSettings(settings) {
        this.state.settings = { ...this.state.settings, ...settings };
        this.saveToLocalStorage();
        this.notify();
    }

    setCellType(row, col, type) {
        if (!this.state.layout.cells[row]) return;
        this.state.layout.cells[row][col] = type;
        this.updateRemaining();
        this.saveToLocalStorage();
    }

    resetSeats() {
        this.state.seatState.used.clear();
        this.state.seatState.lastDrawn = [];
        this.state.seatState.startedAt = null;
        this.updateRemaining();
        this.saveToLocalStorage();
    }

    // localStorage保存/復元
    saveToLocalStorage() {
        const saveState = {
            ...this.state,
            seatState: {
                ...this.state.seatState,
                used: Array.from(this.state.seatState.used),
                remaining: Array.from(this.state.seatState.remaining)
            }
        };
        localStorage.setItem('seat-lottery', JSON.stringify(saveState));
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem('seat-lottery');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.state = {
                    ...this.state,
                    ...parsed,
                    seatState: {
                        ...parsed.seatState,
                        used: new Set(parsed.seatState.used || []),
                        remaining: new Set(parsed.seatState.remaining || [])
                    }
                };
                this.updateRemaining();
            } catch (e) {
                console.error('Failed to load from localStorage:', e);
            }
        }
    }

    // 購読者管理
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    getState() {
        return this.state;
    }

    // プリセット管理
    exportPreset() {
        return JSON.stringify(this.state, null, 2);
    }

    importPreset(jsonString) {
        try {
            const preset = JSON.parse(jsonString);
            this.state = {
                ...this.state,
                layout: preset.layout,
                settings: preset.settings
            };
            this.resetSeats();
            this.updateRemaining();
            this.saveToLocalStorage();
            this.notify();
        } catch (e) {
            throw new Error('Invalid preset format');
        }
    }
}

// グローバルストアインスタンス
window.seatStore = new SeatLotteryStore();