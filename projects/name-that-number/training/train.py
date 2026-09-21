"""Trains a small neural network on MNIST and exports it as model.js for the site.

Network: 784 inputs (28x28 pixels) -> 32 ReLU -> 16 ReLU -> 10 softmax.
Training images are randomly rotated/scaled/shifted/thickened so the network
copes with digits drawn with a mouse.
"""

import base64
import gzip
import json
import sys
import time

import numpy as np

DATA = sys.argv[1]
OUT = sys.argv[2]
rng = np.random.default_rng(7)


def load_images(name):
    with gzip.open(f"{DATA}/{name}", "rb") as f:
        raw = f.read()
    return np.frombuffer(raw, np.uint8, offset=16).reshape(-1, 28, 28).astype(np.float32) / 255.0


def load_labels(name):
    with gzip.open(f"{DATA}/{name}", "rb") as f:
        raw = f.read()
    return np.frombuffer(raw, np.uint8, offset=8).astype(np.int64)


x_train = load_images("train-images-idx3-ubyte.gz")
y_train = load_labels("train-labels-idx1-ubyte.gz")
x_test = load_images("t10k-images-idx3-ubyte.gz")
y_test = load_labels("t10k-labels-idx1-ubyte.gz")
print("train", x_train.shape, "test", x_test.shape)

# ---- augmentation ----------------------------------------------------------

grid_y, grid_x = np.mgrid[0:28, 0:28].astype(np.float32)
grid_x -= 13.5
grid_y -= 13.5


def augment(images):
    b = len(images)
    angle = rng.uniform(-0.22, 0.22, (b, 1, 1))
    scale = rng.uniform(0.85, 1.12, (b, 1, 1))
    shear = rng.uniform(-0.15, 0.15, (b, 1, 1))
    tx = rng.uniform(-2.5, 2.5, (b, 1, 1))
    ty = rng.uniform(-2.5, 2.5, (b, 1, 1))
    cos, sin = np.cos(angle), np.sin(angle)

    # where each output pixel comes from in the original image
    x = grid_x - tx
    y = grid_y - ty
    sx = (cos * x + sin * y) / scale + shear * y + 13.5
    sy = (-sin * x + cos * y) / scale + 13.5

    x0 = np.floor(sx).astype(np.int64)
    y0 = np.floor(sy).astype(np.int64)
    fx = sx - x0
    fy = sy - y0
    batch = np.arange(b)[:, None, None]

    def pixel(yy, xx):
        inside = (xx >= 0) & (xx < 28) & (yy >= 0) & (yy < 28)
        return images[batch, np.clip(yy, 0, 27), np.clip(xx, 0, 27)] * inside

    out = (
        pixel(y0, x0) * (1 - fx) * (1 - fy)
        + pixel(y0, x0 + 1) * fx * (1 - fy)
        + pixel(y0 + 1, x0) * (1 - fx) * fy
        + pixel(y0 + 1, x0 + 1) * fx * fy
    )

    # thicken some strokes (mouse drawings are often bolder than MNIST)
    thick = rng.random(b) < 0.35
    if thick.any():
        t = out[thick]
        grown = t.copy()
        grown[:, 1:, :] = np.maximum(grown[:, 1:, :], t[:, :-1, :] * 0.8)
        grown[:, :, 1:] = np.maximum(grown[:, :, 1:], t[:, :, :-1] * 0.8)
        out[thick] = grown

    return np.clip(out, 0, 1).astype(np.float32)


# ---- network ---------------------------------------------------------------

sizes = [784, 32, 16, 10]
params = []
for n_in, n_out in zip(sizes[:-1], sizes[1:]):
    w = rng.normal(0, np.sqrt(2 / n_in), (n_out, n_in)).astype(np.float32)
    b = np.zeros(n_out, np.float32)
    params += [w, b]


def forward(p, x):
    w1, b1, w2, b2, w3, b3 = p
    h1 = np.maximum(0, x @ w1.T + b1)
    h2 = np.maximum(0, h1 @ w2.T + b2)
    logits = h2 @ w3.T + b3
    return h1, h2, logits


def accuracy(p, x, y):
    return float((forward(p, x.reshape(len(x), -1))[2].argmax(1) == y).mean())


m = [np.zeros_like(q) for q in params]
v = [np.zeros_like(q) for q in params]
beta1, beta2, eps = 0.9, 0.999, 1e-8
step = 0
epochs = 24
batch_size = 128
start = time.time()

