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