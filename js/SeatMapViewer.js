class SeatMapViewer {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.options = {
            readonly: false,
            showNumbers: true,
            cellSize: 40,
            padding: 10,
            ...options
        };

        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.editMode = false;

        this.colors = {
            seat: '#e8f5e8',
            seatUsed: '#ffcccb',
            seatHighlight: '#ffd700',
            aisle: '#f0f0f0',
            block: '#cccccc',
            border: '#666',
            text: '#333'
        };

        this.blinkAnimation = {
            isBlinking: false,
            blinkSeats: [],
            startTime: 0,
            duration: 3000 // 3秒間点滅
        };

        this.setupEventListeners();
        this.unsubscribe = window.seatStore.subscribe((state) => this.render(state));
        this.render(window.seatStore.getState());
    }

    setupEventListeners() {
        // マウスイベント
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

        // タッチイベント（タブレット対応）
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e));

        // リサイズ対応
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * devicePixelRatio;
        this.canvas.height = rect.height * devicePixelRatio;
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.render(window.seatStore.getState());
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!this.options.readonly && this.editMode) {
            const cellPos = this.getCellFromPosition(x, y);
            if (cellPos) {
                this.toggleCell(cellPos.row, cellPos.col);
            }
        }

        this.isDragging = true;
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    onMouseMove(e) {
        if (!this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!this.options.readonly && this.editMode) {
            const cellPos = this.getCellFromPosition(x, y);
            if (cellPos && (x !== this.lastMouseX || y !== this.lastMouseY)) {
                this.toggleCell(cellPos.row, cellPos.col);
            }
        } else {
            // パン操作
            const deltaX = x - this.lastMouseX;
            const deltaY = y - this.lastMouseY;
            this.offsetX += deltaX;
            this.offsetY += deltaY;
            this.render(window.seatStore.getState());
        }

        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    onMouseUp(e) {
        this.isDragging = false;
    }

    onWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(this.scale * scaleFactor, 0.3), 3);

        // ズーム中心点の調整
        const scaleRatio = newScale / this.scale;
        this.offsetX = x - (x - this.offsetX) * scaleRatio;
        this.offsetY = y - (y - this.offsetY) * scaleRatio;
        this.scale = newScale;

        this.render(window.seatStore.getState());
    }

    // タッチイベント（簡易実装）
    onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        }
    }

    onTouchEnd(e) {
        e.preventDefault();
        this.onMouseUp(e);
    }

    getCellFromPosition(x, y) {
        const state = window.seatStore.getState();
        const { rows, cols } = state.layout;
        const cellSize = this.options.cellSize * this.scale;

        const gridX = (x - this.offsetX - this.options.padding * this.scale) / cellSize;
        const gridY = (y - this.offsetY - this.options.padding * this.scale) / cellSize;

        const col = Math.floor(gridX);
        const row = Math.floor(gridY);

        if (row >= 0 && row < rows && col >= 0 && col < cols) {
            return { row, col };
        }
        return null;
    }

    toggleCell(row, col) {
        const state = window.seatStore.getState();
        const currentType = state.layout.cells[row][col];
        const types = ['seat', 'aisle', 'block'];
        const nextIndex = (types.indexOf(currentType) + 1) % types.length;
        window.seatStore.setCellType(row, col, types[nextIndex]);
    }

    render(state) {
        const { layout, seatState } = state;
        const { rows, cols, cells } = layout;
        const { used, lastDrawn } = seatState;

        // キャンバスクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 変換行列設定
        this.ctx.save();
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(this.offsetX / this.scale, this.offsetY / this.scale);

        const cellSize = this.options.cellSize;
        const padding = this.options.padding;

        // 座席描画
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const cellType = cells[row] ? cells[row][col] : 'seat';
                const seatKey = `${row}-${col}`;
                
                const x = padding + col * cellSize;
                const y = padding + row * cellSize;

                // セルの色決定
                let fillColor = this.colors[cellType];
                if (cellType === 'seat') {
                    if (used.has(seatKey)) {
                        fillColor = this.colors.seatUsed;
                    } else if (lastDrawn.some(seat => seat.key === seatKey)) {
                        // 点滅アニメーション中の色制御
                        if (this.blinkAnimation.isBlinking) {
                            const elapsed = Date.now() - this.blinkAnimation.startTime;
                            const blinkPhase = Math.floor(elapsed / 250) % 2; // 250ms周期
                            fillColor = blinkPhase === 0 ? '#ffd700' : '#ff6b6b'; // 黄色⇔赤色
                        } else {
                            fillColor = this.colors.seatHighlight;
                        }
                    }
                }

                // セル描画
                this.ctx.fillStyle = fillColor;
                this.ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
                this.ctx.strokeStyle = this.colors.border;
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);

                // 座席番号表示
                if (this.options.showNumbers && cellType === 'seat') {
                    const seatNumber = window.seatStore.generateSeatNumber(row, col);
                    this.ctx.fillStyle = this.colors.text;
                    this.ctx.font = `${Math.max(10, cellSize * 0.3)}px Arial`;
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(
                        seatNumber, 
                        x + (cellSize - 2) / 2, 
                        y + (cellSize - 2) / 2
                    );
                }
            }
        }

        // ステージ表示
        this.renderStage(state, padding, cellSize);

        this.ctx.restore();
    }

    renderStage(state, padding, cellSize) {
        const { layout } = state;
        const { rows, cols, numbering } = layout;
        const { stagePosition } = numbering;

        this.ctx.fillStyle = '#444';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';

        const totalWidth = cols * cellSize;
        const totalHeight = rows * cellSize;

        switch (stagePosition) {
            case 'top':
                this.ctx.fillRect(padding, padding - 30, totalWidth, 25);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText('STAGE', padding + totalWidth / 2, padding - 15);
                break;
            case 'bottom':
                this.ctx.fillRect(padding, padding + totalHeight + 5, totalWidth, 25);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText('STAGE', padding + totalWidth / 2, padding + totalHeight + 18);
                break;
            case 'left':
                this.ctx.save();
                this.ctx.translate(padding - 15, padding + totalHeight / 2);
                this.ctx.rotate(-Math.PI / 2);
                this.ctx.fillRect(-50, -12, 100, 25);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText('STAGE', 0, 2);
                this.ctx.restore();
                break;
            case 'right':
                this.ctx.save();
                this.ctx.translate(padding + totalWidth + 15, padding + totalHeight / 2);
                this.ctx.rotate(Math.PI / 2);
                this.ctx.fillRect(-50, -12, 100, 25);
                this.ctx.fillStyle = '#fff';
                this.ctx.fillText('STAGE', 0, 2);
                this.ctx.restore();
                break;
        }
    }

    // 編集モード切り替え
    setEditMode(enabled) {
        this.editMode = enabled;
        this.canvas.style.cursor = enabled ? 'crosshair' : 'grab';
    }

    // ズーム/パンリセット（中央上揃え）
    resetView() {
        const state = window.seatStore.getState();
        const { rows, cols } = state.layout;
        
        const canvasRect = this.canvas.getBoundingClientRect();
        const totalWidth = cols * this.options.cellSize + this.options.padding * 2;
        const totalHeight = rows * this.options.cellSize + this.options.padding * 2;
        
        this.scale = 1;
        this.offsetX = (canvasRect.width - totalWidth) / 2; // 中央揃え
        this.offsetY = this.options.padding; // 上揃え
        
        this.render(state);
    }

    // フィット表示
    fitToView() {
        const state = window.seatStore.getState();
        const { rows, cols } = state.layout;
        
        const canvasRect = this.canvas.getBoundingClientRect();
        const totalWidth = cols * this.options.cellSize + this.options.padding * 2;
        const totalHeight = rows * this.options.cellSize + this.options.padding * 2;
        
        const scaleX = canvasRect.width / totalWidth;
        const scaleY = canvasRect.height / totalHeight;
        this.scale = Math.min(scaleX, scaleY, 1) * 0.9;
        
        this.offsetX = (canvasRect.width - totalWidth * this.scale) / 2;
        this.offsetY = (canvasRect.height - totalHeight * this.scale) / 2;
        
        this.render(state);
    }

    // 点滅アニメーション開始
    startBlinking(seats) {
        this.blinkAnimation.isBlinking = true;
        this.blinkAnimation.blinkSeats = seats;
        this.blinkAnimation.startTime = Date.now();
        
        const animate = () => {
            if (!this.blinkAnimation.isBlinking) return;
            
            const elapsed = Date.now() - this.blinkAnimation.startTime;
            if (elapsed > this.blinkAnimation.duration) {
                this.blinkAnimation.isBlinking = false;
                this.render(window.seatStore.getState());
                return;
            }
            
            this.render(window.seatStore.getState());
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }

    destroy() {
        this.blinkAnimation.isBlinking = false;
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}