for epoch in range(epochs):
    lr = 2e-3 * (0.5 * (1 + np.cos(np.pi * epoch / epochs)))  # cosine decay
    order = rng.permutation(len(x_train))
    total_loss = 0.0
    for i in range(0, len(order), batch_size):
        idx = order[i : i + batch_size]
        xb = augment(x_train[idx]).reshape(len(idx), -1)
        yb = y_train[idx]

        w1, b1, w2, b2, w3, b3 = params
        h1, h2, logits = forward(params, xb)
        logits = logits - logits.max(1, keepdims=True)
        probs = np.exp(logits)
        probs /= probs.sum(1, keepdims=True)
        total_loss += -np.log(probs[np.arange(len(yb)), yb] + 1e-12).sum()

        d3 = probs
        d3[np.arange(len(yb)), yb] -= 1
        d3 /= len(yb)
        gw3 = d3.T @ h2
        gb3 = d3.sum(0)
        d2 = (d3 @ w3) * (h2 > 0)
        gw2 = d2.T @ h1
        gb2 = d2.sum(0)
        d1 = (d2 @ w2) * (h1 > 0)
        gw1 = d1.T @ xb
        gb1 = d1.sum(0)
        grads = [gw1 + 1e-5 * w1, gb1, gw2 + 1e-5 * w2, gb2, gw3 + 1e-5 * w3, gb3]

        step += 1
        for k in range(len(params)):
            m[k] = beta1 * m[k] + (1 - beta1) * grads[k]
            v[k] = beta2 * v[k] + (1 - beta2) * grads[k] ** 2
            mh = m[k] / (1 - beta1**step)
            vh = v[k] / (1 - beta2**step)
            params[k] -= (lr * mh / (np.sqrt(vh) + eps)).astype(np.float32)

    print(
        f"epoch {epoch + 1:2d}  loss {total_loss / len(order):.4f}  "
        f"test {accuracy(params, x_test, y_test):.4f}  "
        f"augmented test {accuracy(params, augment(x_test[:5000]), y_test[:5000]):.4f}  "
        f"({time.time() - start:.0f}s)"
    )

# ---- export ----------------------------------------------------------------

# Quantize weights to 8-bit integers (one scale per layer) to keep the file small.
quantized = []
q_params = []
for layer in range(3):
    w, b = params[2 * layer], params[2 * layer + 1]
    scale = float(np.abs(w).max() / 127)
    q = np.round(w / scale).astype(np.int8)
    quantized.append(
        {
            "inputs": int(w.shape[1]),
            "outputs": int(w.shape[0]),
            "scale": scale,
            "weights": base64.b64encode(q.tobytes()).decode(),
            "biases": [round(float(x), 5) for x in b],
        }
    )
    q_params += [q.astype(np.float32) * scale, b]

float_acc = accuracy(params, x_test, y_test)
quant_acc = accuracy(q_params, x_test, y_test)
print(f"test accuracy: float {float_acc:.4f}, 8-bit {quant_acc:.4f}")

# Example digits for the "show me an example" button: 3 confident, correct ones per digit.
_, _, logits = forward(q_params, x_test.reshape(len(x_test), -1))
probs = np.exp(logits - logits.max(1, keepdims=True))
probs /= probs.sum(1, keepdims=True)
examples = []
for digit in range(10):
    good = np.where((y_test == digit) & (probs.argmax(1) == digit) & (probs.max(1) > 0.97))[0][:3]
    for i in good:
        examples.append(base64.b64encode((x_test[i] * 255).round().astype(np.uint8).tobytes()).decode())

# A few test images with the model's exact outputs, so the JavaScript version can be checked against Python.
check = []
for i in range(5):
    check.append(
        {
            "pixels": base64.b64encode((x_test[i] * 255).round().astype(np.uint8).tobytes()).decode(),
            "probabilities": [round(float(x), 6) for x in probs[i]],
        }
    )

model = {"sizes": sizes, "testAccuracy": round(quant_acc, 4), "layers": quantized, "examples": examples, "check": check}

with open(OUT, "w") as f:
    f.write("// The trained neural network for Name that Number, made by a Python training\n")
    f.write("// script (784 inputs -> 32 -> 16 -> 10 outputs, trained on the MNIST digits).\n")
    f.write("// Weights are stored as 8-bit numbers in base64 to keep this file small.\n")
    f.write("// You don't need to edit this file.\n")
    f.write("const MODEL = ")
    f.write(json.dumps(model, separators=(",", ":")))
    f.write(";\n")

print("wrote", OUT)
