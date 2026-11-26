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
        self.assertIn("pgdStepsSlider", body)
        self.assertIn("targetDigitGroup", body)
        self.assertIn("toggleWebShield()", body)
        self.assertNotIn("Coming Online", body)
        with self.client.get("/static/script.js") as script_res:
            self.assertEqual(script_res.status_code, 200)
            script_text = script_res.get_data(as_text=True)
            self.assertIn("function toggleWebShield", script_text)
            self.assertIn("function selectVillain", script_text)
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
        self.assertEqual(data["shield"], {"enabled": False})

    def test_predict_rejects_non_boolean_shield(self):
        res = self.client.post("/predict", json={"image": make_drawn_digit_data_url("0"), "shield": "yes"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    def test_predict_with_web_shield_clean_digit(self):
        res = self.client.post("/predict", json={"image": make_drawn_digit_data_url("0"), "shield": True})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["shield"]["enabled"])
        self.assertFalse(data["shield"]["anomaly_detected"])
        self.assertEqual(data["shield"]["defended_digit"], 0)
        self.assertTrue(data["shield"]["defended_image"].startswith("data:image/png;base64,"))

    def test_attack_rejects_invalid_attack_type_steps_and_target(self):
        img = make_drawn_digit_data_url("0")
        bad_payloads = [
            {"image": img, "attack_type": "unknown"},
            {"image": img, "attack_type": "pgd", "steps": 1},
            {"image": img, "attack_type": "pgd", "steps": 99},
            {"image": img, "attack_type": "pgd", "steps": "ten"},
            {"image": img, "attack_type": "targeted", "target_digit": 12},
            {"image": img, "attack_type": "targeted", "target_digit": "3"},
        ]
        for payload in bad_payloads:
            res = self.client.post("/attack", json=payload)
            self.assertEqual(res.status_code, 400)
            self.assertIn("error", res.get_json())

    def test_attack_pgd_doc_ock_executes_iterative_attack(self):
        res = self.client.post(
            "/attack",
            json={
                "image": make_drawn_digit_data_url("0"),
                "attack_type": "pgd",
                "epsilon": 0.25,
                "steps": 8,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["attack_type"], "pgd")
        self.assertEqual(data["villain"], "Doc Ock (PGD)")
        self.assertEqual(data["steps"], 8)
        self.assertIsNone(data["target_digit"])
        self.assertFalse(data["target_hit"])
        self.assertTrue(data["perturbation_image"].startswith("data:image/png;base64,"))

    def test_attack_targeted_mysterio_reports_target_metadata(self):
        res = self.client.post(
            "/attack",
            json={
                "image": make_drawn_digit_data_url("0"),
                "attack_type": "targeted",
                "epsilon": 0.35,
                "steps": 12,
                "target_digit": 3,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["attack_type"], "targeted")
        self.assertEqual(data["villain"], "Mysterio (Target #3)")
        self.assertEqual(data["target_digit"], 3)
        self.assertEqual(data["steps"], 12)
        self.assertIsInstance(data["target_hit"], bool)

    def test_attack_noise_electro_with_web_shield(self):
        res = self.client.post(
            "/attack",
            json={
                "image": make_drawn_digit_data_url("0"),
                "attack_type": "noise",
                "epsilon": 0.25,
                "shield": True,
            },
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["attack_type"], "noise")
        self.assertEqual(data["villain"], "Electro (Noise)")
        self.assertTrue(data["shield"]["enabled"])
        self.assertTrue(data["shield"]["defended_image"].startswith("data:image/png;base64,"))

    def test_attack_with_web_shield_neutralizes_fgsm(self):
        res = self.client.post(
            "/attack",
            json={"image": make_drawn_digit_data_url("0"), "epsilon": 0.25, "shield": True},
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        self.assertEqual(data["original_digit"], 0)
        self.assertTrue(data["raw_attack_success"])
        self.assertFalse(data["attack_success"])
        self.assertTrue(data["shield"]["enabled"])
        self.assertTrue(data["shield"]["attack_neutralized"])
        self.assertTrue(data["shield"]["recovered"])
        self.assertEqual(data["shield"]["defended_digit"], 0)
        self.assertTrue(data["shield"]["defended_image"].startswith("data:image/png;base64,"))


if __name__ == "__main__":
    unittest.main()
