"""Walt Whitman Bridge (I-76 over the Delaware) for Slop Philadelphia. Self-contained bmesh build.
Game frame: origin C = (2913.0, 5223.3), axis 12.45 deg (u towards NJ), v = (-uz, ux). Blender: X = game x, Y = -game z, Z = up.
Run inside Blender (adds collection 'WWB'); with --export PATH also writes a GLB (headless bpy)."""
import bpy, bmesh, math, sys
from mathutils import Vector
CX, CZ, ANG = 2913.0, 5223.3, math.radians(12.45)
UX, UZ = math.cos(ANG), math.sin(ANG)
UPA, UNJ, GPA, GNJ = -2003.0, 1242.0, 5.8, 1.6       # abutments (OSM way ends) and their ground heights
TW, AN, HW = 305.0, 540.0, 14.6                        # tower / anchorage stations, deck half-width
def deck(u):
    a = abs(u)
    if a <= TW: return 45 + 3 * (1 - (u / TW) ** 2)
    if a <= AN: return 45 - (a - TW) / (AN - TW) * 6
    if u < 0: return GPA + (39 - GPA) * (u - UPA) / (-AN - UPA)
    return GNJ + (39 - GNJ) * (UNJ - u) / (UNJ - AN)
def W(u, v, z):  # frame -> Blender world
    x = CX + u * UX - v * UZ; gz = CZ + u * UZ + v * UX
    return Vector((x, -gz, z))
