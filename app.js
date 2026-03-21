(function () {
  "use strict";

  // --- State ---
  const colors = []; // { hex, name }
  let grid = [];     // 2D array of color indices

  // --- DOM refs ---
  const rowsInput = document.getElementById("rows");
  const colsInput = document.getElementById("cols");
  const colorListEl = document.getElementById("color-list");
  const newColorInput = document.getElementById("new-color");
  const colorPreview = document.getElementById("color-preview");
  const newColorName = document.getElementById("new-color-name");
  const addColorBtn = document.getElementById("add-color-btn");
  const generateBtn = document.getElementById("generate-btn");
  const gridEl = document.getElementById("quilt-grid");
  const legendEl = document.getElementById("legend");
  const warningsEl = document.getElementById("warnings");
  const paletteEl = document.getElementById("palette");

  // --- Color management ---
  function renderColorList() {
    colorListEl.innerHTML = "";
    colors.forEach((c, i) => {
      const row = document.createElement("div");
      row.className = "color-entry";
      row.innerHTML =
        `<div class="swatch" style="background:${c.hex}"></div>` +
        `<span class="name">${c.name || c.hex}</span>` +
        `<button data-idx="${i}" title="Remove">&times;</button>`;
      colorListEl.appendChild(row);
    });
  }

  function addColor(overrideHex) {
    const hex = overrideHex || newColorInput.value;
    const name = newColorName.value.trim() || hex;
    colors.push({ hex, name });
    newColorName.value = "";
    updatePreview(hex);
    renderColorList();
  }

  function updatePreview(hex) {
    colorPreview.style.background = hex;
    newColorInput.value = hex;
  }

  function removeColor(idx) {
    colors.splice(idx, 1);
    renderColorList();
  }

  colorListEl.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" && e.target.dataset.idx !== undefined) {
      removeColor(Number(e.target.dataset.idx));
    }
  });

  addColorBtn.addEventListener("click", () => addColor());
  newColorName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addColor();
  });

  // Tapping the preview swatch opens the native color picker
  colorPreview.addEventListener("click", () => {
    newColorInput.click();
  });

  // Sync: when the native picker changes, update preview swatch
  newColorInput.addEventListener("input", () => {
    colorPreview.style.background = newColorInput.value;
  });

  // --- Quick-pick palette ---
  const PALETTE = [
    "#e74c3c", "#e91e63", "#e67e22", "#f1c40f", "#f9e79f",
    "#2ecc71", "#1abc9c", "#3498db", "#9b59b6", "#795548",
    "#607d8b", "#ecf0f1", "#bdc3c7", "#34495e", "#2c3e50",
    "#ff6f61", "#6b5b95", "#88b04b", "#f7cac9", "#92a8d1",
  ];

  PALETTE.forEach((hex) => {
    const swatch = document.createElement("div");
    swatch.className = "palette-swatch";
    swatch.style.background = hex;
    swatch.setAttribute("role", "button");
    swatch.setAttribute("aria-label", "Add color " + hex);
    swatch.addEventListener("click", () => addColor(hex));
    paletteEl.appendChild(swatch);
  });

  // --- Generation ---
  generateBtn.addEventListener("click", generate);

  function generate() {
    const rows = parseInt(rowsInput.value, 10) || 1;
    const cols = parseInt(colsInput.value, 10) || 1;
    const total = rows * cols;
    const n = colors.length;

    if (n === 0) {
      warningsEl.textContent = "Add at least one color.";
      return;
    }

    // Build balanced flat array
    const flat = buildBalancedArray(total, n);

    // Shuffle
    fisherYatesShuffle(flat);

    // Map to 2D grid
    grid = [];
    for (let r = 0; r < rows; r++) {
      grid.push(flat.slice(r * cols, r * cols + cols));
    }

    // Swap-optimise to reduce adjacent same-color neighbours
    optimiseGrid(grid, rows, cols);

    // Show warnings
    if (total % n !== 0) {
      const base = Math.floor(total / n);
      const extra = total % n;
      warningsEl.textContent =
        `${total} cells / ${n} colors doesn\u2019t divide evenly. ` +
        `${n - extra} color(s) used ${base}x, ${extra} color(s) used ${base + 1}x.`;
    } else {
      warningsEl.textContent = "";
    }

    renderGrid(grid, rows, cols);
    renderLegend(flat, n);
  }

  /** Returns a flat array of color indices with balanced counts. */
  function buildBalancedArray(total, numColors) {
    const base = Math.floor(total / numColors);
    const extra = total % numColors;
    const arr = [];
    for (let c = 0; c < numColors; c++) {
      const count = base + (c < extra ? 1 : 0);
      for (let j = 0; j < count; j++) arr.push(c);
    }
    return arr;
  }

  function fisherYatesShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  /**
   * Swap-based optimisation: repeatedly try to reduce
   * the number of adjacent same-color pairs.
   */
  function optimiseGrid(g, rows, cols) {
    const maxPasses = 200;
    for (let pass = 0; pass < maxPasses; pass++) {
      let improved = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (adjacentConflicts(g, r, c, rows, cols) === 0) continue;
          // Try swapping with a random other cell
          const tr = Math.floor(Math.random() * rows);
          const tc = Math.floor(Math.random() * cols);
          if (tr === r && tc === c) continue;
          if (g[r][c] === g[tr][tc]) continue;

          const before =
            adjacentConflicts(g, r, c, rows, cols) +
            adjacentConflicts(g, tr, tc, rows, cols);

          // Swap
          [g[r][c], g[tr][tc]] = [g[tr][tc], g[r][c]];

          const after =
            adjacentConflicts(g, r, c, rows, cols) +
            adjacentConflicts(g, tr, tc, rows, cols);

          if (after < before) {
            improved = true;
          } else {
            // Undo
            [g[r][c], g[tr][tc]] = [g[tr][tc], g[r][c]];
          }
        }
      }
      if (!improved) break;
    }
  }

  /** Count how many direct neighbours share the same color. */
  function adjacentConflicts(g, r, c, rows, cols) {
    const v = g[r][c];
    let count = 0;
    if (r > 0 && g[r - 1][c] === v) count++;
    if (r < rows - 1 && g[r + 1][c] === v) count++;
    if (c > 0 && g[r][c - 1] === v) count++;
    if (c < cols - 1 && g[r][c + 1] === v) count++;
    return count;
  }

  // --- Rendering ---
  function renderGrid(g, rows, cols) {
    // Compute cell size: fit within ~600px but at least 16px
    const maxDim = Math.max(rows, cols);
    const cellSize = Math.max(16, Math.min(48, Math.floor(600 / maxDim)));

    gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    gridEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    gridEl.innerHTML = "";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.background = colors[g[r][c]].hex;
        cell.title = colors[g[r][c]].name;
        gridEl.appendChild(cell);
      }
    }
  }

  function renderLegend(flat, numColors) {
    // Count occurrences
    const counts = new Array(numColors).fill(0);
    flat.forEach((ci) => counts[ci]++);

    legendEl.innerHTML = "";
    colors.forEach((c, i) => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML =
        `<div class="swatch" style="background:${c.hex}"></div>` +
        `<span>${c.name} &times; ${counts[i]}</span>`;
      legendEl.appendChild(item);
    });
  }

  // --- Helpers ---
  function randomHex() {
    return (
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0")
    );
  }

  // Seed default colours
  [
    { hex: "#e74c3c", name: "Red" },
    { hex: "#3498db", name: "Blue" },
    { hex: "#2ecc71", name: "Green" },
    { hex: "#f1c40f", name: "Yellow" },
    { hex: "#9b59b6", name: "Purple" },
    { hex: "#e67e22", name: "Orange" },
    { hex: "#1abc9c", name: "Teal" },
    { hex: "#e91e63", name: "Pink" },
    { hex: "#795548", name: "Brown" },
    { hex: "#607d8b", name: "Slate" },
  ].forEach((c) => colors.push(c));
  renderColorList();
  updatePreview("#e66465");
})();
