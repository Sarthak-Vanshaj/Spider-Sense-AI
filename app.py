from flask import Flask, render_template
import tensorflow as tf

app = Flask(__name__)

print("🕷 Loading Spider-Sense Model...")

model = tf.keras.models.load_model(
    "spider_sense_model.keras"
)

print("✅ Spider-Sense Ready!")

@app.route("/")
def home():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(debug=True)