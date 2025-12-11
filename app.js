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
        
        // Audio
        this.bgMusic = new Audio('Randomizer-back.mp3');
        this.bgMusic.loop = false; // Play once until end
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.parseNames();
        this.buildGrid();
        this.applyTheme('rainbow'); // Default
    }

    bindEvents() {
        // Theme button events
        this.themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                
                // Always apply theme (even if already active - important for Shuffle)
                this.applyTheme(theme);
                
                // Update button states
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
    }

    parseNames() {
        const raw = this.namesInput.value;
        this.names = raw.split('\n')
            .map(n => n.trim())
            .filter(n => n.length > 0);
    }

    calculateGridDimensions(count) {
        // Calculate mostly square grid, but allow flexible row/col count
        const sqrt = Math.sqrt(count);
        let cols = Math.ceil(sqrt);
        // For distinct layouts like 3, force 2 columns to make it 2+1 layout logic later
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
        // Rows usually auto, but we can enforce equal height
        this.gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

        // Fill grid with EXACTLY the number of names
        for (let i = 0; i < count; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            
            // Handle centering the last item if it's dangling
            // E.g. 3 items in 2 cols: Item 3 is at row 2, col 1. 
            // If we want it to span, we can check if it's the last item and we have a gap.
            // But for the "maze" logic, spanning cells might complicate neighbors. 
            // Simple mapping for now: 1 cell = 1 name.
            
            // Special case for 3 items to make it look nice (Pyramid-ish or just centered)
            // If 2 columns, item 2 (0-indexed) is alone on row 2.
            // Let's letting it just be there is fine, or we can center it via CSS grid if desired.
            // For the path logic, we need to know accurate neighbors.
            
            cell.textContent = this.names[i];
            cell.dataset.index = i;
            
            this.gridContainer.appendChild(cell);
            this.cells.push(cell);
        }
        
        // If we have 3 items in 2 cols, the last item leaves a gap. 
        // We can make the last child span 2 cols to fill the gap.
        if (count % cols !== 0) {
            const lastCell = this.cells[count - 1];
            // Calculate how many empty spots
            const emptySpots = (rows * cols) - count;
            // The last item can span 1 + emptySpots
            if (emptySpots > 0) {
                lastCell.style.gridColumn = `span ${emptySpots + 1}`;
            }
        }

        // IMPORTANT: Re-calculate neighbors logic needs to account for this grid structure?
        // Our getNeighbors uses strictly (row, col) coordinates.
        // If an item spans, it technically occupies multiple cells. 
        // For simplicity in "maze runner", we can just treat it as occupying its primary cell index
        // but physically visual connectivity might look weird if we don't update neighbors.
        // Given visual complexity: Let's stick to strict grid cells but maybe center the grid content?
        // Actually, spanning is better for aesthetics. I'll update getNeighbors to handle visual adjacency if needed.
        // "getNeighbors" assumes full grid. If I span, the "maze" logic might get confused if I don't map carefully.
        // Let's keep it simple: No span for now, just let grid be grid. 
        // Or wait - user said "3 names gave 4". That was the main bug. 
        // I removed the duplicate name filling. Now I have 3 cells. 
        // Visuals might show a hole. That's acceptable for "roulette" unless I span.
        // Let's try the span logic, it's prettier. 
        
        // Start visual idle state
        this.currentIdx = Math.floor(Math.random() * this.cells.length);
        this.updateVisuals();
    }

    getNeighbors(index) {
        // This simple logic works well for uniform grids.
        // If we have sparse grids (3 items), we need to ensure we don't return indices >= cells.length
        
        const { rows, cols } = this.gridSize;
        const r = Math.floor(index / cols);
        const c = index % cols;
        const neighbors = [];
        const count = this.cells.length;

        // Orthogonal moves
        const tryAdd = (idx) => {
            if (idx >= 0 && idx < count) {
                neighbors.push(idx);
            }
        };

        if (r > 0) tryAdd((r - 1) * cols + c); // Up
        if (r < rows - 1) tryAdd((r + 1) * cols + c); // Down
        if (c > 0) tryAdd(r * cols + (c - 1)); // Left
        if (c < cols - 1) tryAdd(r * cols + (c + 1)); // Right

        // Diagonal moves (for more erratic "spark" connectivity)
        if (r > 0 && c > 0) tryAdd((r - 1) * cols + (c - 1)); // Top-Left
        if (r > 0 && c < cols - 1) tryAdd((r - 1) * cols + (c + 1)); // Top-Right
        if (r < rows - 1 && c > 0) tryAdd((r + 1) * cols + (c - 1)); // Bottom-Left
        if (r < rows - 1 && c < cols - 1) tryAdd((r + 1) * cols + (c + 1)); // Bottom-Right

        return neighbors;
    }

    moveLight() {
        const neighbors = this.getNeighbors(this.currentIdx);
        
        // "Smart" Random Walk
        // To fix "stuck in corners" or "focusing on one direction", we use a bias 
        // towards "Least Recently Visited" cells. This ensures grid coverage.
        
        // Initialize visit history if not present
        if (!this.visitHistory) {
            this.visitHistory = new Map(); // Index -> Timestamp
        }
        
        const now = Date.now();
        this.visitHistory.set(this.currentIdx, now);

        // Calculate weights
        let totalWeight = 0;
        const weights = neighbors.map(n => {
            const lastVisit = this.visitHistory.get(n) || 0;
            const timeSince = now - lastVisit;
            // Weight increases with time since visit.
            // Power of 2 makes it very hungry for new cells.
            // Add minimal random noise to break ties or perfect loops
            const weight = Math.pow(timeSince + 100, 2) * (0.9 + Math.random() * 0.2); 
            totalWeight += weight;
            return { index: n, weight };
        });

        // Weighted random selection
        let random = Math.random() * totalWeight;
        let next = neighbors[0];
        
        for (const w of weights) {
            random -= w.weight;
            if (random <= 0) {
                next = w.index;
                break;
            }
        }
        
        // Update trail
        this.trail.unshift(this.currentIdx);
        if (this.trail.length > this.trailLength) {
            this.trail.pop();
        }
        
        this.currentIdx = next;
        this.updateVisuals();
    }

    updateVisuals() {
        // Clear old classes and reset animation-delay
        this.cells.forEach(c => {
            c.classList.remove('head', 'trail-1', 'trail-2', 'trail-3');
            c.style.animationDelay = '';
        });

        // Set Head with random animation offset for continuous rainbow feel
        if (this.cells[this.currentIdx]) {
            const head = this.cells[this.currentIdx];
            head.classList.add('head');
            // Random offset into the 10s animation cycle
            if (this.currentTheme === 'rainbow') {
                head.style.animationDelay = `-${Math.random() * 10}s`;
            }
        }

        // Set Trail
        this.trail.forEach((idx, i) => {
            if (this.cells[idx]) {
                // trail-1, trail-2, etc.
                if (i < 3) this.cells[idx].classList.add(`trail-${i + 1}`);
            }
        });
    }

    startRoulette() {
        this.isRunning = true;
        this.goBtn.style.transform = 'scale(0)'; // Hide GO button
        
        // Start Audio
        this.bgMusic.currentTime = 0;
        this.bgMusic.play().catch(e => console.log('Audio play failed:', e));

        // Reset visit tracking for this "spin"
        this.visitHistory = new Map();
        
        let speed = 50; // ms per move (fast!)
        let startTime = Date.now();
        let slowingDown = false;
        let slowdownStartTime = 0;

        const loop = () => {
            if (!this.isRunning) return;

            const now = Date.now();
            const elapsed = now - startTime;

            // Move logic
            this.moveLight();

            // Timing logic
            if (!slowingDown) {
                // Feature update: Ensure "Full Cycle" coverage.
                // Like a real roulette wheel passes every number, we must ensure
                // the light has visited EVERY cell at least once before we even think about stopping.
                const allVisited = this.visitHistory.size === this.cells.length;

                if (elapsed > this.minRunTime && allVisited) {
                    slowingDown = true;
                    slowdownStartTime = now;
                    // Reset opacity or visuals if needed for 'stopping' phase? 
                    // No, existing visual is fine.
                }
                setTimeout(() => requestAnimationFrame(loop), speed);
            } else {
                // Slowdown phase
                const slowElapsed = now - slowdownStartTime;
                const progress = slowElapsed / this.slowDownDuration; // 0 to 1

                if (progress >= 1) {
                    this.finish();
                    return;
                }

                // Easing function: Exponential ease out for interval
                // We want speed (interval) to go from 50ms to ~800ms
                const currentInterval = 50 + (1000 * (1 - Math.pow(1 - progress, 3))); // Cubic ease out-ish
                
                // Wait for the calculated interval
                setTimeout(() => requestAnimationFrame(loop), currentInterval);
            }
        };

        loop();
    }

    finish() {
        this.isRunning = false;
        // Audio continues playing until end
        const winnerName = this.cells[this.currentIdx].textContent;
        this.showWinner(winnerName);
    }

    showWinner(name) {
        this.winnerName.textContent = name;
        this.winnerOverlay.classList.add('visible');
        
        // Optional: Trigger confetti or sound here
    }

    resetGame() {
        // Audio continues playing if still running
        this.winnerOverlay.classList.remove('visible');
        this.goBtn.style.transform = 'scale(1)';
        this.trail = [];
        this.updateVisuals();
        
        // If shuffle mode, maybe shuffle color again on reset? 
        // User didn't explicitly ask to re-shuffle on every reset, but "shuffle" implies it.
        // Let's keep it simple: Shuffle is set when you click the radio. 
        // But re-clicking the radio or a "Shuffle Again" button would be nice. 
        // For now, selecting the radio triggers it.
    }

    applyTheme(mode) {
        this.currentTheme = mode;
        const body = document.body;

        // Reset UI
        this.customColorWrapper.classList.remove('visible');
        body.classList.remove('rainbow-mode');
        
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
