const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const inputStatus = document.getElementById("inputStatus");
const inkCoverageEl = document.getElementById("inkCoverage");
const observationQualityEl = document.getElementById("observationQuality");
const analysisReadyEl = document.getElementById("analysisReady");
const neuralLinkEl = document.getElementById("neuralLink");
const scannerHintEl = document.getElementById("scannerHint");

const threatCardEl = document.getElementById("threat-card");
const threatLevelEl = document.getElementById("threatLevel");
const threatScoreEl = document.getElementById("threatScore");
const currentAttackEl = document.getElementById("currentAttack");

const resultEl = document.getElementById("result");
const scanButton = document.getElementById("scanButton");
const attackButton = document.getElementById("attackButton");
const epsilonSlider = document.getElementById("epsilonSlider");
const epsilonValueEl = document.getElementById("epsilonValue");

let drawing = false;
let hasMovedSinceStart = false;
let isBusy = false;

function resetCanvasSurface() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
}

resetCanvasSurface();

function getCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
    };
}

function startDrawing(clientX, clientY) {
    drawing = true;
    hasMovedSinceStart = false;
    inputStatus.textContent = "CAPTURING";
    scannerHintEl.textContent = "🕷 Capturing neural stroke...";

    const pt = getCanvasPoint(clientX, clientY);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    logEvent("Neural Scanner: input capture initiated.");
}

function drawAt(clientX, clientY) {
    if (!drawing) return;

    const pt = getCanvasPoint(clientX, clientY);
    ctx.lineWidth = 15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "black";

    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    hasMovedSinceStart = true;
}

function stopDrawing() {
    if (!drawing) return;
    drawing = false;
    ctx.beginPath();
    inputStatus.textContent = "READY";
    updateInkCoverage();

    if (hasMovedSinceStart) {
        logEvent("Neural Scanner: observation captured.");
    }
}

canvas.addEventListener("mousedown", (event) => {
    startDrawing(event.clientX, event.clientY);
});

canvas.addEventListener("mousemove", (event) => {
    drawAt(event.clientX, event.clientY);
});

canvas.addEventListener("mouseup", stopDrawing);
canvas.addEventListener("mouseleave", stopDrawing);

canvas.addEventListener(
    "touchstart",
    (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        if (touch) startDrawing(touch.clientX, touch.clientY);
    },
    { passive: false }
);

canvas.addEventListener(
    "touchmove",
    (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        if (touch) drawAt(touch.clientX, touch.clientY);
    },
    { passive: false }
);

canvas.addEventListener("touchend", stopDrawing);
canvas.addEventListener("touchcancel", stopDrawing);

if (epsilonSlider && epsilonValueEl) {
    epsilonSlider.addEventListener("input", () => {
        epsilonValueEl.textContent = parseFloat(epsilonSlider.value).toFixed(2);
    });
}

function logEvent(message) {
    const missionLog = document.getElementById("missionLog");
    const entry = document.createElement("div");
    entry.className = "log-entry";

    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const logMessage = document.createElement("div");
    logMessage.className = "log-message";
    logMessage.textContent = String(message);

    entry.appendChild(time);
    entry.appendChild(logMessage);
    missionLog.prepend(entry);
}

// Keep addLog as safe alias using textContent (no innerHTML injection)
function addLog(message) {
    logEvent(message);
}

function setPulseState(levelText, scorePercent, villainName, severity) {
    threatLevelEl.textContent = levelText;
    threatScoreEl.textContent = `${scorePercent}%`;
    currentAttackEl.textContent = villainName;

    threatCardEl.classList.remove("pulse-safe", "pulse-warning", "pulse-danger");
    if (severity === "safe") {
        threatCardEl.classList.add("pulse-safe");
    } else if (severity === "warning") {
        threatCardEl.classList.add("pulse-warning");
    } else if (severity === "danger") {
        threatCardEl.classList.add("pulse-danger");
    }
}

function setBusyState(busy, activeMode) {
    isBusy = busy;
    scanButton.disabled = busy;
    attackButton.disabled = busy;

    if (busy) {
        neuralLinkEl.textContent = "TRANSMITTING";
        scanButton.textContent = activeMode === "scan" ? "🕷 Scanning..." : "🕷 Scan Threat";
        attackButton.textContent =
            activeMode === "attack" ? "👺 Launching Attack..." : "👺 Launch Goblin Attack";
    } else {
        neuralLinkEl.textContent = "READY";
        scanButton.textContent = "🕷 Scan Threat";
        attackButton.textContent = "👺 Launch Goblin Attack";
    }
}

