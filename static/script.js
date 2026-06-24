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

canvas.addEventListener(
    "mousedown",
    () => drawing = true
);

canvas.addEventListener(
    "mouseup",
    () => {

        drawing = false;

        ctx.beginPath();

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

function clearCanvas()
{
    ctx.fillStyle = "white";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
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

    document.getElementById(
    "result"
).innerHTML =

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