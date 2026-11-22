# -*- coding: utf-8 -*-
"""Prépare les images et la vidéo du site vitrine (website/img/).

Sources : captures iPhone de l'éditeur (Téléchargements\\IMG_95xx.PNG, compte de démonstration « Léa »)
et la vidéo promo Videos\\YUMIA-promo\\yumia-tout-en-un-gratuit.mp4.
Usage : python scripts/site-vitrine-assets.py
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "website", "img")
CAPS = r"C:\Users\DELL\Downloads"
PROMO = r"C:\Users\DELL\Videos\YUMIA-promo\yumia-tout-en-un-gratuit.mp4"
LOGO = os.path.join(ROOT, "website", "logo.png")
FFMPEG = (r"C:\Users\DELL\AppData\Local\Programs\Python\Python311\Lib\site-packages"
          r"\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe")
F_BLACK = r"C:\Windows\Fonts\seguibl.ttf"
F_SEMI = r"C:\Windows\Fonts\seguisb.ttf"
F_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"

SCREENS = {  # nom du fichier web -> capture
    "accueil": "9582", "carte": "9575", "carte-rayon": "9576", "itineraire": "9589", "fiche-lieu": "9588",
    "passeport": "9587", "assistant": "9586", "desserts": "9581", "univers": "9580", "formulaire": "9579",
    "fil": "9584", "profil": "9585",
}
CROPS = {  # morceaux agrandis qui « sortent » des téléphones
    "c-rayon": ("9576", (40, 495, 1166, 1110), 640),
    "c-etapes": ("9589", (24, 1530, 1182, 1725), 640),
    "c-etape": ("9589", (24, 1790, 1182, 2622), 520),
    "c-sauvegarder": ("9588", (0, 2338, 1206, 2500), 640),
    "c-passeport": ("9587", (24, 130, 1182, 830), 640),
    "c-question": ("9586", (20, 2068, 600, 2162), 460),
    "c-lieu": ("9581", (40, 300, 1180, 1020), 560),
    "c-tampon": ("9587", (20, 2128, 252, 2382), 260),
}


def clean_battery(shot):
    """Batterie faible (rouge) ou en charge (verte) -> batterie pleine blanche, comme sur les stores."""
    px = shot.load()
    xs, ys = [], []
    for y in range(60, 140):
        for x in range(980, 1120):
            r, g, b = px[x, y][:3]
            if (r > 200 and g < 110 and b < 110) or (g > 160 and r < 140 and b < 140):
                xs.append(x)
                ys.append(y)
    if not xs:
        return shot
    x0, y0, y1 = min(xs), min(ys), max(ys)
    x1 = x0 + 80
    d = ImageDraw.Draw(shot)
    d.rounded_rectangle((x0, y0, x1, y1), radius=(y1 - y0) // 3, fill=(255, 255, 255))
    f = ImageFont.truetype(F_BOLD, 30)
    tb = f.getbbox("100")
    d.text((x0 + (x1 - x0 - (tb[2] - tb[0])) // 2 - tb[0], y0 + (y1 - y0 - (tb[3] - tb[1])) // 2 - tb[1]), "100",
           font=f, fill=(0, 0, 0))
    return shot


_cache = {}


def cap(num):
    if num not in _cache:
        _cache[num] = clean_battery(Image.open(os.path.join(CAPS, f"IMG_{num}.PNG")).convert("RGB"))
    return _cache[num]


def save_webp(img, name, width, q=80):
    h = round(img.height * width / img.width)
    img.resize((width, h), Image.LANCZOS).save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=q, method=6)


def og_image():
    """Image de partage 1200 x 630 (liens sur les réseaux, messageries)."""
    W, H = 1200, 630
    bg = Image.new("RGB", (W, H), (10, 9, 16))
    glow = Image.new("RGB", (W, H), (10, 9, 16))
    d = ImageDraw.Draw(glow)
    d.ellipse((-200, -260, 620, 520), fill=(150, 64, 30))
    d.ellipse((700, 120, 1500, 900), fill=(84, 48, 150))
    bg = Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(160)), 0.75)
    d = ImageDraw.Draw(bg)
    logo = Image.open(LOGO).convert("RGBA").resize((150, 150), Image.LANCZOS)
    bg.paste(logo, (70, 60), logo)
    fb = ImageFont.truetype(F_BLACK, 76)
    d.text((70, 240), "Dis ton envie.", font=fb, fill=(255, 255, 255))
    # 2e ligne en dégradé
    line = "YUMIA trouve."
    tb = fb.getbbox(line)
    mask = Image.new("L", (tb[2] - tb[0] + 10, tb[3] - tb[1] + 20), 0)
    ImageDraw.Draw(mask).text((-tb[0], -tb[1]), line, font=fb, fill=255)
    grad = Image.new("RGB", mask.size)
    gd = ImageDraw.Draw(grad)
    for x in range(mask.width):
        t = x / max(1, mask.width - 1)
        c = [int(a + (b - a) * t) for a, b in zip((232, 98, 26), (139, 79, 214))]
        gd.line((x, 0, x, mask.height), fill=tuple(c))
    bg.paste(grad, (70, 335), mask)
    d.text((72, 450), "Gratuite · Sans pub · iPhone et Android", font=ImageFont.truetype(F_SEMI, 32),
           fill=(200, 198, 214))
    for i, (num, x, y, rot) in enumerate([("9576", 690, 70, 8), ("9582", 860, 40, -4)]):
        s = cap(num).resize((250, round(2622 * 250 / 1206)), Image.LANCZOS).convert("RGBA")
        frame = Image.new("RGBA", (s.width + 16, s.height + 16), (0, 0, 0, 0))
        fd = ImageDraw.Draw(frame)
        fd.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=44, fill=(58, 58, 72, 255))
        m = Image.new("L", s.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, s.width - 1, s.height - 1), radius=36, fill=255)
        frame.paste(s, (8, 8), m)
        frame = frame.rotate(rot, resample=Image.BICUBIC, expand=True)
        sh = Image.new("RGBA", frame.size, (0, 0, 0, 0))
        sh.putalpha(frame.getchannel("A").point(lambda v: int(v * 0.6)))
        bg.paste((0, 0, 0), (x + 14, y + 24), sh.filter(ImageFilter.GaussianBlur(18)).getchannel("A"))
        bg.paste(frame, (x, y), frame)
    bg.save(os.path.join(OUT, "og-yumia.jpg"), "JPEG", quality=88)


def video():
    out = os.path.join(OUT, "yumia-en-20-secondes.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", PROMO, "-vf", "scale=540:960:flags=lanczos",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-profile:v", "high", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", out], check=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", "11.4", "-i", PROMO, "-frames:v", "1",
                    "-vf", "scale=540:960:flags=lanczos", "-c:v", "libwebp", "-quality", "78",
                    os.path.join(OUT, "yumia-en-20-secondes.webp")], check=True)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, num in SCREENS.items():
        save_webp(cap(num), name, 720)
    for name, (num, box, width) in CROPS.items():
        save_webp(cap(num).crop(box), name, width, q=84)
    og_image()
    video()
    total = 0
    for f in sorted(os.listdir(OUT)):
        s = os.path.getsize(os.path.join(OUT, f))
        total += s
        print(f"{f:34s} {s / 1024:8.0f} Ko")
    print(f"{'total':34s} {total / 1024:8.0f} Ko")
