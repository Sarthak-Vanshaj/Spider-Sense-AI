from flask import Flask, render_template, request, jsonify
import tensorflow as tf
import numpy as np
from PIL import Image
import base64
import io
app = Flask(__name__)

print("🕷 Loading Spider-Sense Model...")

model = tf.keras.models.load_model(
    "spider_sense_model.keras"
)

print("✅ Spider-Sense Ready!")
loss_object = tf.keras.losses.SparseCategoricalCrossentropy()

def create_adversarial_pattern(
    image,
    label
):

    image = tf.cast(
        image,
        tf.float32
    )

    with tf.GradientTape() as tape:

        tape.watch(image)

        prediction = model(image)

        loss = loss_object(
            label,
            prediction
        )

    gradient = tape.gradient(
        loss,
        image
    )

    signed_grad = tf.sign(
        gradient
    )

    return signed_grad

@app.route("/")
def home():
    return render_template("index.html")
@app.route("/predict", methods=["POST"])
def predict():

    data = request.json

    image_data = data["image"]

    image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(image_data)

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("L")

    image = image.resize((28, 28))
    image.save("processed_digit.png")

    image = np.array(image)

    image = 255 - image

    image = image.astype("float32") / 255.0

    image = image.reshape(
        1,
        28,
        28,
        1
    )

    prediction = model.predict(
        image,
        verbose=0
    )

    digit = int(np.argmax(prediction))

    confidence = float(
        np.max(prediction)
    )

    top2 = np.sort(
        prediction[0]
    )[-2:]

    margin = float(
        top2[1] - top2[0]
    )

    if confidence > 0.95 and margin > 0.70:
        threat = "🟢 SAFE"

    elif confidence > 0.80 and margin > 0.40:
        threat = "🟡 SUSPICIOUS"

    else:
        threat = "🔴 THREAT DETECTED"

    print("\n==========")
    print(f"Prediction: {digit}")
    print(f"Confidence: {confidence:.4f}")
    print(f"Margin: {margin:.4f}")

    top3 = np.argsort(
        prediction[0]
    )[-3:][::-1]

    for idx in top3:
        print(
            f"Digit {idx}: {prediction[0][idx]:.4f}"
        )

    print("==========\n")

    return jsonify({
        "digit": digit,
        "confidence": round(
            confidence * 100,
            2
        ),
        "threat": threat
    })
@app.route("/attack", methods=["POST"])
def attack():

    data = request.json

    image_data = data["image"]

    image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(
        image_data
    )

    image = Image.open(
        io.BytesIO(image_bytes)
    ).convert("L")

    image = image.resize(
        (28, 28)
    )

    image = np.array(image)

    image = 255 - image

    image = image.astype(
        "float32"
    ) / 255.0

    image = image.reshape(
        1,
        28,
        28,
        1
    )

    original_prediction = model.predict(
        image,
        verbose=0
    )

    predicted_label = int(
        np.argmax(
            original_prediction
        )
    )

    original_confidence = float(
        np.max(
        original_prediction
        )
    )

    label = tf.convert_to_tensor(
        [predicted_label]
    )

    perturbations = create_adversarial_pattern(
        image,
        label
    )

    epsilon = 0.35

    attacked = image + (
        epsilon * perturbations
    )

    attacked = tf.clip_by_value(
        attacked,
        0,
        1
    )

    prediction = model.predict(
        attacked.numpy(),
        verbose=0
    )

    digit = int(
        np.argmax(prediction)
    )

    confidence = float(
        np.max(prediction)
    )

    if digit != predicted_label:
        threat = "🚨 ATTACK SUCCESSFUL"

    elif confidence < 0.90:
        threat = "🔴 THREAT DETECTED"

    else:
        threat = "🟡 ATTACK ATTEMPT DETECTED"

    print("\n========== FGSM ATTACK ==========")
    print(
        f"Original Prediction: {predicted_label}"
    )
    print(
        f"Attacked Prediction: {digit}"
    )
    print(
        f"Confidence: {confidence:.4f}"
    )
    print("=================================\n")

    return jsonify({

    "original_digit":
    predicted_label,

    "original_confidence":
    round(
        original_confidence * 100,
        2
    ),

    "attacked_digit":
    digit,

    "attacked_confidence":
    round(
        confidence * 100,
        2
    ),

    "threat":
    threat,

    "attack_success":
    digit != predicted_label
})
if __name__ == "__main__":
    app.run(debug=True)

