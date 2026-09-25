const canvas =
document.getElementById("canvas");

const ctx =
canvas.getContext("2d");

ctx.fillStyle = "white";

ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
);

let drawing = false;

const inputStatus =
document.getElementById(
    "inputStatus"
);

canvas.addEventListener(
    "mousedown",
    () => {

        console.log("Mouse Down");

        drawing = true;

        inputStatus.textContent =
        "CAPTURING";

        logEvent(
            "Neural Scanner: input capture initiated."
        );

    }
);

canvas.addEventListener(
    "mouseup",
    () => {

        drawing = false;

        ctx.beginPath();

        inputStatus.textContent =
        "READY";

        updateInkCoverage();

        logEvent(
    "Neural Scanner: observation captured."
);

    }
);
canvas.addEventListener(
    "mousemove",
    draw
);

function draw(event)
{
    if(!drawing) return;

    const rect =
    canvas.getBoundingClientRect();

    ctx.lineWidth = 15;

    ctx.lineCap = "round";

    ctx.strokeStyle = "black";

    ctx.lineTo(
        event.clientX - rect.left,
        event.clientY - rect.top
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(
        event.clientX - rect.left,
        event.clientY - rect.top
    );
}

function logEvent(message)
{
    const missionLog =
    document.getElementById("missionLog");

    const entry =
    document.createElement("div");

    entry.className =
    "log-entry";

    const time =
    document.createElement("span");

    time.className =
    "log-time";

    const now =
    new Date();

    time.textContent =
    now.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );

    const logMessage =
    document.createElement("div");

    logMessage.className =
    "log-message";

    logMessage.textContent =
    message;

    entry.appendChild(time);

    entry.appendChild(logMessage);

    missionLog.prepend(entry);
}

function clearCanvas()
{
    ctx.fillStyle = "white";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    inputStatus.textContent =
    "EMPTY";
    document.getElementById(
    "inkCoverage"
    ).textContent = "0%";
    document.getElementById(
    "observationQuality"
).textContent =
"--";

document.getElementById(
    "analysisReady"
).textContent =
"NO";
}
function updateInkCoverage()
{

    const imageData =
    ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const pixels =
    imageData.data;

    let darkPixels = 0;

    const totalPixels =
    canvas.width *
    canvas.height;

    for(
        let i = 0;
        i < pixels.length;
        i += 4
    )
    {

        const r = pixels[i];

        if(r < 240)
        {

            darkPixels++;

        }

    }

    const coverage =
    (
        darkPixels /
        totalPixels
    ) * 100;

    document.getElementById(
    "inkCoverage"
).textContent =
coverage.toFixed(1) + "%";

const quality =
document.getElementById(
    "observationQuality"
);

const ready =
document.getElementById(
    "analysisReady"
);

if(coverage < 1)
{

    quality.textContent =
    "NO INPUT";

    ready.textContent =
    "NO";

}
else if(coverage < 3)
{

    quality.textContent =
    "POOR";

    ready.textContent =
    "NO";

}
else if(coverage < 6)
{

    quality.textContent =
    "FAIR";

    ready.textContent =
    "READY";

}
else if(coverage < 10)
{

    quality.textContent =
    "GOOD";

    ready.textContent =
    "READY";

}
else
{

    quality.textContent =
    "EXCELLENT";

    ready.textContent =
    "READY";

}

}

function scanThreat()
{

    const ready =
    document.getElementById(
        "analysisReady"
    ).textContent;

    if(
        ready !== "READY"
    )
    {

        alert(
            "Observation quality insufficient.\nDraw a clearer digit before analysis."
        );

        return;

    }

    predictDigit();

}

function generateOracleVerdict(result)
{
    const quality =
        document.getElementById(
            "observationQuality"
        ).textContent;

    const coverageText =
        document.getElementById(
            "inkCoverage"
        ).textContent;

    const coverage =
        parseFloat(
            coverageText.replace("%", "")
        );

    const confidence =
        parseFloat(result.confidence);

    if (
        confidence >= 90 &&
        quality === "EXCELLENT"
    )
    {
        return {
            verdict:
                "Classification confidence is strong. Input appears structurally consistent.",

            recommendation:
                "Continue monitoring."
        };
    }

    if (
        confidence >= 75 &&
        quality !== "POOR"
    )
    {
        return {
            verdict:
                "Classification confidence is stable. Input quality is sufficient for analysis.",

            recommendation:
                "Continue monitoring."
        };
    }

    if (
        confidence >= 50
    )
    {
        return {
            verdict:
                "Classification confidence is moderate. Input characteristics may affect model certainty.",

            recommendation:
                "Consider a clearer input for improved analysis."
        };
    }

    return {
        verdict:
            "Low-confidence classification detected. Neural analysis may be unreliable.",

        recommendation:
            "Re-scan with a clearer input."
    };
}

