"""
生成应用图标（黑白点阵风格，呼应画布背景）
运行：python scripts/make-icon.py
输出：src-tauri/icon.png（1024x1024，Tauri CLI 会据此生成全套尺寸与 .ico）

纯标准库实现，不依赖 Pillow。
"""
import os
import struct
import zlib

SIZE = 1024
BG = (15, 15, 15)      # #0f0f0f
FG = (238, 238, 238)   # #eeeeee

GRID = 128             # 点阵间距
DOT_R2 = 13 * 13       # 点半径平方


def build_pixels() -> bytes:
    cx = cy = SIZE // 2
    ring_in, ring_out = 190, 250
    raw = bytearray()

    for y in range(SIZE):
        raw.append(0)  # PNG 每行 filter type = 0
        for x in range(SIZE):
            r, g, b = BG

            # 背景点阵
            gx = (x // GRID) * GRID + GRID // 2
            gy = (y // GRID) * GRID + GRID // 2
            if (x - gx) ** 2 + (y - gy) ** 2 <= DOT_R2:
                r, g, b = (70, 70, 70)

            # 中央圆环
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if ring_in * ring_in <= d2 <= ring_out * ring_out:
                r, g, b = FG

            # 圆环内四个方向的短刻度（十字准星感）
            if d2 <= ring_in * ring_in:
                arm_w = 16
                arm_l = 120
                if (abs(x - cx) <= arm_w and abs(y - cy) <= arm_l) or (
                    abs(y - cy) <= arm_w and abs(x - cx) <= arm_l
                ):
                    r, g, b = FG

            raw += bytes((r, g, b))

    return bytes(raw)


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def main() -> None:
    pixels = build_pixels()

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(pixels, 9))
    png += chunk(b"IEND", b"")

    out = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "src-tauri",
        "icon.png",
    )
    with open(out, "wb") as f:
        f.write(png)

    print(f"icon written: {out} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
