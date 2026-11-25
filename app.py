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
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
import tensorflow as tf

# Guard against PIL decompression bomb payloads
Image.MAX_IMAGE_PIXELS = 4_000_000

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2 MB cap per request
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

DATA_URL_PATTERN = re.compile(
    r"^data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$",
    re.IGNORECASE,
)
MAX_DECODED_IMAGE_BYTES = 1_500_000

# Web Shield Feature Squeezing thresholds (calibrated empirically on spider_sense_model.keras)
SHIELD_L1_THRESHOLD = 0.35
SHIELD_HAZE_THRESHOLD = 0.18

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


def sanitize_input_for_shield(image_tensor: np.ndarray) -> tuple[np.ndarray, float]:
    """Strip FGSM background haze and apply 3x3 median spatial smoothing."""
    arr = np.clip(image_tensor.reshape(28, 28), 0.0, 1.0)
    haze_ratio = float(np.mean((arr > 0.02) & (arr < 0.55)))

    if haze_ratio > SHIELD_HAZE_THRESHOLD:
        # Remove distributed mid/low-intensity adversarial haze prior to median repair
        stripped = np.where(arr > 0.48, 1.0, 0.0)
    else:
        stripped = arr

    uint8_img = (np.clip(stripped, 0.0, 1.0) * 255.0).astype(np.uint8)
    median_arr = (
        np.asarray(Image.fromarray(uint8_img, mode="L").filter(ImageFilter.MedianFilter(3)), dtype=np.float32)
        / 255.0
    )

    repaired = np.maximum(stripped * 0.85, median_arr) if haze_ratio > SHIELD_HAZE_THRESHOLD else median_arr
    return repaired.reshape(1, 28, 28, 1).astype(np.float32), haze_ratio


def evaluate_web_shield(image_tensor: np.ndarray, raw_probs: np.ndarray) -> dict:
    """Run Web Shield feature squeezing, divergence analysis, and sanitized inference."""
    sanitized_tensor, haze_ratio = sanitize_input_for_shield(image_tensor)
    shield_probs = model.predict(sanitized_tensor, verbose=0)[0]

    raw_digit = int(np.argmax(raw_probs))
    raw_confidence = float(np.max(raw_probs))
    defended_digit = int(np.argmax(shield_probs))
    defended_confidence = float(np.max(shield_probs))

    l1_divergence = float(np.sum(np.abs(raw_probs - shield_probs)))
    label_mismatch = raw_digit != defended_digit
    anomaly_detected = (
        l1_divergence >= SHIELD_L1_THRESHOLD
        or haze_ratio >= SHIELD_HAZE_THRESHOLD
        or label_mismatch
    )

    return {
        "sanitized_tensor": sanitized_tensor,
        "shield_probs": shield_probs,
        "raw_digit": raw_digit,
        "raw_confidence": round(raw_confidence * 100.0, 2),
        "defended_digit": defended_digit,
        "defended_confidence": round(defended_confidence * 100.0, 2),
        "l1_divergence": round(l1_divergence, 3),
        "haze_ratio": round(haze_ratio * 100.0, 1),
        "label_mismatch": label_mismatch,
        "anomaly_detected": anomaly_detected,
        "defended_image": encode_gray_array_png(sanitized_tensor),
    }


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


def parse_shield_flag(payload: dict) -> bool:
    """Safely parse optional boolean `shield` flag from JSON request payload."""
    raw = payload.get("shield", False)
    if isinstance(raw, bool):
        return raw
    raise ValueError("'shield' must be a boolean.")


