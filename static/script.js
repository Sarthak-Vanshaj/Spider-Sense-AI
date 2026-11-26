const canvas = document.getElementById("canvas");
const canvasFrame = document.getElementById("canvasFrame");
const scanSweepEl = document.getElementById("scanSweep");
const ctx = canvas.getContext("2d");

const inputStatus = document.getElementById("inputStatus");
const inkCoverageEl = document.getElementById("inkCoverage");
const observationQualityEl = document.getElementById("observationQuality");
const analysisReadyEl = document.getElementById("analysisReady");
const neuralLinkEl = document.getElementById("neuralLink");
const scannerHintEl = document.getElementById("scannerHint");

const threatCardEl = document.getElementById("threat-card");
const shieldCardEl = document.getElementById("shield-card");
const threatLevelEl = document.getElementById("threatLevel");
const threatScoreEl = document.getElementById("threatScore");
const shieldStatusEl = document.getElementById("shieldStatus");
const currentAttackEl = document.getElementById("currentAttack");

const resultEl = document.getElementById("result");
const scanButton = document.getElementById("scanButton");
const attackButton = document.getElementById("attackButton");
const attackButtonSubEl = document.getElementById("attackButtonSub");
const shieldButton = document.getElementById("shieldButton");
const shieldPillEl = document.getElementById("shieldPill");
const shieldButtonSubEl = document.getElementById("shieldButtonSub");

const epsilonSlider = document.getElementById("epsilonSlider");
const epsilonValueEl = document.getElementById("epsilonValue");
const stepsControlEl = document.getElementById("stepsControl");
const pgdStepsSlider = document.getElementById("pgdStepsSlider");
const pgdStepsValueEl = document.getElementById("pgdStepsValue");
const targetDigitControlEl = document.getElementById("targetDigitControl");

const VILLAIN_UI = {
    fgsm: {
        buttonLabel: "Launch Goblin Attack",
        buttonSub: "Single-step FGSM perturbation",
        displayName: "Green Goblin (FGSM)",
        needsSteps: false,
        needsTarget: false,
    },
    pgd: {
        buttonLabel: "Launch Doc Ock PGD",
        buttonSub: "Iterative L∞ gradient attack",
        displayName: "Doc Ock (PGD)",
        needsSteps: true,
        needsTarget: false,
    },
    targeted: {
        buttonLabel: "Launch Mysterio Hack",
        buttonSub: "Targeted PGD class hijacking",
        displayName: "Mysterio (Targeted)",
        needsSteps: true,
        needsTarget: true,
    },
    noise: {
        buttonLabel: "Launch Electro Surge",
        buttonSub: "Gaussian & impulse noise stress",
        displayName: "Electro (Noise)",
        needsSteps: false,
        needsTarget: false,
    },
};

let drawing = false;
let hasMovedSinceStart = false;
let isBusy = false;
let shieldEnabled = false;
let selectedVillain = "fgsm";
let selectedTargetDigit = 3;

function resetCanvasSurface() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
}

resetCanvasSurface();

function triggerScanSweep() {
    if (!scanSweepEl) return;
    scanSweepEl.classList.remove("sweeping");
    void scanSweepEl.offsetWidth;
    scanSweepEl.classList.add("sweeping");
}

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
    if (canvasFrame) canvasFrame.classList.add("is-capturing");
    inputStatus.textContent = "CAPTURING";
    scannerHintEl.textContent = "Capturing neural stroke...";

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
    if (canvasFrame) canvasFrame.classList.remove("is-capturing");
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

if (pgdStepsSlider && pgdStepsValueEl) {
    pgdStepsSlider.addEventListener("input", () => {
        pgdStepsValueEl.textContent = pgdStepsSlider.value;
    });
}