MATS = {}
def mat(name, rgb, rough=0.7, metal=0.0, emit=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF'); c = [((int(rgb[i:i+2], 16) / 255) ** 2.2) for i in (1, 3, 5)]
    b.inputs['Base Color'].default_value = (*c, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*[((int(emit[i:i+2], 16) / 255) ** 2.2) for i in (1, 3, 5)], 1); b.inputs['Emission Strength'].default_value = 1.0
    MATS[name] = m; return m
BM = {}
def bm(name):
    if name not in BM: BM[name] = bmesh.new()
    return BM[name]
def box(m, u0, u1, v0, v1, z00, z01, z10=None, z11=None, zt0=None, zt1=None):
    """Prism along u: bottom z00 (at u0) .. z01 (at u1); top zt0 .. zt1 (defaults: z10, z11 are top heights)."""
    b = bm(m); t0 = z10 if zt0 is None else zt0; t1 = z11 if zt1 is None else zt1
    P = [W(u0, v0, z00), W(u1, v0, z01), W(u1, v1, z01), W(u0, v1, z00), W(u0, v0, t0), W(u1, v0, t1), W(u1, v1, t1), W(u0, v1, t0)]
    vs = [b.verts.new(p) for p in P]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        try: b.faces.new([vs[i] for i in f])
        except ValueError: pass
def bar(m, p, q, t):
    """Square-section member between frame points p=(u,v,z), q, thickness t."""
    b = bm(m); a = W(*p); c = W(*q); d = (c - a)
    if d.length < 1e-6: return
    d.normalize(); up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
    s = d.cross(up).normalized() * t / 2; n = d.cross(s).normalized() * t / 2
    vs = [b.verts.new(o + sx * s + sy * n) for o in (a, c) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
        b.faces.new([vs[i] for i in f])
def build():
    mat('WWB_Asphalt', '#3b3c40', 0.9); mat('WWB_Concrete', '#b7b0a2', 0.85); mat('WWB_Steel', '#4a7d6c', 0.5, 0.35); mat('WWB_Paint', '#d9d7cf', 0.7); mat('WWB_PaintY', '#c9a336', 0.7)
    mat('WWB_Cable_Glow', '#fff1cf', 0.4, 0, '#ffe2a8'); mat('WWB_Aviation_Glow', '#ff3a2a', 0.4, 0, '#ff2a1a'); mat('WWB_Lamp_Glow', '#fff4dc', 0.4, 0, '#fff0d0')
    S = 10.0; us = []; u = UPA
    while u < UNJ - 1e-6: us.append(u); u = min(UNJ, u + S)
    us.append(UNJ)
    for a, b in zip(us, us[1:]):
        za, zb = deck(a), deck(b)
        box('WWB_Asphalt', a, b, -HW + 0.5, HW - 0.5, za - 0.12, zb - 0.12, zt0=za, zt1=zb)             # roadway
        box('WWB_Concrete', a, b, -HW, HW, za - 0.75, zb - 0.75, zt0=za - 0.12, zt1=zb - 0.12)            # slab
        for s in (-1, 1): box('WWB_Concrete', a, b, s * HW - 0.25 if s > 0 else -HW - 0.0, s * HW if s > 0 else -HW + 0.25, za - 0.1, zb - 0.1, zt0=za + 0.95, zt1=zb + 0.95)   # parapets
        box('WWB_Concrete', a, b, -0.3, 0.3, za - 0.02, zb - 0.02, zt0=za + 0.82, zt1=zb + 0.82)          # median barrier
        for v in (-13.3, 13.3): box('WWB_Paint', a, b, v - 0.08, v + 0.08, za + 0.0, zb + 0.0, zt0=za + 0.025, zt1=zb + 0.025)
        for v in (-0.75, 0.75): box('WWB_PaintY', a, b, v - 0.08, v + 0.08, za, zb, zt0=za + 0.025, zt1=zb + 0.025)
        for v in (-9.4, -5.1, 5.1, 9.4):                                                                  # dashed lane lines (3 m on, 7 m off)
            f = 3.0 / max(b - a, 1e-6); zm = za + (zb - za) * f
            box('WWB_Paint', a, a + 3.0, v - 0.07, v + 0.07, za, zm, zt0=za + 0.025, zt1=zm + 0.025)
    # ---- suspended structure: stiffening trusses, floor beams, cables, suspenders
    P = 10.0; n = int(2 * AN / P)
    for s in (-1, 1):
        v = s * 12.6
        for i in range(n):
            a = -AN + i * P; b = a + P; za, zb = deck(a) - 0.75, deck(b) - 0.75
            bar('WWB_Steel', (a, v, za - 0.3), (b, v, zb - 0.3), 0.55); bar('WWB_Steel', (a, v, za - 6.3), (b, v, zb - 6.3), 0.55)
            bar('WWB_Steel', (a, v, za - 0.3), (a, v, za - 6.3), 0.32)
            if i % 2 == 0: bar('WWB_Steel', (a, v, za - 6.3), (b, v, zb - 0.3), 0.3)
            else: bar('WWB_Steel', (a, v, za - 0.3), (b, v, zb - 6.3), 0.3)
    for i in range(n + 1):
        a = -AN + i * P; z = deck(a) - 0.75
        bar('WWB_Steel', (a, -12.6, z - 0.9), (a, 12.6, z - 0.9), 0.5)
        if i % 3 == 0: bar('WWB_Steel', (a, -12.6, z - 6.3), (a, 12.6, z - 6.3), 0.35)
    TOP = 113.0
    def cable(u):
        a = abs(u)
        if a <= TW: lo = deck(0) + 3.5; return lo + (TOP - lo) * (u / TW) ** 2
        t = (a - TW) / (AN - TW); end = deck(AN) + 2.0; return TOP + (end - TOP) * t - 9.0 * math.sin(math.pi * t) * 0.9
    for s in (-1, 1):
        v = s * 13.9; prev = None; i = 0
        for k in range(int(2 * AN / 5) + 1):
            u = -AN + k * 5.0; p = (u, v, cable(u))
            if prev: bar('WWB_Steel', prev, p, 0.62)
            prev = p
            if k % 2 == 0 and abs(abs(u) - TW) > 6 and abs(u) < AN - 8:
                if cable(u) - deck(u) > 1.6: bar('WWB_Steel', (u, v, deck(u) - 0.6), (u, v, cable(u)), 0.09)
                if k % 4 == 0: box('WWB_Cable_Glow', u - 0.16, u + 0.16, v - 0.16, v + 0.16, cable(u) + 0.36, cable(u) + 0.36, zt0=cable(u) + 0.68, zt1=cable(u) + 0.68)
    # ---- towers: two steel legs, portal struts above and below the deck, concrete piers in the river
    for tu in (-TW, TW):
        dz = deck(tu)
        box('WWB_Concrete', tu - 7, tu + 7, -21, 21, -6, -6, zt0=7.5, zt1=7.5)
        for s in (-1, 1):
            v = s * 16.4; segs = [(7.5, 2.9), (dz - 8, 2.6), (72, 2.3), (TOP + 2, 2.0)]
            for (z0, h0), (z1, h1) in zip(segs, segs[1:]):
                b = bm('WWB_Steel'); P8 = [W(tu - h0, v - h0 * 0.8, z0), W(tu + h0, v - h0 * 0.8, z0), W(tu + h0, v + h0 * 0.8, z0), W(tu - h0, v + h0 * 0.8, z0), W(tu - h1, v - h1 * 0.8, z1), W(tu + h1, v - h1 * 0.8, z1), W(tu + h1, v + h1 * 0.8, z1), W(tu - h1, v + h1 * 0.8, z1)]
                vs = [b.verts.new(p) for p in P8]
                for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]: b.faces.new([vs[i] for i in f])
            box('WWB_Steel', tu - 2.6, tu + 2.6, v - 2.2, v + 2.2, TOP + 2, TOP + 2, zt0=TOP + 3.4, zt1=TOP + 3.4)       # saddle housing
            box('WWB_Aviation_Glow', tu - 0.35, tu + 0.35, v - 0.35, v + 0.35, TOP + 3.4, TOP + 3.4, zt0=TOP + 4.2, zt1=TOP + 4.2)
        for z, d in ((dz - 9.5, 3.2), (dz + 26, 2.6), (TOP - 6, 4.2)):
            box('WWB_Steel', tu - 1.7, tu + 1.7, -14.6, 14.6, z, z, zt0=z + d, zt1=z + d)
        for z0, z1 in ((dz - 6.3, 16), (dz + 28.6, TOP - 6)):                                                             # X bracing between the legs
            if z0 < z1: z0, z1 = z1, z0
            mid = (z0 + z1) / 2
            for a, b2 in (((tu, -14.4, z0), (tu, 14.4, z1)), ((tu, 14.4, z0), (tu, -14.4, z1))): bar('WWB_Steel', a, b2, 0.9)
    # ---- anchorages and approach viaducts
    for au in (-AN, AN):
        dz = deck(au); s = 1 if au > 0 else -1
        box('WWB_Concrete', au - 4 if s > 0 else au - 34, au + 34 if s > 0 else au + 4, -19, 19, -4, -4, zt0=dz - 0.8, zt1=deck(au + s * 30) - 0.8)
        box('WWB_Concrete', au - 6 if s > 0 else au - 36, au + 36 if s > 0 else au + 6, -21, 21, -4, -4, zt0=10, zt1=10)
    def approach(u0, u1, step):
        k = 0; u = u0
        while (u < u1) if step > 0 else (u > u1):
            b = u + step; b = min(b, u1) if step > 0 else max(b, u1); za, zb = deck(u) - 0.75, deck(b) - 0.75
            for v in (-11.2, -5.6, 0, 5.6, 11.2): box('WWB_Steel', min(u, b), max(u, b), v - 0.22, v + 0.22, (za if u < b else zb) - 2.3, (zb if u < b else za) - 2.3, zt0=(za if u < b else zb), zt1=(zb if u < b else za))
            if za - 2.3 > 5.5:
                box('WWB_Concrete', u - 1.0, u + 1.0, -13.4, 13.4, za - 4.1, za - 4.1, zt0=za - 2.3, zt1=za - 2.3)
                for v in (-8.6, 8.6): box('WWB_Concrete', u - 0.9, u + 0.9, v - 1.1, v + 1.1, -3, -3, zt0=za - 4.1, zt1=za - 4.1)
            u = b; k += 1
    approach(-AN - 34, UPA, -42.0); approach(AN + 34, UNJ, 42.0)
    # ---- roadway lighting on the median
    u = UPA + 40
    while u < UNJ - 30:
        z = deck(u)
        bar('WWB_Steel', (u, 0, z + 0.8), (u, 0, z + 11.5), 0.2)
        for s in (-1, 1): bar('WWB_Steel', (u, 0, z + 11.3), (u, s * 2.6, z + 11.7), 0.12); box('WWB_Lamp_Glow', u - 0.35, u + 0.35, s * 2.9 - 0.2, s * 2.9 + 0.2, z + 11.55, z + 11.55, zt0=z + 11.68, zt1=z + 11.68)
        u += 55
    col = bpy.data.collections.get('WWB')
    if col:
        for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new('WWB'); bpy.context.scene.collection.children.link(col)
    objs = []
    for name, b in BM.items():
        bmesh.ops.recalc_face_normals(b, faces=b.faces)
        me = bpy.data.meshes.new(name.replace('WWB_', 'WaltWhitman_')); b.to_mesh(me); b.free(); me.materials.append(MATS[name])
        o = bpy.data.objects.new(me.name, me); col.objects.link(o); objs.append(o)
    BM.clear(); return objs
objs = build()
print('WWB objects', len(objs), 'tris', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs))
if '--export' in sys.argv:
    path = sys.argv[sys.argv.index('--export') + 1]
    for o in bpy.context.scene.objects: o.select_set(o in objs)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_materials='EXPORT', export_normals=True, export_texcoords=False)
    print('exported', path)