@app.after_request
def add_security_headers(response):
    """Attach baseline HTTP security headers and disable stale browser caching."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store"
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
        shield_enabled = parse_shield_flag(payload)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    image_tensor, _ = preprocess_canvas_image(gray_image)
    raw_prediction = model.predict(image_tensor, verbose=0)[0]

    active_probs = raw_prediction
    shield_info = {"enabled": False}

    if shield_enabled:
        shield_eval = evaluate_web_shield(image_tensor, raw_prediction)
        active_probs = shield_eval["shield_probs"]
        shield_info = {
            "enabled": True,
            "anomaly_detected": shield_eval["anomaly_detected"],
            "l1_divergence": shield_eval["l1_divergence"],
            "haze_ratio": shield_eval["haze_ratio"],
            "raw_digit": shield_eval["raw_digit"],
            "raw_confidence": shield_eval["raw_confidence"],
            "defended_digit": shield_eval["defended_digit"],
            "defended_confidence": shield_eval["defended_confidence"],
            "defended_image": shield_eval["defended_image"],
        }

    digit = int(np.argmax(active_probs))
    confidence = float(np.max(active_probs))
    sorted_probs = np.sort(active_probs)
    margin = float(sorted_probs[-1] - sorted_probs[-2])

    threat, threat_score = compute_threat_assessment(confidence, margin)
    if shield_enabled and shield_info["anomaly_detected"]:
        threat = "🛡 SHIELDED — ANOMALY BLOCKED"
        threat_score = max(threat_score, 70)
    elif shield_enabled and threat == "🟢 SAFE":
        threat = "🛡 SAFE (SHIELDED)"

    top3_indices = np.argsort(active_probs)[-3:][::-1]
    top3 = [
        {"digit": int(idx), "confidence": round(float(active_probs[idx]) * 100.0, 2)}
        for idx in top3_indices
    ]

    return jsonify({
        "digit": digit,
        "confidence": round(confidence * 100.0, 2),
        "margin": round(margin * 100.0, 2),
        "threat": threat,
        "threat_score": threat_score,
        "top3": top3,
        "shield": shield_info,
    })


@app.route("/attack", methods=["POST"])
def attack():
    client_ip = request.remote_addr or "unknown"
    if is_rate_limited(f"attack:{client_ip}", limit=30, window_seconds=60):
        return jsonify({"error": "Rate limit exceeded for attack simulations."}), 429

    payload = request.get_json(silent=True)
    try:
        gray_image = decode_canvas_image(payload)
        shield_enabled = parse_shield_flag(payload)
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
    attacked_digit = int(np.argmax(attacked_prediction))
    attacked_confidence = float(np.max(attacked_prediction))
    raw_attack_success = attacked_digit != predicted_label

    shield_info = {"enabled": False}
    attack_success = raw_attack_success

    if shield_enabled:
        shield_eval = evaluate_web_shield(attacked_np, attacked_prediction)
        recovered = shield_eval["defended_digit"] == predicted_label
        anomaly_caught = shield_eval["anomaly_detected"]
        neutralized = recovered or anomaly_caught

        if recovered:
            defense_verdict = (
                f"Web Shield neutralized Goblin perturbation and restored Digit {predicted_label}."
            )
            threat = "🛡 SHIELDED — ATTACK NEUTRALIZED"
            threat_score = 20
        elif anomaly_caught:
            defense_verdict = (
                "Web Shield detected adversarial divergence/haze and quarantined the input."
            )
            threat = "🛡 SHIELDED — THREAT QUARANTINED"
            threat_score = 35
        else:
            defense_verdict = "Adversarial perturbation evaded Web Shield thresholds."
            threat = "🚨 ATTACK SUCCESSFUL"
            threat_score = min(100, max(75, int(round(attacked_confidence * 100.0))))

        attack_success = not neutralized
        shield_info = {
            "enabled": True,
            "attack_neutralized": neutralized,
            "recovered": recovered,
            "anomaly_detected": anomaly_caught,
            "l1_divergence": shield_eval["l1_divergence"],
            "haze_ratio": shield_eval["haze_ratio"],
            "defended_digit": shield_eval["defended_digit"],
            "defended_confidence": shield_eval["defended_confidence"],
            "defended_image": shield_eval["defended_image"],
            "defense_verdict": defense_verdict,
        }
    else:
        if raw_attack_success:
            threat = "🚨 ATTACK SUCCESSFUL"
            threat_score = min(100, max(75, int(round(attacked_confidence * 100.0))))
        elif attacked_confidence < 0.90:
            threat = "🔴 THREAT DETECTED"
            threat_score = int(round((1.0 - attacked_confidence) * 100.0))
        else:
            threat = "🟡 ATTACK ATTEMPT DETECTED"
            threat_score = max(
                35, int(round((original_confidence - attacked_confidence) * 100.0 + 35))
            )

    return jsonify({
        "original_digit": predicted_label,
        "original_confidence": round(original_confidence * 100.0, 2),
        "attacked_digit": attacked_digit,
        "attacked_confidence": round(attacked_confidence * 100.0, 2),
        "epsilon": round(epsilon, 2),
        "threat": threat,
        "threat_score": threat_score,
        "attack_success": attack_success,
        "raw_attack_success": raw_attack_success,
        "original_image": encode_gray_array_png(image_tensor),
        "attacked_image": encode_gray_array_png(attacked_np),
        "perturbation_image": encode_perturbation_png(perturbations.numpy()),
        "shield": shield_info,
    })


if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=debug_mode)