function selectVillain(villainKey) {
    if (isBusy || !VILLAIN_UI[villainKey]) return;
    selectedVillain = villainKey;
    const cfg = VILLAIN_UI[villainKey];

    document.querySelectorAll(".villain-chip").forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.villain === villainKey);
    });

    setButtonLabel(attackButton, cfg.buttonLabel);
    if (attackButtonSubEl) attackButtonSubEl.textContent = cfg.buttonSub;

    if (stepsControlEl) stepsControlEl.classList.toggle("is-hidden", !cfg.needsSteps);
    if (targetDigitControlEl) targetDigitControlEl.classList.toggle("is-hidden", !cfg.needsTarget);

    logEvent(`Villain Selected: ${cfg.displayName} armed in Mission Command.`);
}

function selectTargetDigit(digit) {
    selectedTargetDigit = digit;
    document.querySelectorAll(".target-digit-btn").forEach((btn) => {
        btn.classList.toggle("active", Number(btn.dataset.digit) === digit);
    });
}

function toggleWebShield() {
    if (isBusy) return;
    shieldEnabled = !shieldEnabled;

    if (shieldEnabled) {
        shieldStatusEl.textContent = "ACTIVE";
        shieldCardEl.classList.add("pulse-shield");
        shieldButton.classList.add("shield-armed");
        if (shieldPillEl) shieldPillEl.textContent = "ON";
        shieldButtonSubEl.textContent = "ACTIVE — Feature Squeezing ON";
        logEvent("Web Shield ARMED: feature squeezing & anomaly detection online.");
    } else {
        shieldStatusEl.textContent = "STANDBY";
        shieldCardEl.classList.remove("pulse-shield");
        shieldButton.classList.remove("shield-armed");
        if (shieldPillEl) shieldPillEl.textContent = "OFF";
        shieldButtonSubEl.textContent = "STANDBY — Click to Arm";
        logEvent("Web Shield DISARMED: returned to standby.");
    }
}

function classifyLogSubsystem(message) {
    const text = String(message);
    if (text.startsWith("Web Shield")) return { label: "SHIELD", cls: "badge-shield" };
    if (
        text.startsWith("Goblin") ||
        text.startsWith("Doc Ock") ||
        text.startsWith("Mysterio") ||
        text.startsWith("Electro") ||
        text.startsWith("Villain")
    ) {
        return { label: "VILLAIN", cls: "badge-goblin" };
    }
    if (text.startsWith("Oracle")) return { label: "ORACLE", cls: "badge-oracle" };
    if (text.startsWith("Neural Scanner") || text.startsWith("Scanner")) {
        return { label: "SCANNER", cls: "badge-system" };
    }
    return { label: "SYSTEM", cls: "badge-system" };
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

    const subsystem = classifyLogSubsystem(message);
    const badge = document.createElement("span");
    badge.className = `log-badge ${subsystem.cls}`;
    badge.textContent = subsystem.label;

    const logMessage = document.createElement("div");
    logMessage.className = "log-message";
    logMessage.textContent = String(message);

    entry.append(time, badge, logMessage);
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

    threatCardEl.classList.remove("pulse-safe", "pulse-warning", "pulse-danger", "pulse-shield");
    if (severity === "safe") {
        threatCardEl.classList.add("pulse-safe");
    } else if (severity === "warning") {
        threatCardEl.classList.add("pulse-warning");
    } else if (severity === "danger") {
        threatCardEl.classList.add("pulse-danger");
    } else if (severity === "shield") {
        threatCardEl.classList.add("pulse-shield");
    }
}

function setButtonLabel(buttonEl, text) {
    const labelEl = buttonEl.querySelector(".btn-label");
    if (labelEl) {
        labelEl.textContent = text;
    }
}

function setBusyState(busy, activeMode) {
    isBusy = busy;
    scanButton.disabled = busy;
    attackButton.disabled = busy;
    shieldButton.disabled = busy;
    const activeVillainLabel = VILLAIN_UI[selectedVillain].buttonLabel;

    if (busy) {
        neuralLinkEl.textContent = "TRANSMITTING";
        setButtonLabel(scanButton, activeMode === "scan" ? "Scanning..." : "Scan Threat");
        setButtonLabel(
            attackButton,
            activeMode === "attack" ? "Attacking..." : activeVillainLabel
        );
    } else {
        neuralLinkEl.textContent = "READY";
        setButtonLabel(scanButton, "Scan Threat");
        setButtonLabel(attackButton, activeVillainLabel);
    }
}

