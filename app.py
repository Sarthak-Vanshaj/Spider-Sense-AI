import base64
import binascii
from collections import defaultdict, deque
import io
import os
import re
import threading
import time

from flask import Flask, jsonify, render_template, request
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
import tensorflow as tf

# Guard against PIL decompression bomb payloads
Image.MAX_IMAGE_PIXELS = 4_000_000

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2 MB cap per request

DATA_URL_PATTERN = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$",
    re.IGNORECASE,
)
MAX_DECODED_IMAGE_BYTES = 1_500_000

# Lightweight in-memory sliding-window rate limiter per client IP
_rate_lock = threading.Lock()
_rate_buckets = defaultdict(deque)


def is_rate_limited(client_ip: str, limit: int, window_seconds: int = 60) -> bool:
    """Return True if client_ip exceeded `limit` requests within `window_seconds`."""
    if app.config.get("TESTING"):
        return False

    now = time.monotonic()
    cutoff = now - window_seconds
    with _rate_lock:
        bucket = _rate_buckets[client_ip]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return True
        bucket.append(now)
        return False


print("🕷 Loading Spider-Sense Model...")
model = tf.keras.models.load_model("spider_sense_model.keras")
print("✅ Spider-Sense Ready!")

loss_object = tf.keras.losses.SparseCategoricalCrossentropy()


def create_adversarial_pattern(image: tf.Tensor, label: tf.Tensor) -> tf.Tensor:
    """Compute FGSM perturbation sign using model gradients."""
    image = tf.cast(image, tf.float32)

    with tf.GradientTape() as tape:
        tape.watch(image)
        prediction = model(image, training=False)
        loss = loss_object(label, prediction)

    gradient = tape.gradient(loss, image)
    return tf.sign(gradient)


