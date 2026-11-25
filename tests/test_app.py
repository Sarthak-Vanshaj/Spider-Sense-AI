import base64
import io
import os
import unittest

from PIL import Image, ImageDraw

import app as spider_app


def make_drawn_digit_data_url(digit_shape: str = "7") -> str:
    """Create a synthetic white-background canvas PNG with a black drawn digit."""
    img = Image.new("RGB", (280, 280), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    if digit_shape == "7":
        draw.line([(70, 60), (210, 60)], fill=(0, 0, 0), width=18)
        draw.line([(210, 60), (110, 220)], fill=(0, 0, 0), width=18)
    else:
        draw.ellipse([(80, 60), (200, 220)], outline=(0, 0, 0), width=18)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


class SpiderSenseTests(unittest.TestCase):
    def setUp(self):
        spider_app.app.config["TESTING"] = True
        self.client = spider_app.app.test_client()

    def test_home_renders_dashboard_and_security_headers(self):
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        body = res.get_data(as_text=True)
        self.assertIn("SPIDER-SENSE AI", body)
        self.assertIn("epsilonSlider", body)
        self.assertEqual(res.headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(res.headers.get("X-Frame-Options"), "DENY")

    def test_predict_rejects_invalid_payloads(self):
        for payload in [None, {}, {"image": ""}, {"image": "not-a-data-url"}, {"image": "data:image/png;base64,!!!"}]:
            res = self.client.post("/predict", json=payload)
            self.assertEqual(res.status_code, 400)
            self.assertIn("error", res.get_json())

    def test_predict_succeeds_and_does_not_write_processed_digit_file(self):
        self.assertFalse(os.path.exists("processed_digit.png"))

        res = self.client.post("/predict", json={"image": make_drawn_digit_data_url("7")})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertIn("digit", data)
        self.assertIn("confidence", data)
        self.assertIn("margin", data)
        self.assertIn("threat", data)
        self.assertIn("threat_score", data)
        self.assertIsInstance(data["top3"], list)
        self.assertEqual(len(data["top3"]), 3)

        self.assertFalse(os.path.exists("processed_digit.png"))

    def test_attack_rejects_invalid_epsilon(self):
        img = make_drawn_digit_data_url("7")
        for bad_eps in [-0.1, 0.99, "invalid"]:
            res = self.client.post("/attack", json={"image": img, "epsilon": bad_eps})
            self.assertEqual(res.status_code, 400)
            self.assertIn("error", res.get_json())

    def test_attack_returns_metrics_and_visual_diff_images(self):
        res = self.client.post("/attack", json={"image": make_drawn_digit_data_url("7"), "epsilon": 0.35})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        for key in [
            "original_digit",
            "original_confidence",
            "attacked_digit",
            "attacked_confidence",
            "epsilon",
            "threat",
            "threat_score",
            "attack_success",
            "original_image",
            "attacked_image",
            "perturbation_image",
        ]:
            self.assertIn(key, data)

        self.assertTrue(data["original_image"].startswith("data:image/png;base64,"))
        self.assertTrue(data["attacked_image"].startswith("data:image/png;base64,"))
        self.assertTrue(data["perturbation_image"].startswith("data:image/png;base64,"))


if __name__ == "__main__":
    unittest.main()