function generateThreatReport(result)
{
    const oracle =
    generateOracleVerdict(result);

    document.getElementById(
    "result"
).innerHTML =

`

<div class="oracle-grid">

    <div>Classification</div>
    <div>Digit ${result.digit}</div>

    <div>Confidence</div>
    <div>${result.confidence}%</div>

    <div>Threat Level</div>
    <div>${result.threat}</div>

    <div>Scanner Quality</div>
    <div>

    ${
        document.getElementById(
            "observationQuality"
        ).textContent
    }

    </div>

    <div>Analysis Status</div>
    <div>

    ${
        document.getElementById(
            "analysisReady"
        ).textContent
    }

    </div>

</div>

<div class="oracle-verdict">

    <h3>Oracle Verdict</h3>

    <p>
        ${oracle.verdict}
    </p>

    <strong>
        Recommendation
    </strong>

    <p>
        ${oracle.recommendation}
    </p>

</div>

`;
addLog(
    `Oracle: Digit ${result.digit} classified at ${result.confidence}% confidence.`
);

addLog(
    `Oracle assessment: ${oracle.verdict}`
);

addLog(
    `Oracle recommendation: ${oracle.recommendation}`
);

}

function addLog(message)
{
    const missionLog =
        document.getElementById("missionLog");

    const entry =
        document.createElement("div");

    entry.className =
        "log-entry";

    const time =
        new Date().toLocaleTimeString();

    entry.innerHTML =

    `
        <span class="log-time">
            ${time}
        </span>

        <div class="log-message">
            ${message}
        </div>
    `;

    missionLog.prepend(entry);
}

async function predictDigit()
{
    const image =
    canvas.toDataURL();

    const response =
    await fetch(
        "/predict",
        {
            method: "POST",

            headers:
            {
                "Content-Type":
                "application/json"
            },

            body: JSON.stringify(
            {
                image: image
            })
        }
    );

    const result =
    await response.json();

    generateThreatReport(
    result
);

`
<h2>🕷 SPIDER-SENSE ANALYSIS</h2>

Prediction:
<b>${result.digit}</b>

<br><br>

Confidence:
<b>${result.confidence}%</b>

<br><br>

Threat Level:
<b>${result.threat}</b>
`;
}
async function attackDigit()
{
    const image =
    canvas.toDataURL();

    const response =
    await fetch(
        "/attack",
        {
            method: "POST",

            headers:
            {
                "Content-Type":
                "application/json"
            },

            body: JSON.stringify(
            {
                image: image
            })
        }
    );

    const result =
    await response.json();

    document.getElementById(
        "result"
    ).innerHTML =

    `
    <h2>
    🕷 SPIDER-SENSE THREAT REPORT
    </h2>

    <hr>

    <b>Original Prediction:</b>
    ${result.original_digit}

    <br><br>

    <b>Original Confidence:</b>
    ${result.original_confidence}%

    <br><br>

    <b>Attacked Prediction:</b>
    ${result.attacked_digit}

    <br><br>

    <b>Attack Confidence:</b>
    ${result.attacked_confidence}%

    <br><br>

    <b>Attack Status:</b>

    ${
    result.attack_success
    ?
    "🚨 ATTACK SUCCESSFUL"
    :
    "⚠ ATTACK ATTEMPT DETECTED"
    }

    <br><br>

    <b>Threat Level:</b>

    ${result.threat}

    <br><br>

    <b>Spider-Sense Analysis:</b>

    ${
    result.attack_success
    ?
    "Decision boundary crossed using adversarial perturbation."
    :
    "Model resisted attack but confidence was affected."
    }
    `;
}

logEvent("Operation Archive online.");