def decode_canvas_image(payload: dict) -> Image.Image:
    """Validate and decode a base64 data-URL image payload into a grayscale PIL image."""
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")

    image_data = payload.get("image")
    if not isinstance(image_data, str) or not image_data.strip():
        raise ValueError("Missing or invalid 'image' field.")

    match = DATA_URL_PATTERN.match(image_data.strip())
    if not match:
        raise ValueError("Image must be a valid base64 PNG, JPEG, or WEBP data URL.")

    encoded_body = match.group(2)
    try:
        image_bytes = base64.b64decode(encoded_body, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Malformed base64 image encoding.") from exc

    if len(image_bytes) > MAX_DECODED_IMAGE_BYTES:
        raise ValueError("Decoded image exceeds maximum allowed size.")

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img.verify()
        with Image.open(io.BytesIO(image_bytes)) as img:
            return img.convert("L")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValueError("Uploaded data is not a valid image.") from exc


def preprocess_canvas_image(image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """Invert, center, and normalize a canvas digit to MNIST-compatible 28x28x1 tensor."""
    inverted = ImageOps.invert(image)
    arr = np.asarray(inverted, dtype=np.uint8)

    # Remove very faint canvas anti-aliasing artifacts before bounding-box centering
    mask = arr > 20
    if np.any(mask):
        coords = np.argwhere(mask)
        y0, x0 = coords.min(axis=0)
        y1, x1 = coords.max(axis=0) + 1
        cropped = inverted.crop((int(x0), int(y0), int(x1), int(y1)))

        width, height = cropped.size
        scale = 20.0 / max(width, height)
        new_w = max(1, int(round(width * scale)))
        new_h = max(1, int(round(height * scale)))
        resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

        centered = Image.new("L", (28, 28), color=0)
        offset_x = (28 - new_w) // 2
        offset_y = (28 - new_h) // 2
        centered.paste(resized, (offset_x, offset_y))
        processed_uint8 = np.asarray(centered, dtype=np.uint8)
    else:
        resized = inverted.resize((28, 28), Image.Resampling.LANCZOS)
        processed_uint8 = np.asarray(resized, dtype=np.uint8)

    normalized = processed_uint8.astype("float32") / 255.0
    tensor = normalized.reshape(1, 28, 28, 1)
    return tensor, processed_uint8


def encode_gray_array_png(arr_0_to_1: np.ndarray) -> str:
    """Encode a 28x28 [0, 1] array as a base64 PNG data URL for UI inspection."""
    clipped = np.clip(arr_0_to_1, 0.0, 1.0)
    uint8_img = (clipped.reshape(28, 28) * 255.0).astype(np.uint8)
    pil_img = Image.fromarray(uint8_img, mode="L")
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def encode_perturbation_png(signed_grad: np.ndarray) -> str:
    """Encode FGSM signed perturbation (-1/0/+1) into a high-contrast RGB heatmap PNG."""
    grad_2d = signed_grad.reshape(28, 28)
    rgb = np.zeros((28, 28, 3), dtype=np.uint8)
    # Positive gradient shift -> cyan/blue; negative -> red/orange
    rgb[grad_2d > 0] = [58, 166, 255]
    rgb[grad_2d < 0] = [231, 76, 60]
    rgb[grad_2d == 0] = [20, 27, 45]
    pil_img = Image.fromarray(rgb, mode="RGB")
    buffer = io.BytesIO()
    pil_img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def compute_threat_assessment(confidence: float, margin: float) -> tuple[str, int]:
    """Derive threat label and 0-100 risk score from model confidence and margin."""
    if confidence > 0.95 and margin > 0.70:
        threat = "🟢 SAFE"
    elif confidence > 0.80 and margin > 0.40:
        threat = "🟡 SUSPICIOUS"
    else:
        threat = "🔴 THREAT DETECTED"

    risk_score = int(round(max(0.0, min(100.0, (1.0 - min(confidence, margin + 0.2)) * 100.0))))
    return threat, risk_score


@app.after_request
def add_security_headers(response):
    """Attach baseline HTTP security headers to all responses."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({"error": "Request payload exceeds the 2 MB limit."}), 413


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    client_ip = request.remote_addr or "unknown"
    if is_rate_limited(f"predict:{client_ip}", limit=60, window_seconds=60):
        return jsonify({"error": "Rate limit exceeded. Please wait a moment."}), 429

    payload = request.get_json(silent=True)
    try:
        gray_image = decode_canvas_image(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    image_tensor, _ = preprocess_canvas_image(gray_image)
    prediction = model.predict(image_tensor, verbose=0)[0]

    digit = int(np.argmax(prediction))
    confidence = float(np.max(prediction))
    sorted_probs = np.sort(prediction)
    margin = float(sorted_probs[-1] - sorted_probs[-2])

    threat, threat_score = compute_threat_assessment(confidence, margin)

    top3_indices = np.argsort(prediction)[-3:][::-1]
    top3 = [
        {"digit": int(idx), "confidence": round(float(prediction[idx]) * 100.0, 2)}
        for idx in top3_indices
    ]

    return jsonify({
        "digit": digit,
        "confidence": round(confidence * 100.0, 2),
        "margin": round(margin * 100.0, 2),
        "threat": threat,
        "threat_score": threat_score,
        "top3": top3,
    })


@app.route("/attack", methods=["POST"])
def attack():
    client_ip = request.remote_addr or "unknown"
    if is_rate_limited(f"attack:{client_ip}", limit=30, window_seconds=60):
        return jsonify({"error": "Rate limit exceeded for attack simulations."}), 429

    payload = request.get_json(silent=True)
    try:
        gray_image = decode_canvas_image(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    raw_epsilon = payload.get("epsilon", 0.35)
    try:
        epsilon = float(raw_epsilon)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid 'epsilon' parameter."}), 400

    if not (0.01 <= epsilon <= 0.50):
        return jsonify({"error": "'epsilon' must be between 0.01 and 0.50."}), 400

    image_tensor, _ = preprocess_canvas_image(gray_image)

    original_prediction = model.predict(image_tensor, verbose=0)[0]
    predicted_label = int(np.argmax(original_prediction))
    original_confidence = float(np.max(original_prediction))

    label_tensor = tf.convert_to_tensor([predicted_label])
    perturbations = create_adversarial_pattern(image_tensor, label_tensor)

    attacked = image_tensor + (epsilon * perturbations)
    attacked = tf.clip_by_value(attacked, 0.0, 1.0)
    attacked_np = attacked.numpy()

    attacked_prediction = model.predict(attacked_np, verbose=0)[0]
    digit = int(np.argmax(attacked_prediction))
    confidence = float(np.max(attacked_prediction))
    attack_success = digit != predicted_label

    if attack_success:
        threat = "🚨 ATTACK SUCCESSFUL"
        threat_score = min(100, max(75, int(round(confidence * 100.0))))
    elif confidence < 0.90:
        threat = "🔴 THREAT DETECTED"
        threat_score = int(round((1.0 - confidence) * 100.0))
    else:
        threat = "🟡 ATTACK ATTEMPT DETECTED"
        threat_score = max(35, int(round((original_confidence - confidence) * 100.0 + 35)))

    return jsonify({
        "original_digit": predicted_label,
        "original_confidence": round(original_confidence * 100.0, 2),
        "attacked_digit": digit,
        "attacked_confidence": round(confidence * 100.0, 2),
        "epsilon": round(epsilon, 2),
        "threat": threat,
        "threat_score": threat_score,
        "attack_success": attack_success,
        "original_image": encode_gray_array_png(image_tensor),
        "attacked_image": encode_gray_array_png(attacked_np),
        "perturbation_image": encode_perturbation_png(perturbations.numpy()),
    })


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=debug_mode)