function clearCanvas() {
    resetCanvasSurface();
    inputStatus.textContent = "EMPTY";
    inkCoverageEl.textContent = "0%";
    observationQualityEl.textContent = "--";
    analysisReadyEl.textContent = "NO";
    scannerHintEl.textContent = "Draw a digit inside the reticle to begin neural analysis.";

    resultEl.textContent = "Standing by for incoming telemetry...";
    setPulseState("LOW — NOMINAL", 0, "None", "safe");
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
        scannerHintEl.textContent = "Draw a digit inside the reticle to begin neural analysis.";
    } else if (coverage < 3) {
        observationQualityEl.textContent = "POOR";
        analysisReadyEl.textContent = "NO";
        scannerHintEl.textContent = "Input too faint — draw a clearer, thicker stroke.";
    } else if (coverage < 6) {
        observationQualityEl.textContent = "FAIR";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "Input ready for Spider-Sense scan or Villain simulation.";
    } else if (coverage < 10) {
        observationQualityEl.textContent = "GOOD";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "Strong input captured. Ready for neural analysis.";
    } else {
        observationQualityEl.textContent = "EXCELLENT";
        analysisReadyEl.textContent = "READY";
        scannerHintEl.textContent = "Optimal stroke density. Neural Link standing by.";
    }
}

function ensureInputReady() {
    if (analysisReadyEl.textContent !== "READY") {
        scannerHintEl.textContent =
            "Observation quality insufficient — draw a clearer digit first.";
        logEvent("Scanner Gate: blocked operation due to insufficient input quality.");
        return false;
    }
    return !isBusy;
}

function scanThreat() {
    if (!ensureInputReady()) return;
    triggerScanSweep();
    predictDigit();
}

function generateOracleVerdict(result) {
    if (result.shield && result.shield.enabled && result.shield.anomaly_detected) {
        return {
            verdict: `Web Shield detected input anomaly (L1 divergence ${result.shield.l1_divergence}, haze ${result.shield.haze_ratio}%).`,
            recommendation: "Input sanitized via Feature Squeezing before final classification.",
        };
    }

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
    gridEl.append(labelDiv, valueDiv);
}

function createMeterRow(label, percent, variantClass) {
    const row = document.createElement("div");
    row.className = "meter-row";

    const lbl = document.createElement("span");
    lbl.className = "meter-label";
    lbl.textContent = label;

    const track = document.createElement("div");
    track.className = "meter-track";

    const fill = document.createElement("div");
    fill.className = variantClass ? `meter-fill ${variantClass}` : "meter-fill";
    const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
    fill.style.width = `${clamped}%`;
    track.appendChild(fill);

    const val = document.createElement("span");
    val.className = "meter-value";
    val.textContent = `${clamped.toFixed(1)}%`;

    row.append(lbl, track, val);
    return row;
}

