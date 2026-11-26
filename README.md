# 🕷 Spider-Sense AI

**Neural Threat Intelligence Console & Interactive Adversarial ML Playground**

Spider-Sense AI is a Flask + TensorFlow web application built around the **WebWeave v1** console design. It turns handwritten digit classification into a live **Red-Team vs. Blue-Team AI Security sandbox**, demonstrating how neural networks assess prediction confidence, how gradient-based adversarial attacks (FGSM) fool models, and how perturbations look in real time.

---

## Key Features

- **Project Pulse (Live Status Telemetry)**
  - Real-time status cards for `Threat Level`, `Threat Score`, `Web Shield` state, and `Current Villain`.
- **Project Neural Scanner**
  - Interactive `280×280` HTML5 drawing canvas (mouse + touch support) with scaled coordinate mapping.
  - Live Scanner HUD tracking `Ink Coverage`, `Input Status`, `Neural Link`, `Observation Quality`, and `Analysis Ready` gating.
  - MNIST-aligned in-memory preprocessing (`20×20` bounding-box crop and `28×28` centering).
- **Project Oracle (Threat Intelligence)**
  - Evaluates top prediction, confidence percentage, top-2 decision margin, and top-3 class probabilities.
  - Generates dynamic Oracle verdicts and actionable recommendations.
- **Multi-Villain Attack Arsenal (`/attack`)**
  - **Green Goblin (`fgsm`)**: Single-step $L_\infty$ Fast Gradient Sign Method perturbation using `tf.GradientTape`.
  - **Doc Ock (`pgd`)**: Iterative Projected Gradient Descent (`steps = 2–20`, $L_\infty$-bounded) with random initialization jitter for stronger boundary evasion.
  - **Mysterio (`targeted`)**: Targeted iterative PGD minimizing cross-entropy toward a chosen `target_digit` (`0–9`).
  - **Electro (`noise`)**: Non-gradient Gaussian + sparse impulse noise stress test.
  - Returns a continuous perturbation heatmap, clean vs. adversarial confidence meters, and (when armed) **Web Shield Restored** visual diff.
- **Web Shield Defense Engine (Active Toggle)**
  - Implements **Feature Squeezing** (background perturbation haze suppression + `3×3` median spatial smoothing) and **L1 Probability Divergence** anomaly detection.
  - Compares unshielded vs. sanitized predictions live in Oracle and Operation Archive, neutralizing or quarantining FGSM attacks.
- **WebWeave Acrylic HUD (UI/UX)**
  - Dual-tone `#A15555` × `#59629E` atmospheric backdrop with geometric web lattice and tactile acrylic micro-grain overlay.
  - See-through frosted acrylic panels (`backdrop-filter: blur(16px)`), monochrome vector HUD icons, scanner corner reticle with sweep animation, confidence meter bars, and color-coded `Operation Archive` subsystem tags.
  - Custom icon specifications documented in [docs/ICON_DESIGN_GUIDE.md](docs/ICON_DESIGN_GUIDE.md).
- **Project Archive (Operation Archive)**
  - Timestamped live event log capturing scanner events, classifications, verdicts, and attack outcomes.
- **Security Hardening**
  - In-memory image decoding & preprocessing (no shared disk overwrites).
  - `2 MB` request cap (`413` handling), `4M` pixel PIL decompression-bomb guard, strict base64 data-URL validation, per-IP sliding-window rate limiting, HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), and XSS-safe DOM rendering (`textContent`).

---

## Project Structure

```text
Spider-Sense AI/
├── app.py                     # Flask backend, preprocessing, /predict & /attack (FGSM)
├── spider_sense_model.keras   # Trained 28x28x1 CNN digit classifier
├── requirements.txt           # Python dependencies
├── templates/
│   └── index.html             # WebWeave v1 Threat Intelligence Console
├── static/
│   ├── script.js              # Canvas capture, HUD telemetry, Pulse sync, Oracle & Archive
│   ├── style.css              # WebWeave acrylic HUD (#A15555 x #59629E)
│   └── images/
│       └── icons/             # Drop-in directory for custom SVG HUD icons
├── docs/
│   └── ICON_DESIGN_GUIDE.md   # Specifications & checklist for custom icon design
├── uploads/                   # Reserved for future image-upload defense workflows
└── tests/
    └── test_app.py            # Automated Flask, security header, validation & FGSM tests
```

---

## Local Setup & Run

### 1. Create & Activate Virtual Environment

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Run the Application

```powershell
# Standard run (debug off by default for safety)
python app.py
```

For local development with Flask debug mode enabled:

```powershell
$env:FLASK_DEBUG="1"
python app.py
```

Open `http://127.0.0.1:5000` in your browser.

---

## Running Tests

```powershell
.\venv\Scripts\python.exe -m unittest discover -s tests -v
```

---

## Roadmap

- [x] **Web Shield Defense (Phase 1)**: Feature squeezing, background haze suppression & L1 divergence anomaly detector.
- [x] **Multi-Villain Attack Suite**: Green Goblin (FGSM), Doc Ock (Iterative PGD), Mysterio (Targeted PGD), and Electro (Noise Stress).
- [ ] **Web Shield Defense (Phase 2)**: Adversarially trained hardened model toggle (`train.py`).
- [ ] **CLI Evaluation Suite**: Automated clean vs. adversarial vs. shielded benchmark scorecard (`evaluate.py`).
- [ ] **Real-World Image Upload Mode**: Extend beyond `28×28` canvas digits to uploaded real-world vision benchmarks.