function clearCanvas() {
    resetCanvasSurface();
    inputStatus.textContent = "EMPTY";
    inkCoverageEl.textContent = "0%";
    observationQualityEl.textContent = "--";
    analysisReadyEl.textContent = "NO";
    scannerHintEl.textContent = "🕷 Draw a digit to begin neural analysis.";

    resultEl.textContent = "Standing by for incoming telemetry...";
    setPulseState("🟢 Low", 0, "None", null);
    logEvent("Neural Scanner: canvas reset and telemetry cleared.");
}

function updateInkCoverage() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    let darkPixels = 0;
    const totalPixels = canvas.width * canvas.height;

    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] < 240) {
            darkPixels++;
        }
    }

    const coverage = (darkPixels / totalPixels) * 100;
    inkCoverageEl.textContent = coverage.toFixed(1) + "%";

    if (coverage < 1) {
        observationQualityEl.textContent = "NO INPUT";
        analysisReadyEl.textContent = "NO";
        scannerHintEl.textContent = "🕷 Draw a digit to begin neural analysis.";
    } else if (coverage < 3) {
        observationQualityEl.textContent = "POOR";
        analysisReadyEl.textContent = "NO";
        scannerHintEl.textContent = "⚠ Input too faint — draw a clearer, thicker digit.";
    } else if (coverage < 6) {
        observationQualityEl.textContent = "FAIR";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "✅ Input ready for Spider-Sense scan or Goblin attack.";
    } else if (coverage < 10) {
        observationQualityEl.textContent = "GOOD";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "✅ Strong input captured. Ready for analysis.";
    } else {
        observationQualityEl.textContent = "EXCELLENT";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "✅ Excellent input density. Neural Link standing by.";
    }
}

function ensureInputReady() {
    if (analysisReadyEl.textContent !== "READY") {
        scannerHintEl.textContent =
            "⚠ Observation quality insufficient. Draw a clearer digit before analysis.";
        logEvent("Scanner Gate: blocked operation due to insufficient input quality.");
        return false;
    }
    return !isBusy;
}

function scanThreat() {
    if (!ensureInputReady()) return;
    predictDigit();
}

function generateOracleVerdict(result) {
    const quality = observationQualityEl.textContent;
    const confidence = parseFloat(result.confidence);

    if (confidence >= 90 && quality === "EXCELLENT") {
        return {
            verdict: "Classification confidence is strong. Input appears structurally consistent.",
            recommendation: "Continue monitoring.",
        };
    }

    if (confidence >= 75 && quality !== "POOR") {
        return {
            verdict: "Classification confidence is stable. Input quality is sufficient for analysis.",
            recommendation: "Continue monitoring.",
        };
    }

    if (confidence >= 50) {
        return {
            verdict:
                "Classification confidence is moderate. Input characteristics may affect model certainty.",
            recommendation: "Consider a clearer input for improved analysis.",
        };
    }

    return {
        verdict: "Low-confidence classification detected. Neural analysis may be unreliable.",
        recommendation: "Re-scan with a clearer input.",
    };
}

function createOracleRow(gridEl, label, value) {
    const labelDiv = document.createElement("div");
    labelDiv.textContent = label;
    const valueDiv = document.createElement("div");
    valueDiv.textContent = value;
    gridEl.appendChild(labelDiv);
    gridEl.appendChild(valueDiv);
}

function renderErrorReport(message) {
    resultEl.replaceChildren();
    const box = document.createElement("div");
    box.className = "error-banner";
    box.textContent = `⚠ Telemetry Error: ${message}`;
    resultEl.appendChild(box);
}

function generateThreatReport(result) {
    const oracle = generateOracleVerdict(result);

    resultEl.replaceChildren();

    const grid = document.createElement("div");
    grid.className = "oracle-grid";
    createOracleRow(grid, "Classification", `Digit ${result.digit}`);
    createOracleRow(grid, "Confidence", `${result.confidence}%`);
    createOracleRow(grid, "Decision Margin", `${result.margin ?? "--"}%`);
    createOracleRow(grid, "Threat Level", result.threat);
    createOracleRow(grid, "Scanner Quality", observationQualityEl.textContent);
    createOracleRow(grid, "Analysis Status", analysisReadyEl.textContent);
    resultEl.appendChild(grid);

    if (Array.isArray(result.top3) && result.top3.length > 0) {
        const topStrip = document.createElement("div");
        topStrip.className = "top3-strip";
        result.top3.forEach((item) => {
            const pill = document.createElement("span");
            pill.className = "top3-pill";
            pill.textContent = `#${item.digit}: ${item.confidence}%`;
            topStrip.appendChild(pill);
        });
        resultEl.appendChild(topStrip);
    }

    const verdictBox = document.createElement("div");
    verdictBox.className = "oracle-verdict";

    const h3 = document.createElement("h3");
    h3.textContent = "Oracle Verdict";
    const pVerdict = document.createElement("p");
    pVerdict.textContent = oracle.verdict;

    const strong = document.createElement("strong");
    strong.textContent = "Recommendation";
    const pRec = document.createElement("p");
    pRec.textContent = oracle.recommendation;

    verdictBox.append(h3, pVerdict, strong, pRec);
    resultEl.appendChild(verdictBox);

    const severity = result.threat.includes("SAFE")
        ? "safe"
        : result.threat.includes("SUSPICIOUS")
        ? "warning"
        : "danger";
    setPulseState(result.threat, result.threat_score ?? 0, "None", severity);

    logEvent(`Oracle: Digit ${result.digit} classified at ${result.confidence}% confidence.`);
    logEvent(`Oracle assessment: ${oracle.verdict}`);
    logEvent(`Oracle recommendation: ${oracle.recommendation}`);
}

