from PIL import Image
from collections import deque

path = r"public/assets/pics/forager-clean-wallet.png"
im = Image.open(path).convert("RGBA")
pixels = im.load()
w, h = im.size


def is_bg(r, g, b, a):
    if a == 0:
        return True
    # near-white / light gray cream
    if r >= 200 and g >= 200 and b >= 195 and abs(r - g) <= 18 and abs(g - b) <= 18:
        return True
    # light fringe
    if r >= 185 and g >= 185 and b >= 180 and min(r, g, b) >= 175 and abs(r - g) <= 22:
        return True
    return False


visited = [[False] * w for _ in range(h)]
q = deque()

for x in range(w):
    for y in (0, h - 1):
        q.append((x, y))
        visited[y][x] = True
for y in range(h):
    for x in (0, w - 1):
        if not visited[y][x]:
            q.append((x, y))
            visited[y][x] = True

while q:
    x, y = q.popleft()
    r, g, b, a = pixels[x, y]
    if not is_bg(r, g, b, a):
        continue
    pixels[x, y] = (r, g, b, 0)
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
            visited[ny][nx] = True
            q.append((nx, ny))

# Soften remaining near-white fringe adjacent to transparent
for y in range(1, h - 1):
    for x in range(1, w - 1):
        r, g, b, a = pixels[x, y]
        if a == 0:
            continue
        if not (r > 175 and g > 175 and b > 170):
            continue
        neighbors = [
            pixels[x + dx, y + dy][3]
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1))
        ]
        if any(n == 0 for n in neighbors):
            whiteness = (r + g + b) / 3
            # kill light edge halo
            if whiteness >= 200:
                pixels[x, y] = (r, g, b, 0)
            elif whiteness >= 185:
                pixels[x, y] = (r, g, b, max(0, a // 3))

# Remove baked-in bright green firefly speckles far from character core
# (keep grass/cloak greens near center-bottom)
cx, cy = w * 0.52, h * 0.55
for y in range(h):
    for x in range(w):
        r, g, b, a = pixels[x, y]
        if a == 0:
            continue
        # isolated lime speckles (fireflies we baked earlier)
        if g > 200 and r < 160 and b < 180 and g - r > 60:
            dist = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if dist > 220:
                # check if tiny isolated blob-ish by looking at neighbors
                same = 0
                for dx in range(-2, 3):
                    for dy in range(-2, 3):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h:
                            rr, gg, bb, aa = pixels[nx, ny]
                            if aa and gg > 200 and rr < 160:
                                same += 1
                if same <= 12:
                    pixels[x, y] = (r, g, b, 0)

im.save(path, "PNG")
left = sum(
    1
    for y in range(h)
    for x in range(w)
    if (lambda p: p[3] > 0 and p[0] > 200 and p[1] > 200 and p[2] > 195)(pixels[x, y])
)
print("remaining near-white", left)
print("corner", pixels[0, 0], pixels[w - 1, h - 1])
