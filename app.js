class LightRoulette {
    constructor() {
        // DOM Elements
        this.namesInput = document.getElementById('namesInput');
        this.updateBtn = document.getElementById('updateGridBtn');
        this.gridContainer = document.getElementById('gridContainer');
        this.goBtn = document.getElementById('goBtn');
        this.winnerOverlay = document.getElementById('winnerOverlay');
        this.winnerName = document.getElementById('winnerName');
        this.resetBtn = document.getElementById('resetBtn');
        
        // Theme Elements
        this.themeBtns = document.querySelectorAll('.theme-btn');
        this.customColorWrapper = document.getElementById('customColorWrapper');
        this.colorPicker = document.getElementById('colorPicker');

        // State
        this.names = [];
        this.cells = []; // Array of DOM elements
        this.gridSize = { rows: 0, cols: 0 };
        this.currentIdx = 0; // Where the light head is
        this.trail = []; // Array of indices [current, prev1, prev2...]
        this.isRunning = false;
        this.animationId = null;
        this.currentTheme = 'rainbow'; // rainbow, shuffle, custom
        
        // Configuration
        this.trailLength = 4; // Length of the comet tail
        this.minRunTime = 2000; // Run at max speed for at least 2s
        this.slowDownDuration = 4000; // Slow down over 4s
        
        // Audio (Web Audio API for beat detection)
        this.audioContext = null;
        this.analyser = null;
        this.audioBuffer = null;
        this.audioSource = null;
        this.audioLoaded = false;
        this.loadAudio();
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.parseNames();
        this.buildGrid();
        this.applyTheme('rainbow'); // Default
    }

    async loadAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.3;
            
            const response = await fetch('Randomizer-back.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.audioLoaded = true;
            console.log('Audio loaded successfully');
        } catch (e) {
            console.error('Failed to load audio:', e);
        }
    }

    bindEvents() {
        // Theme button events
        this.themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                this.applyTheme(theme);
                this.themeBtns.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-pressed', 'true');
            });
        });

        this.colorPicker.addEventListener('input', (e) => {
            this.setCustomColor(e.target.value);
        });

        this.updateBtn.addEventListener('click', () => {
            this.parseNames();
            this.buildGrid();
        });

        this.goBtn.addEventListener('click', () => {
            if (!this.isRunning) this.startRoulette();
        });

        this.resetBtn.addEventListener('click', () => {
            this.resetGame();
        });

        // Mobile panel toggle
        const panelToggle = document.getElementById('panelToggle');
        const controlsPanel = document.getElementById('controlsPanel');
        const panelHeader = document.getElementById('panelHeader');
        
        if (panelToggle && controlsPanel) {
            const togglePanel = () => {
                const isExpanded = controlsPanel.classList.toggle('expanded');
                panelToggle.setAttribute('aria-expanded', isExpanded);
            };
            panelToggle.addEventListener('click', togglePanel);
            panelHeader.addEventListener('click', (e) => {
                if (e.target !== panelToggle && !panelToggle.contains(e.target)) {
                    togglePanel();
                }
            });
        }
    }

    parseNames() {
        const raw = this.namesInput.value;
        this.names = raw.split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 0);
    }

    calculateGridDimensions(count) {
        const sqrt = Math.sqrt(count);
        let cols = Math.ceil(sqrt);
        if (count === 3) cols = 2; 
        let rows = Math.ceil(count / cols);
        return { rows, cols };
    }

    buildGrid() {
        this.gridContainer.innerHTML = '';
        this.cells = [];
        const count = this.names.length;
        if (count === 0) return;

        const { rows, cols } = this.calculateGridDimensions(count);
        this.gridSize = { rows, cols };

        this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        this.gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

        for (let i = 0; i < count; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.textContent = this.names[i];
            cell.dataset.index = i;
            
            this.gridContainer.appendChild(cell);
            this.cells.push(cell);
        }
        
        if (count % cols !== 0) {
            const lastCell = this.cells[count - 1];
            const emptySpots = (rows * cols) - count;
            if (emptySpots > 0) {
                lastCell.style.gridColumn = `span ${emptySpots + 1}`;
            }
        }

        this.currentIdx = Math.floor(Math.random() * this.cells.length);
        this.updateVisuals();
    }

    getNeighbors(index) {
        const { rows, cols } = this.gridSize;
        const r = Math.floor(index / cols);
        const c = index % cols;
        const neighbors = [];
        const count = this.cells.length;

        const tryAdd = (idx) => {
            if (idx >= 0 && idx < count) {
                neighbors.push(idx);
            }
        };

        if (r > 0) tryAdd((r - 1) * cols + c); // Up
        if (r < rows - 1) tryAdd((r + 1) * cols + c); // Down
        if (c > 0) tryAdd(r * cols + (c - 1)); // Left
        if (c < cols - 1) tryAdd(r * cols + (c + 1)); // Right

        if (r > 0 && c > 0) tryAdd((r - 1) * cols + (c - 1));
        if (r > 0 && c < cols - 1) tryAdd((r - 1) * cols + (c + 1));
        if (r < rows - 1 && c > 0) tryAdd((r + 1) * cols + (c - 1));
        if (r < rows - 1 && c < cols - 1) tryAdd((r + 1) * cols + (c + 1));

        return neighbors;
    }

    moveLight() {
        const neighbors = this.getNeighbors(this.currentIdx);
        
        if (!this.visitHistory) {
            this.visitHistory = new Map();
        }
        
        const now = Date.now();
        this.visitHistory.set(this.currentIdx, now);

        let totalWeight = 0;
        const weights = neighbors.map(n => {
            const lastVisit = this.visitHistory.get(n) || 0;
            const timeSince = now - lastVisit;
            const weight = Math.pow(timeSince + 100, 2) * (0.9 + Math.random() * 0.2); 
            totalWeight += weight;
            return { index: n, weight };
        });

        let random = Math.random() * totalWeight;
        let next = neighbors[0];
        
        for (const w of weights) {
            random -= w.weight;
            if (random <= 0) {
                next = w.index;
                break;
            }
        }
        
        this.trail.unshift(this.currentIdx);
        if (this.trail.length > this.trailLength) {
            this.trail.pop();
        }
        
        this.currentIdx = next;
        this.updateVisuals();
    }

    updateVisuals() {
        this.cells.forEach(c => {
            c.classList.remove('head', 'trail-1', 'trail-2', 'trail-3');
            c.style.animationDelay = '';
        });

        if (this.cells[this.currentIdx]) {
            const head = this.cells[this.currentIdx];
            head.classList.add('head');
            if (this.currentTheme === 'rainbow') {
                head.style.animationDelay = `-${Math.random() * 10}s`;
            }
        }

        this.trail.forEach((idx, i) => {
            if (this.cells[idx]) {
                if (i < 3) this.cells[idx].classList.add(`trail-${i + 1}`);
            }
        });
    }

    async startRoulette() {
        if (!this.audioLoaded) {
            console.log('Audio not loaded yet, retrying...');
            setTimeout(() => this.startRoulette(), 100);
            return;
        }
        
        if (this.isRunning) return;
        this.isRunning = true;
        
        // Hide button with scale animation
        this.goBtn.style.transform = 'scale(0)';

        // Start audio - MUST await resume on iOS Safari
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        if (this.audioSource) {
            try { this.audioSource.stop(); } catch(e) {}
        }
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);
        this.audioSource.start(0);
        
        // Start game logic immediately
        this.runGameLogic();
    }

    runGameLogic() {
        // Reset visit tracking for this "spin"
        this.visitHistory = new Map();
        
        // Beat detection state
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        let lastBeatTime = 0;
        let lastMoveTime = 0;
        const beatCooldown = 60; 
        let energyHistory = [];
        const historySize = 20;
        let startTime = Date.now();
        let slowingDown = false;
        let slowdownStartTime = 0;

        const detectBeat = () => {
            if (!this.isRunning) return;
            
            this.analyser.getByteFrequencyData(dataArray);
            
            // Focus on bass frequencies (first 10 bins)
            let bassEnergy = 0;
            for (let i = 0; i < 10; i++) {
                bassEnergy += dataArray[i];
            }
            bassEnergy /= 10;
            
            // Calculate average energy
            energyHistory.push(bassEnergy);
            if (energyHistory.length > historySize) energyHistory.shift();
            const avgEnergy = energyHistory.reduce((a, b) => a + b, 0) / energyHistory.length;
            
            const now = Date.now();
            const elapsed = now - startTime;
            const timeSinceLastMove = now - lastMoveTime;
            
            // Dynamic threshold and max interval based on phase
            let threshold = 1.15;
            let maxInterval = 100;
            
            if (slowingDown) {
                const slowElapsed = now - slowdownStartTime;
                const progress = slowElapsed / this.slowDownDuration;
                
                if (progress >= 1) {
                    this.finish();
                    return;
                }
                
                threshold = 1.15 + (progress * 1.5);
                maxInterval = 100 + (progress * 900);
            }
            
            const isBeat = bassEnergy > avgEnergy * threshold && (now - lastBeatTime) > beatCooldown;
            const needsFallback = timeSinceLastMove > maxInterval;
            
            if (isBeat || needsFallback) {
                if (isBeat) lastBeatTime = now;
                lastMoveTime = now;
                this.moveLight();
                
                if (!slowingDown) {
                    const allVisited = this.visitHistory.size === this.cells.length;
                    if (elapsed > this.minRunTime && allVisited) {
                        slowingDown = true;
                        slowdownStartTime = now;
                    }
                }
            }
            
            requestAnimationFrame(detectBeat);
        };
        
        lastMoveTime = Date.now();
        detectBeat();
    }

    finish() {
        this.isRunning = false;
        const winnerName = this.cells[this.currentIdx].textContent;
        this.showWinner(winnerName);
    }

    showWinner(name) {
        this.winnerName.textContent = name;
        this.winnerOverlay.classList.add('visible');
        this.triggerHappyEmojis();
    }

    triggerHappyEmojis() {
        const emojis = ['😁', '🎉', '🥳', '👏', '👯', '🌟', '✨', '🤩', '🎈', '🎊'];
        const container = document.body;
        
        for (let i = 0; i < 50; i++) {
            const el = document.createElement('div');
            el.className = 'floating-emoji';
            el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            el.style.left = Math.random() * 100 + 'vw';
            el.style.animationDuration = (2 + Math.random() * 3) + 's';
            el.style.fontSize = (1.5 + Math.random() * 2.5) + 'rem';
            container.appendChild(el);
            setTimeout(() => el.remove(), 5000);
        }
    }

    resetGame() {
        this.isRunning = false;

        document.querySelectorAll('.shockwave-overlay').forEach(el => el.remove());
        
        if (this.audioSource) {
            try { this.audioSource.stop(); } catch(e) {}
            this.audioSource = null;
        }
        
        this.winnerOverlay.classList.remove('visible');
        this.goBtn.style.transform = 'scale(1)';
        this.trail = [];
        this.updateVisuals();
    }

    applyTheme(mode) {
        this.currentTheme = mode;
        const body = document.body;

        // Reset UI
        this.customColorWrapper.classList.remove('visible');
        body.classList.remove('rainbow-mode', 'floor-mode');
        
        if (mode === 'rainbow') {
            // Rainbow is pure CSS - just add the class
            body.classList.add('rainbow-mode');
        } else if (mode === 'shuffle') {
            // True 16M color randomness: random R, G, B channels
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            this.setCSSVars(hex);
        } else if (mode === 'custom') {
            this.customColorWrapper.classList.add('visible');
            this.setCustomColor(this.colorPicker.value);
        } else if (mode === 'floor') {
            // The Floor theme - tribute to Fox game show
            body.classList.add('floor-mode');
        }
    }
    setCustomColor(hex) {
        this.setCSSVars(hex);
    }

    setCSSVars(color) {
        const root = document.documentElement;
        root.style.setProperty('--light-color', color);
        // Calculate transparent version for tail
        // If hex, convert to rgba. If hsl, stick to string manipulations or just use opacity var
        // Simple hack: We use the hex/color and assume CSS can handle opacity via helper or just same color?
        // My CSS uses --light-tail. 
        // Let's force a standard conversion if possible, or just set it to the same color with opacity 0.4 if browser supports it.
        // Actually best way: use color-mix if supported or just hex alpha.
        // For simplicity with standard inputs:
        root.style.setProperty('--light-tail', `color-mix(in srgb, ${color}, transparent 60%)`); 
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    new LightRoulette();
});