function createDiffCard(title, dataUrl) {
    const card = document.createElement("div");
    card.className = "diff-card";

    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = title;

    const caption = document.createElement("span");
    caption.textContent = title;

    card.append(img, caption);
    return card;
}

function renderAttackReport(result) {
    resultEl.replaceChildren();

    const grid = document.createElement("div");
    grid.className = "oracle-grid";
    createOracleRow(grid, "Original Prediction", `Digit ${result.original_digit} (${result.original_confidence}%)`);
    createOracleRow(grid, "Attacked Prediction", `Digit ${result.attacked_digit} (${result.attacked_confidence}%)`);
    createOracleRow(grid, "Attack Method", `FGSM (ε = ${result.epsilon})`);
    createOracleRow(
        grid,
        "Attack Status",
        result.attack_success ? "🚨 ATTACK SUCCESSFUL" : "⚠ ATTACK RESISTED"
    );
    createOracleRow(grid, "Threat Level", result.threat);
    resultEl.appendChild(grid);

    if (result.original_image && result.perturbation_image && result.attacked_image) {
        const diffGrid = document.createElement("div");
        diffGrid.className = "visual-diff-grid";
        diffGrid.append(
            createDiffCard("Clean (28×28)", result.original_image),
            createDiffCard("Goblin Noise", result.perturbation_image),
            createDiffCard("Adversarial", result.attacked_image)
        );
        resultEl.appendChild(diffGrid);
    }

    const verdictBox = document.createElement("div");
    verdictBox.className = "oracle-verdict";

    const h3 = document.createElement("h3");
    h3.textContent = "Spider-Sense Analysis";

    const analysisP = document.createElement("p");
    analysisP.textContent = result.attack_success
        ? `Decision boundary crossed: ${result.original_digit} → ${result.attacked_digit} using FGSM perturbation.`
        : "Model resisted label flip, though prediction confidence shifted under perturbation.";

    const strong = document.createElement("strong");
    strong.textContent = "Recommendation";
    const recP = document.createElement("p");
    recP.textContent = result.attack_success
        ? "Web Shield adversarial defense recommended to harden this decision boundary."
        : "Try higher ε intensity or test another digit to probe boundary margins.";

    verdictBox.append(h3, analysisP, strong, recP);
    resultEl.appendChild(verdictBox);

    const severity = result.attack_success ? "danger" : "warning";
    setPulseState(result.threat, result.threat_score ?? 50, "Green Goblin (FGSM)", severity);

    logEvent(
        `Goblin Attack (ε=${result.epsilon}): ${result.original_digit} (${result.original_confidence}%) → ${result.attacked_digit} (${result.attacked_confidence}%).`
    );
}

async function predictDigit() {
    const image = canvas.toDataURL("image/png");
    setBusyState(true, "scan");

    try {
        const response = await fetch("/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Server error (${response.status})`);
        }

        generateThreatReport(result);
    } catch (err) {
        renderErrorReport(err.message);
        logEvent(`Scan failed: ${err.message}`);
    } finally {
        setBusyState(false, null);
    }
}

async function attackDigit() {
    if (!ensureInputReady()) return;

    const image = canvas.toDataURL("image/png");
    const epsilon = epsilonSlider ? parseFloat(epsilonSlider.value) : 0.35;
    setBusyState(true, "attack");

    try {
        const response = await fetch("/attack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image, epsilon }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Server error (${response.status})`);
        }

        renderAttackReport(result);
    } catch (err) {
        renderErrorReport(err.message);
        logEvent(`Goblin Attack failed: ${err.message}`);
    } finally {
        setBusyState(false, null);
    }
}

logEvent("Operation Archive online.");
