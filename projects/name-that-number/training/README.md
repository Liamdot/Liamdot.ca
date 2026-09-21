# Training the Name that Number network

`train.py` teaches the network to read digits using MNIST (70,000 handwritten
digits) and writes the result to `../model.js`, which the website loads.
Training takes about a minute.

The network is 784 inputs (28×28 pixels) → 32 neurons → 16 neurons → 10 outputs.
While training, each digit is randomly rotated, resized, shifted and sometimes
thickened, so it copes with digits drawn with a mouse.

## Retraining

Run these from this folder (`projects/name-that-number/training`).

**1. Download MNIST** (about 11 MB, one time):

```bash
mkdir -p mnist && for f in train-images-idx3-ubyte train-labels-idx1-ubyte t10k-images-idx3-ubyte t10k-labels-idx1-ubyte; do curl -fL -o "mnist/$f.gz" "https://storage.googleapis.com/cvdf-datasets/mnist/$f.gz"; done
```

**2. Install numpy** in a private Python environment (one time):

```bash
python3 -m venv .venv && .venv/bin/pip install numpy
```

**3. Train** and write a new `model.js`:

```bash
.venv/bin/python train.py mnist ../model.js
```

It prints the accuracy after every round ("epoch"). The last line tells you the
final test accuracy. Then reload the page to try the new network.

## Things to try

All of these are near the top or middle of `train.py`:

- **Bigger network:** change `sizes = [784, 32, 16, 10]`, e.g. `[784, 64, 32, 10]`.
  It gets more accurate, but the diagram gets busier. The page adapts to any sizes
  as long as there are two hidden layers.
- **Train longer:** raise `epochs = 24`.
- **Messier practice digits:** widen the ranges in `augment()` (rotation, scale,
  shift) if drawings are being misread.

The `mnist/` and `.venv/` folders are ignored by git, so they won't be uploaded.