function renderErrorReport(message) {
    resultEl.replaceChildren();
    const box = document.createElement("div");
    box.className = "error-banner";
    box.textContent = `Telemetry Error: ${message}`;
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

    if (result.shield && result.shield.enabled) {
        createOracleRow(
            grid,
            "Web Shield",
            result.shield.anomaly_detected ? "ANOMALY CAUGHT" : "ACTIVE — CLEAN"
        );
        createOracleRow(
            grid,
            "Shield Telemetry",
            `L1: ${result.shield.l1_divergence} | Haze: ${result.shield.haze_ratio}%`
        );
    } else {
        createOracleRow(grid, "Analysis Status", analysisReadyEl.textContent);
    }

    resultEl.appendChild(grid);

    if (Array.isArray(result.top3) && result.top3.length > 0) {
        const meters = document.createElement("div");
        meters.className = "confidence-meters";
        result.top3.forEach((item, idx) => {
            meters.appendChild(
                createMeterRow(`Digit ${item.digit}`, item.confidence, idx === 0 ? "" : null)
            );
        });
        resultEl.appendChild(meters);
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

    const severity = result.threat.includes("SHIELDED")
        ? "shield"
        : result.threat.includes("SAFE")
        ? "safe"
        : result.threat.includes("SUSPICIOUS")
        ? "warning"
        : "danger";
    setPulseState(result.threat, result.threat_score ?? 0, "None", severity);

    logEvent(`Oracle: Digit ${result.digit} classified at ${result.confidence}% confidence.`);
    if (result.shield && result.shield.enabled) {
        logEvent(
            `Web Shield: L1=${result.shield.l1_divergence}, haze=${result.shield.haze_ratio}%, anomaly=${result.shield.anomaly_detected}.`
        );
    }
    logEvent(`Oracle assessment: ${oracle.verdict}`);
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

    const shieldActive = Boolean(result.shield && result.shield.enabled);
    const villainName = result.villain || "Green Goblin (FGSM)";
    const methodSummary =
        result.steps && result.steps > 1
            ? `${result.attack_method} (${result.steps} steps, ε = ${result.epsilon})`
            : `${result.attack_method || "FGSM"} (ε = ${result.epsilon})`;

    const grid = document.createElement("div");
    grid.className = "oracle-grid";
    createOracleRow(grid, "Villain", villainName);
    createOracleRow(grid, "Attack Method", methodSummary);
    createOracleRow(
        grid,
        "Original Prediction",
        `Digit ${result.original_digit} (${result.original_confidence}%)`
    );
    createOracleRow(
        grid,
        "Unshielded Attacked",
        `Digit ${result.attacked_digit} (${result.attacked_confidence}%)`
    );

    if (result.attack_type === "targeted" && result.target_digit !== null) {
        createOracleRow(
            grid,
            "Target Objective",
            result.target_hit
                ? `Digit ${result.target_digit} (HIJACKED)`
                : `Digit ${result.target_digit} (MISSED)`
        );
    }

    if (shieldActive) {
        createOracleRow(
            grid,
            "Web Shield Defended",
            `Digit ${result.shield.defended_digit} (${result.shield.defended_confidence}%)`
        );
        createOracleRow(
            grid,
            "Shield Telemetry",
            `L1: ${result.shield.l1_divergence} | Haze: ${result.shield.haze_ratio}%`
        );
    }

    createOracleRow(
        grid,
        "Outcome",
        shieldActive
            ? result.shield.attack_neutralized
                ? "ATTACK NEUTRALIZED"
                : "SHIELD BYPASSED"
            : result.target_hit
            ? "TARGET HIJACKED"
            : result.attack_success
            ? "ATTACK SUCCESSFUL"
            : "ATTACK RESISTED"
    );
    createOracleRow(grid, "Threat Level", result.threat);
    resultEl.appendChild(grid);

    const meters = document.createElement("div");
    meters.className = "confidence-meters";
    meters.appendChild(
        createMeterRow(`Clean #${result.original_digit}`, result.original_confidence, "")
    );
    meters.appendChild(
        createMeterRow(`Attack #${result.attacked_digit}`, result.attacked_confidence, "fill-attack")
    );
    if (shieldActive) {
        meters.appendChild(
            createMeterRow(
                `Shield #${result.shield.defended_digit}`,
                result.shield.defended_confidence,
                "fill-shield"
            )
        );
    }
    resultEl.appendChild(meters);

    if (result.original_image && result.perturbation_image && result.attacked_image) {
        const diffGrid = document.createElement("div");
        diffGrid.className =
            shieldActive && result.shield.defended_image
                ? "visual-diff-grid visual-diff-4"
                : "visual-diff-grid";

        diffGrid.append(
            createDiffCard("Clean (28×28)", result.original_image),
            createDiffCard("Perturbation", result.perturbation_image),
            createDiffCard("Adversarial", result.attacked_image)
        );

        if (shieldActive && result.shield.defended_image) {
            diffGrid.append(createDiffCard("Web Shield", result.shield.defended_image));
        }

        resultEl.appendChild(diffGrid);
    }

    const verdictBox = document.createElement("div");
    verdictBox.className = "oracle-verdict";

    const h3 = document.createElement("h3");
    h3.textContent = shieldActive ? "Web Shield Defense Report" : "Spider-Sense Analysis";

    const analysisP = document.createElement("p");
    if (shieldActive) {
        analysisP.textContent = result.shield.defense_verdict;
    } else if (result.attack_type === "targeted") {
        analysisP.textContent = result.target_hit
            ? `Mysterio successfully hijacked prediction from ${result.original_digit} to target Digit ${result.target_digit}.`
            : `Targeted hijack missed Digit ${result.target_digit}; model shifted to ${result.attacked_digit}.`;
    } else {
        analysisP.textContent = result.attack_success
            ? `${villainName} crossed decision boundary: ${result.original_digit} → ${result.attacked_digit}.`
            : `${villainName} failed to flip the predicted class, though confidence shifted under perturbation.`;
    }

    const strong = document.createElement("strong");
    strong.textContent = "Recommendation";
    const recP = document.createElement("p");
    if (shieldActive) {
        recP.textContent = result.shield.attack_neutralized
            ? "Defense held. Try Doc Ock (PGD) with higher steps or disable Web Shield to compare."
            : "Iterative perturbation bypassed input sanitization — adversarial retraining recommended.";
    } else {
        recP.textContent = result.attack_success
            ? "Arm Web Shield in Mission Command and re-run to test defense resilience."
            : "Try Doc Ock (PGD) or higher ε intensity to probe tighter decision boundaries.";
    }

    verdictBox.append(h3, analysisP, strong, recP);
    resultEl.appendChild(verdictBox);

    const severity = shieldActive
        ? result.shield.attack_neutralized
            ? "shield"
            : "danger"
        : result.attack_success
        ? "danger"
        : "warning";
    setPulseState(result.threat, result.threat_score ?? 50, villainName, severity);

    const paramTag =
        result.attack_type === "targeted"
            ? `ε=${result.epsilon}, steps=${result.steps}, target=#${result.target_digit}`
            : result.steps > 1
            ? `ε=${result.epsilon}, steps=${result.steps}`
            : `ε=${result.epsilon}`;
    logEvent(
        `${villainName} (${paramTag}): ${result.original_digit} (${result.original_confidence}%) → ${result.attacked_digit} (${result.attacked_confidence}%).`
    );
    if (shieldActive) {
        logEvent(
            `Web Shield Defense: ${result.shield.defense_verdict} (L1=${result.shield.l1_divergence}, haze=${result.shield.haze_ratio}%).`
        );
    }
}

async function predictDigit() {
    const image = canvas.toDataURL("image/png");
    setBusyState(true, "scan");

    try {
        const response = await fetch("/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image, shield: shieldEnabled }),
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

    triggerScanSweep();
    const image = canvas.toDataURL("image/png");
    const epsilon = epsilonSlider ? parseFloat(epsilonSlider.value) : 0.35;
    const steps = pgdStepsSlider ? parseInt(pgdStepsSlider.value, 10) : 10;

    const payload = {
        image,
        epsilon,
        shield: shieldEnabled,
        attack_type: selectedVillain,
    };

    if (selectedVillain === "pgd" || selectedVillain === "targeted") {
        payload.steps = steps;
    }
    if (selectedVillain === "targeted") {
        payload.target_digit = selectedTargetDigit;
    }

    setBusyState(true, "attack");

    try {
        const response = await fetch("/attack", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Server error (${response.status})`);
        }

        renderAttackReport(result);
    } catch (err) {
        renderErrorReport(err.message);
        logEvent(`${VILLAIN_UI[selectedVillain].displayName} failed: ${err.message}`);
    } finally {
        setBusyState(false, null);
    }
}

logEvent("Operation Archive online.");
