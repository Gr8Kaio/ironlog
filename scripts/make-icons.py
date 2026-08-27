"""Generate the PWA icon set.

Run with: py scripts/make-icons.py

Kept in the repo so the icons can be regenerated rather than being opaque
binaries with no source.
"""

from PIL import Image, ImageDraw

INK = (10, 11, 13)
PANEL = (20, 22, 27)
IRON = (249, 115, 22)

OUT = "public"


def draw_barbell(img: Image.Image, size: int, scale: float = 1.0) -> None:
    """A barbell seen side-on: shaft, inner collars, outer plates."""
    d = ImageDraw.Draw(img)
    cx = cy = size / 2
    unit = size * scale

    shaft_w = unit * 0.46
    shaft_h = unit * 0.075
    d.rounded_rectangle(
        [cx - shaft_w / 2, cy - shaft_h / 2, cx + shaft_w / 2, cy + shaft_h / 2],
        radius=shaft_h / 2,
        fill=IRON,
    )

    # Plates get taller towards the outside, which is what reads as a barbell
    # rather than as a plus sign at 32px.
    for direction in (-1, 1):
        for offset, height, width in (
            (0.255, 0.30, 0.055),
            (0.335, 0.44, 0.065),
        ):
            x = cx + direction * unit * offset
            hh = unit * height / 2
            hw = unit * width / 2
            d.rounded_rectangle(
                [x - hw, cy - hh, x + hw, cy + hh],
                radius=hw * 0.6,
                fill=IRON,
            )


def rounded_icon(size: int, radius_ratio: float, scale: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if radius_ratio > 0:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=size * radius_ratio, fill=PANEL)
    else:
        d.rectangle([0, 0, size, size], fill=PANEL)
    draw_barbell(img, size, scale)
    return img


def main() -> None:
    # Standard icons: rounded panel, generous glyph.
    rounded_icon(192, 0.22, 0.86).save(f"{OUT}/icon-192.png")
    rounded_icon(512, 0.22, 0.86).save(f"{OUT}/icon-512.png")

    # Maskable: full bleed, glyph inside the 80% safe zone so a circular mask
    # cannot clip the plates.
    maskable = Image.new("RGBA", (512, 512), INK)
    ImageDraw.Draw(maskable).rectangle([0, 0, 512, 512], fill=PANEL)
    draw_barbell(maskable, 512, 0.62)
    maskable.save(f"{OUT}/icon-512-maskable.png")

    # iOS home screen: square, opaque, no transparency.
    apple = Image.new("RGB", (180, 180), PANEL)
    draw_barbell(apple, 180, 0.80)
    apple.save(f"{OUT}/apple-touch-icon.png")

    print("wrote icon-192, icon-512, icon-512-maskable, apple-touch-icon")


if __name__ == "__main__":
    main()
