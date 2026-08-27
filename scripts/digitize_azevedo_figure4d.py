#!/usr/bin/env python3
"""Digitize coarse class envelopes from the CC BY Azevedo Figure 4D JPEG.

This optional provenance tool is not part of the browser build. It deliberately
reports publisher-figure-derived medians/envelopes, not raw experimental data.
The expected input is the 3000 x 3498 eLife Figure 4 source image whose SHA-256
is recorded in the derived JSON artifact.
"""

import argparse
import json
import math
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover - optional research dependency
    raise SystemExit("Pillow is required: python -m pip install Pillow") from exc


PANEL_CROP = (0, 2048, 1400, 3498)
X_AXIS = (276, 1322)  # 1 to 60 spikes on a log10 axis, in cropped pixels
Y_AXIS = (218, 1118)  # 40 to 0.1 micronewtons on a log10 axis
SPIKE_BINS = {
    "fast": [1, 1.5, 2, 3, 5, 8, 10, 15],
    "intermediate": [1, 1.5, 2, 3, 5, 8, 10, 15, 20, 30],
    "slow": [5, 8, 10, 15, 20, 30, 40],
}


def is_trace(pixel, class_name):
    red, green, blue = pixel
    if class_name == "fast":
        return blue > red + 45 and blue > green + 25 and blue > 105 and red < 150
    if class_name == "intermediate":
        return red > green + 55 and blue > green + 25 and red > 130 and blue > 80
    return green > red + 55 and green > blue + 15 and green > 100


def spike_to_x(spikes):
    left, right = X_AXIS
    return left + math.log10(spikes) / math.log10(60) * (right - left)


def y_to_force(y):
    top, bottom = Y_AXIS
    log_force = math.log10(40) + (y - top) / (bottom - top) * (math.log10(0.1) - math.log10(40))
    return 10**log_force


def quantile(values, fraction):
    ordered = sorted(values)
    return ordered[int((len(ordered) - 1) * fraction)]


def digitize(image):
    panel = image.crop(PANEL_CROP).convert("RGB")
    points = {name: [] for name in SPIKE_BINS}
    for class_name, bins in SPIKE_BINS.items():
        for spikes in bins:
            center_x = spike_to_x(spikes)
            values = []
            for x in range(max(X_AXIS[0], int(center_x - 9)), min(X_AXIS[1] + 1, int(center_x + 10))):
                for y in range(Y_AXIS[0], Y_AXIS[1] + 1):
                    # Remove colored panel labels without discarding the trace
                    # regions used at the same x coordinates.
                    if class_name == "fast" and y > 560:
                        continue
                    if class_name == "intermediate" and x < 700 and y < 740:
                        continue
                    if class_name == "slow" and x < 580:
                        continue
                    if is_trace(panel.getpixel((x, y)), class_name):
                        values.append(y_to_force(y))
            if len(values) < 5:
                continue
            points[class_name].append({
                "spikes": spikes,
                "medianMicroNewtons": round(quantile(values, 0.5), 4),
                "coloredPixelP10MicroNewtons": round(quantile(values, 0.1), 4),
                "coloredPixelP90MicroNewtons": round(quantile(values, 0.9), 4),
                "coloredPixelCount": len(values),
            })
    return points


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path, help="downloaded eLife Figure 4 JPEG")
    args = parser.parse_args()
    image = Image.open(args.image)
    if image.size != (3000, 3498):
        raise SystemExit(f"unexpected source dimensions {image.size}; expected 3000 x 3498")
    print(json.dumps(digitize(image), indent=2))


if __name__ == "__main__":
    main()

