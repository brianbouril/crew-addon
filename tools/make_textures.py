"""Draws the Crew worker textures from scratch (no third-party art). Pure stdlib."""
import struct, zlib, sys, os

def png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(c for p in px[y*w:(y+1)*w] for c in p) for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)

T = (0, 0, 0, 0)
SKIN = (214, 160, 120, 255); SKIN_D = (186, 132, 96, 255)
EYE = (40, 30, 30, 255); MOUTH = (150, 90, 70, 255); HAIR = (90, 60, 35, 255)
HAT = (245, 196, 20, 255); HAT_D = (214, 160, 10, 255)
VEST = (255, 120, 20, 255); VEST_D = (225, 95, 10, 255); STRIPE = (240, 240, 200, 255)
SHIRT = (52, 92, 170, 255); JEANS = (40, 60, 110, 255); JEANS_D = (32, 48, 92, 255)
BOOT = (95, 62, 35, 255); BELT = (70, 45, 25, 255)

def worker(path):
    W = H = 64
    px = [T] * (W * H)
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[y * W + x] = c
    def dot(x, y, c): px[y * W + x] = c
    # head (uv 0,0; 8x8x8)
    rect(0, 0, 32, 16, SKIN)
    rect(24, 8, 32, 16, HAIR)          # back of head
    rect(0, 8, 8, 11, HAIR); rect(16, 8, 24, 11, HAIR)  # sides under the hat
    rect(8, 15, 16, 16, SKIN_D)        # jaw shade
    dot(10, 12, EYE); dot(13, 12, EYE)
    rect(11, 14, 13, 15, MOUTH)
    # hard hat layer (uv 32,0; inflated head box): top + upper rows of every side
    rect(40, 0, 48, 8, HAT)
    rect(32, 8, 64, 11, HAT)
    rect(32, 11, 64, 12, HAT_D)        # brim line
    rect(42, 9, 46, 10, HAT_D)         # ridge on front
    # body (uv 16,16; 8x12x4): hi-vis vest
    rect(16, 16, 40, 32, VEST)
    rect(20, 16, 28, 20, VEST_D); rect(28, 16, 36, 20, BELT)  # top / bottom faces
    rect(16, 26, 40, 28, STRIPE)       # reflective stripe
    rect(23, 20, 25, 26, SHIRT)        # shirt showing at the vest opening (front)
    rect(16, 31, 40, 32, BELT)
    # right arm (uv 40,16; 4x12x4)
    rect(40, 16, 56, 32, SHIRT)
    rect(40, 28, 56, 32, SKIN); rect(48, 16, 52, 20, SKIN)
    # left arm (uv 32,48)
    rect(32, 48, 48, 64, SHIRT)
    rect(32, 60, 48, 64, SKIN); rect(40, 48, 44, 52, SKIN)
    # right leg (uv 0,16)
    rect(0, 16, 16, 32, JEANS)
    rect(4, 16, 8, 20, JEANS_D)
    rect(0, 29, 16, 32, BOOT); rect(8, 16, 12, 20, BOOT)
    # left leg (uv 16,48)
    rect(16, 48, 32, 64, JEANS)
    rect(20, 48, 24, 52, JEANS_D)
    rect(16, 61, 32, 64, BOOT); rect(24, 48, 28, 52, BOOT)
    png(path, W, H, px)

def stake(path):
    W = H = 16
    px = [T] * (W * H)
    WOOD = (140, 95, 50, 255); WOOD_D = (100, 65, 35, 255); FLAG = (255, 120, 20, 255); FLAG_D = (220, 90, 10, 255)
    for i in range(3, 15):            # diagonal stick, bottom-left to top-right
        x, y = i - 1, 16 - i
        px[y * W + x] = WOOD
        if x + 1 < W: px[y * W + x + 1] = WOOD_D
    for y in range(1, 6):              # flag near the top
        for x in range(9, 15 - (y - 1) // 2):
            px[y * W + x] = FLAG if (x + y) % 3 else FLAG_D
    png(path, W, H, px)

def icon(path):
    W = H = 64
    px = [(40, 46, 60, 255)] * (W * H)
    def rect(x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[y * W + x] = c
    rect(16, 18, 48, 50, SKIN)          # face
    rect(12, 10, 52, 22, HAT); rect(8, 20, 56, 24, HAT_D)  # hard hat
    rect(22, 30, 28, 36, EYE); rect(36, 30, 42, 36, EYE)
    rect(26, 42, 38, 45, MOUTH)
    rect(12, 50, 52, 64, VEST); rect(12, 56, 52, 59, STRIPE)
    png(path, W, H, px)

if __name__ == "__main__":
    root = sys.argv[1]
    worker(os.path.join(root, "crew_rp/textures/entity/crew_worker.png"))
    stake(os.path.join(root, "crew_rp/textures/items/crew_survey_stake.png"))
    icon(os.path.join(root, "crew_rp/pack_icon.png"))
    icon(os.path.join(root, "crew_bp/pack_icon.png"))
    print("textures written")
