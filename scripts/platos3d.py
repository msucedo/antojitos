"""
Versión propia de los iconos de negocio, modelada en Blender: un concepto por negocio (el carrito,
los vitroleros, el trompo, la torta, la cazuela, la charola, el food truck y el edificio), no una copia
de los platos raster actuales. Propuesta para comparar; no toca src/.

    blender -b -P scripts/platos3d.py -- [ids...]      (sin ids: los 8; ids = nombre de archivo del plato)

Renderiza cada uno a 1024 px con fondo transparente en una carpeta temporal (PLATOS_RENDERS=carpeta
para conservarlos) y llama a scripts/platos3d_post.py (python3 del sistema con Pillow; PLATOS_PY para
otro), que pone contorno de tinta y sombra y escribe docs/refs/propuesta-platos/<id>.webp y hoja.png.

Estilo: tonos planos con uno oscuro por color y un brillo, sombreado toon sin luces (N·L con una
dirección fija en el espacio de la cámara, sin sombras proyectadas) y contornos internos con casco
invertido. El contorno exterior y la sombra desplazada son 2D.
"""
import math
import os
import shutil
import subprocess
import sys
import tempfile

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = 1024
INK = '#1B2A3A'
LINEA = 0.045  # grosor del casco invertido (contorno interno), en unidades de mundo
LUZ = Vector((-0.55, 0.65, 0.55)).normalized()  # en el espacio de la cámara: arriba a la izquierda, hacia el frente


def lin(h: str) -> tuple:
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


# ---------------------------------------------------------------- escena

def escena() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    if sc.view_settings.view_transform != 'Standard':
        raise SystemExit('view_transform no quedó en Standard: los hex no saldrían exactos')
    sc.view_settings.look = 'None'
    sc.render.film_transparent = True
    sc.render.dither_intensity = 0  # sin ruido: hex exactos y webp ligeros
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    w = bpy.data.worlds.new('mundo')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)


_cache: dict = {}


def mat(base: str, oscuro: str | None = None, brillo: bool | float = True, corte: float = 0.18,
        eje: Vector | None = None) -> bpy.types.Material:
    """Toon: N·L (dirección fija) → rampa constante: oscuro / base / brillo blanco.

    eje: sombrea como un cilindro de ese eje por el origen del objeto (normal = posición menos su
    proyección sobre el eje; el objeto no debe rotar) en vez de con la normal propia. Así los granos se sombrean como una sola mazorca.
    """
    key = (base, oscuro, brillo, corte, tuple(eje) if eje else None)
    if key in _cache:
        return _cache[key]
    m = bpy.data.materials.new(f'{base}-{oscuro}-{brillo}')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    dot.name = 'luz'
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    r = ramp.color_ramp
    r.interpolation = 'CONSTANT'
    r.elements[0].position = 0.0
    r.elements[0].color = lin(oscuro or base)
    r.elements[1].position = corte
    r.elements[1].color = lin(base)
    if brillo:
        e = r.elements.new(0.9 if brillo is True else brillo)
        e.color = lin('#FFFFFF')
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    if eje is None:
        nt.links.new(geo.outputs['Normal'], dot.inputs[0])
    else:
        d = Vector(eje).normalized()
        pd = nt.nodes.new('ShaderNodeVectorMath')
        pd.operation = 'DOT_PRODUCT'
        pd.inputs[1].default_value = d
        esc = nt.nodes.new('ShaderNodeVectorMath')
        esc.operation = 'SCALE'
        esc.inputs[0].default_value = d
        rest = nt.nodes.new('ShaderNodeVectorMath')
        rest.operation = 'SUBTRACT'
        norm = nt.nodes.new('ShaderNodeVectorMath')
        norm.operation = 'NORMALIZE'
        coord = nt.nodes.new('ShaderNodeTexCoord')  # espacio del objeto: el eje pasa por su origen
        nt.links.new(coord.outputs['Object'], pd.inputs[0])
        nt.links.new(pd.outputs['Value'], esc.inputs['Scale'])
        nt.links.new(coord.outputs['Object'], rest.inputs[0])
        nt.links.new(esc.outputs['Vector'], rest.inputs[1])
        nt.links.new(rest.outputs['Vector'], norm.inputs[0])
        # un poco de la normal propia, para que cada grano se lea
        mez = nt.nodes.new('ShaderNodeVectorMath')
        mez.operation = 'MULTIPLY_ADD'
        mez.inputs[1].default_value = (0.45, 0.45, 0.45)
        nt.links.new(geo.outputs['Normal'], mez.inputs[0])
        nt.links.new(norm.outputs['Vector'], mez.inputs[2])
        norm2 = nt.nodes.new('ShaderNodeVectorMath')
        norm2.operation = 'NORMALIZE'
        nt.links.new(mez.outputs['Vector'], norm2.inputs[0])
        nt.links.new(norm2.outputs['Vector'], dot.inputs[0])
    nt.links.new(dot.outputs['Value'], ramp.inputs[0])
    nt.links.new(ramp.outputs['Color'], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
    _cache[key] = m
    return m


def tinta() -> bpy.types.Material:
    if 'tinta' in _cache:
        return _cache['tinta']
    m = bpy.data.materials.new('tinta')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs[0].default_value = lin(INK)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs[0])
    m.use_backface_culling = True
    _cache['tinta'] = m
    return m


def objeto(nombre: str, bm: bmesh.types.BMesh, mats: list, linea: float | None = LINEA,
           suave: bool = True, grosor: float = 0.0) -> bpy.types.Object:
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = suave
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(ob)
    if grosor:  # superficies abiertas (tortilla, vidrio): grosor antes del casco
        g = ob.modifiers.new('grosor', 'SOLIDIFY')
        g.thickness = grosor
        g.offset = 0
    for m in mats:
        me.materials.append(m)
    if linea:
        # el casco usa material_offset: cada material i pinta su casco con el i + len(mats), siempre tinta
        for _ in mats:
            me.materials.append(tinta())
        s = ob.modifiers.new('casco', 'SOLIDIFY')
        s.thickness = linea
        s.offset = 1
        s.use_flip_normals = True
        s.use_rim = False
        s.material_offset = len(mats)
    return ob


# ---------------------------------------------------------------- geometría

def esfera(r=1.0, esc=(1, 1, 1), seg=48, anillos=24, m: Matrix | None = None) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=anillos, radius=r)
    bmesh.ops.scale(bm, vec=Vector(esc), verts=bm.verts)
    if m is not None:
        bm.transform(m)
    return bm


def cilindro(r=1.0, h=1.0, seg=48, r2=None, m: Matrix | None = None) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r2 is None else r2, depth=h)
    if m is not None:
        bm.transform(m)
    return bm


def unir(*bms: bmesh.types.BMesh) -> bmesh.types.BMesh:
    out = bmesh.new()
    me = bpy.data.meshes.new('tmp')
    for b in bms:
        b.to_mesh(me)
        out.from_mesh(me)
        b.free()
    bpy.data.meshes.remove(me)
    return out


def tubo(puntos: list, r: float, seg: int = 16) -> bmesh.types.BMesh:
    """Tubo redondo por una polilínea (Catmull-Rom), con tapas."""
    pts = [Vector(p) for p in puntos]
    lisos = []
    for i in range(len(pts) - 1):
        p0 = pts[max(i - 1, 0)]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[min(i + 2, len(pts) - 1)]
        for k in range(8):
            t = k / 8
            t2, t3 = t * t, t * t * t
            lisos.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    lisos.append(pts[-1])
    bm = bmesh.new()
    anillos = []
    arriba = Vector((0, 0, 1))
    for i, p in enumerate(lisos):
        d = (lisos[min(i + 1, len(lisos) - 1)] - lisos[max(i - 1, 0)]).normalized()
        a = d.cross(arriba)
        if a.length < 1e-4:
            a = d.cross(Vector((1, 0, 0)))
        a.normalize()
        b = a.cross(d).normalized()
        anillos.append([bm.verts.new(p + r * (math.cos(t) * a + math.sin(t) * b))
                        for t in (2 * math.pi * j / seg for j in range(seg))])
    for r0, r1 in zip(anillos, anillos[1:]):
        for j in range(seg):
            bm.faces.new((r0[j], r0[(j + 1) % seg], r1[(j + 1) % seg], r1[j]))
    for anillo, rev in ((anillos[0], True), (anillos[-1], False)):
        c = bm.verts.new(sum((v.co for v in anillo), Vector()) / seg)
        for j in range(seg):
            a, b = anillo[j], anillo[(j + 1) % seg]
            bm.faces.new((c, b, a) if rev else (c, a, b))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def rodaja_limon(r=0.55, h=0.22, m: Matrix | None = None, mitad: bool = True) -> bmesh.types.BMesh:
    """Rodaja (media, partida en y=0, o entera). Material 0 = cáscara, 1 = pulpa (tapas y corte)."""
    bm = cilindro(r, h, seg=48)
    if mitad:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 1, 0), clear_outer=True)
        bordes = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        bmesh.ops.contextual_create(bm, geom=bordes)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    tapas = [f for f in bm.faces if abs(f.normal.z) > 0.9]
    bmesh.ops.inset_individual(bm, faces=tapas, thickness=r * 0.14, use_even_offset=True)
    for f in bm.faces:  # pulpa: tapas ya recortadas y cara del corte; cáscara: el resto (canto y aro de las tapas)
        f.material_index = 1 if (f in tapas or f.normal.y > 0.9) else 0
    if m is not None:
        bm.transform(m)
    return bm


def torno(perfil: list, seg: int = 64, mat_z=None, m: Matrix | None = None) -> bmesh.types.BMesh:
    """Superficie de revolución sobre Z de un perfil [(r, z), ...]; r = 0 cierra en un polo.
    mat_z(z) da el índice de material de cada cara por la altura de su centro."""
    bm = bmesh.new()
    anillos = []
    for r, z in perfil:
        if r < 1e-6:
            anillos.append([bm.verts.new((0, 0, z))])
        else:
            anillos.append([bm.verts.new((r * math.cos(2 * math.pi * j / seg), r * math.sin(2 * math.pi * j / seg), z))
                            for j in range(seg)])
    for a, b in zip(anillos, anillos[1:]):
        for j in range(seg):
            k = (j + 1) % seg
            if len(a) == 1:
                bm.faces.new((a[0], b[j], b[k]))
            elif len(b) == 1:
                bm.faces.new((a[j], b[0], a[k]))
            else:
                bm.faces.new((a[j], a[k], b[k], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if mat_z:
        for f in bm.faces:
            f.material_index = mat_z(f.calc_center_median().z)
    if m is not None:
        bm.transform(m)
    return bm


def caja(dx: float, dy: float, dz: float, bisel: float = 0.06, m: Matrix | None = None) -> bmesh.types.BMesh:
    """Caja centrada en el origen con aristas biseladas."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(dx, dy, dz), verts=bm.verts)
    if bisel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bisel, segments=3, affect='EDGES', profile=0.5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if m is not None:
        bm.transform(m)
    return bm


def T(x=0.0, y=0.0, z=0.0) -> Matrix:
    return Matrix.Translation((x, y, z))


def R(eje: str, grados: float) -> Matrix:
    return Matrix.Rotation(math.radians(grados), 4, eje)


def circulo(c: Vector, r: float, n: int = 48, plano: str = 'XY') -> list:
    pts = []
    for j in range(n + 1):
        t = 2 * math.pi * j / n
        a, b = r * math.cos(t), r * math.sin(t)
        pts.append(c + (Vector((a, b, 0)) if plano == 'XY' else Vector((a, 0, b))))
    return pts


# ---------------------------------------------------------------- piezas compartidas

def sombrilla(r: float, h: float, gajos: int, m: Matrix | None = None) -> bmesh.types.BMesh:
    """Cono de gajos alternos (material 0 / 1), abierto por abajo."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=False, segments=gajos * 6, radius1=r, radius2=0.0, depth=h)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = int((math.atan2(c.y, c.x) + math.pi) / (2 * math.pi) * gajos) % 2
    if m is not None:
        bm.transform(m)
    return bm


def mazorca(nombre: str, gir: Matrix, L: float, RC: float, filas: int = 9, vueltas: int = 12, forma: float = 2) -> None:
    """Mazorca sobre el eje X local de gir: alma oscura y granos sombreados como un solo cilindro.
    forma: exponente del perfil (2 = óvalo; 4 o más = casi cilindro con puntas redondeadas)."""
    def radio(u: float) -> float:
        return max(1 - abs(u) ** forma, 0.003) ** (1 / forma)

    alma = esfera(1, (L, RC, RC))
    for v in alma.verts:
        u = v.co.x / L
        v.co.y *= radio(u) / math.sqrt(max(1 - u * u, 1e-4))
        v.co.z *= radio(u) / math.sqrt(max(1 - u * u, 1e-4))
    alma.transform(gir)
    objeto(nombre, alma, [mat('#C98A00', '#A87000', brillo=False)])
    granos = []
    for i in range(filas):
        u = -0.82 + 1.64 * i / (filas - 1)
        rr = RC * max(radio(u), 0.22)
        for j in range(vueltas):
            t = 2 * math.pi * (j + 0.5 * (i % 2)) / vueltas
            k = 0.165 / 0.62 * RC * (0.55 + 0.45 * rr / RC)
            granos.append(esfera(k, (1.1, 1, 0.8), seg=16, anillos=10,
                                 m=gir @ T(u * L, rr * math.cos(t), rr * math.sin(t)) @ R('X', math.degrees(t) - 90)))
    eje = (gir.to_3x3() @ Vector((1, 0, 0))).normalized()
    centro = gir.to_translation()
    # el eje de sombreado pasa por el origen del objeto: los granos se arman ahí y el objeto se mueve
    for b in granos:
        b.transform(T(*-centro))
    bm = unir(*granos)
    ob = objeto(f'{nombre}-granos', bm, [mat('#F4C430', '#DE9F00', brillo=False, corte=0.2, eje=eje)], linea=None)
    ob.location = centro


def tortilla_doblada(RT: float, RF: float, m: Matrix | None = None) -> bmesh.types.BMesh:
    """Disco de radio RT doblado sobre el eje X con radio de doblez RF (la U abre hacia +Z)."""
    bm = bmesh.new()
    n_r, n_t = 14, 72
    centro = bm.verts.new((0, 0, 0))
    anillos = [[bm.verts.new((RT * i / n_r * math.cos(2 * math.pi * j / n_t), RT * i / n_r * math.sin(2 * math.pi * j / n_t), 0))
                for j in range(n_t)] for i in range(1, n_r + 1)]
    for j in range(n_t):
        bm.faces.new((centro, anillos[0][j], anillos[0][(j + 1) % n_t]))
    for a, b in zip(anillos, anillos[1:]):
        for j in range(n_t):
            k = (j + 1) % n_t
            bm.faces.new((a[j], b[j], b[k], a[k]))
    for v in bm.verts:
        f = v.co.y / RF
        v.co = Vector((v.co.x, RF * math.sin(f), RF * (1 - math.cos(f))))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if m is not None:
        bm.transform(m)
    return bm


def toldo(nombre: str, x0: float, ancho: float, y: float, z: float, n: int, colores: tuple) -> None:
    """Toldo de n rayas inclinado hacia -Y, con borde de ondas."""
    rayas = []
    for i in range(n):
        x = x0 + (i + 0.5) * ancho / n
        rayas.append((i % 2, caja(ancho / n + 0.002, 0.8, 0.06, 0.0, m=T(x, y, z) @ R('X', 34))))
        rayas.append((i % 2, esfera(ancho / n / 2, (1, 0.45, 0.75), seg=24, anillos=12, m=T(x, y - 0.34, z - 0.23))))
    for k in (0, 1):
        objeto(f'{nombre}{k}', unir(*[b for c, b in rayas if c == k]), [colores[k]], linea=0.025)


def llanta(nombre: str, x: float, y: float, r: float = 0.36) -> None:
    objeto(nombre, cilindro(r, 0.26, m=T(x, y, r) @ R('X', 90)), [mat('#3A3F46', '#24282D', brillo=False)])
    lado = 1 if y > 0 else -1
    objeto(f'{nombre}-rin', cilindro(r * 0.45, 0.05, m=T(x, y + lado * 0.14, r) @ R('X', 90)),
           [mat('#C8C8C8', '#9A9A9A', brillo=False)], linea=0.02)


VIDRIO = ('#9ED8F0', '#7CC0DC')
METAL = ('#C8C8C8', '#9A9A9A')
MADERA = ('#E8C99A', '#D9A15B')
BARRO = ('#B5562B', '#8A3D1C')


# ---------------------------------------------------------------- negocios (versión propia, un concepto por negocio)

def elote() -> dict:
    """Carrito de elotes: el carrito con su sombrilla, la olla y dos elotes asomando."""
    objeto('cuerpo', caja(1.8, 1.0, 0.8, 0.06, m=T(0, 0, 1.0)), [mat('#5FA35F', '#3A7D44', brillo=False)])
    objeto('mostrador', caja(1.95, 1.1, 0.1, 0.03, m=T(0, 0, 1.45)), [mat(*MADERA, brillo=False)])
    objeto('olla', cilindro(0.42, 0.62, m=T(0.4, 0, 1.81)), [mat(*METAL)])
    objeto('olla-borde', tubo(circulo(Vector((0.4, 0, 2.12)), 0.43, 48), 0.04), [mat(*METAL, brillo=False)], linea=0.02)
    for i, (x, ry) in enumerate([(0.28, -14), (0.55, 16)]):
        g = T(x, -0.05 * i, 2.35) @ R('Y', ry - 90)
        mazorca(f'elote{i}', g, 0.36, 0.15, filas=6, vueltas=8)
        objeto(f'palito{i}', cilindro(0.04, 0.5, m=g @ T(-0.55, 0, 0) @ R('Y', 90)), [mat(*MADERA)], linea=0.02)
    objeto('poste', cilindro(0.04, 1.7, m=T(-0.55, 0.15, 2.3)), [mat(*METAL, brillo=False)], linea=0.02)
    objeto('sombrilla', sombrilla(1.3, 0.5, 8, m=T(-0.55, 0.15, 3.1)),
           [mat('#E5484D', '#B5303A', brillo=False), mat('#FFF6E5', '#E2D3B6', brillo=False)], grosor=0.03)
    llanta('llanta', -0.4, -0.58, 0.4)
    for y in (-0.4, 0.4):
        objeto(f'pata{y}', caja(0.1, 0.1, 0.62, 0.02, m=T(0.8, y, 0.31)), [mat(*METAL, brillo=False)], linea=0.02)
    objeto('manija', tubo([(0.9, 0, 1.25), (1.25, 0, 1.4), (1.45, 0, 1.42)], 0.045), [mat(*MADERA)], linea=0.02)
    return dict(elev=26, azim=22)


def agua() -> dict:
    """Aguas frescas: tres vitroleros en su repisa (horchata, jamaica, limón)."""
    oscura = mat('#B07850', '#8A5A3A', brillo=False)
    objeto('repisa', caja(2.5, 1.9, 0.22, 0.04, m=T(0, 0, 0.11)), [oscura])
    objeto('escalon', caja(1.3, 0.85, 0.45, 0.04, m=T(0, 0.5, 0.445)), [oscura])
    perfil = [(0, 0), (0.75, 0), (0.95, 0.12), (1.08, 0.5), (1.12, 0.9), (1.08, 1.3), (0.95, 1.6),
              (0.82, 1.75), (0.82, 1.95)]
    for x, y, z0, s, liq in ((0, 0.5, 0.67, 0.52, ('#C2185B', '#8E0F43')),
                             (-0.62, -0.45, 0.22, 0.46, ('#A0522D', '#7A3D20')),
                             (0.62, -0.45, 0.22, 0.46, ('#8FD07A', '#5FA35F'))):
        nivel = 1.5 * s
        p = [(r * s, z * s) for r, z in perfil]
        m = T(x, y, z0)
        objeto(f'vit{x}', torno(p, mat_z=lambda z, n=nivel: 0 if z < n else 1, m=m),
               [mat(*liq), mat(*VIDRIO)], grosor=0.03)
        objeto(f'sup{x}', cilindro(0.98 * s, 0.02, m=m @ T(0, 0, nivel)), [mat(liq[0], liq[0], brillo=False)], linea=0.02)
        objeto(f'labio{x}', tubo(circulo(Vector((x, y, z0 + 1.95 * s)), 0.84 * s, 48), 0.04),
               [mat(*VIDRIO)], linea=0.02)
    objeto('limon', rodaja_limon(0.26, 0.08, mitad=False, m=T(0.88, -0.65, 0.22 + 1.95 * 0.46) @ R('Y', -25) @ R('X', 70)),
           [mat('#3A7D44', '#2C6235'), mat('#C6E48E', '#9FCB63', brillo=False)])
    return dict(elev=26, azim=20)


def taco() -> dict:
    """Taquería: trompo al pastor con su piña."""
    objeto('espada', cilindro(0.08, 3.2, m=T(0, 0, 1.6)), [mat('#9A9A9A', '#6E6E6E', brillo=False)], linea=0.02)
    objeto('base', cilindro(0.9, 0.14, m=T(0, 0, 0.07)), [mat('#3A3F46', '#24282D', brillo=False)])
    # cuchillo de taquero grande, cruzado al frente: se lee a 76 px y ensancha la silueta
    g = T(1.1, -1.15, 1.15) @ R('Z', -5) @ R('Y', -40)
    objeto('cuchilla', caja(1.6, 0.05, 0.42, 0.02, m=g), [mat(*METAL, brillo=0.93)], linea=0.03)
    objeto('filo', caja(1.6, 0.055, 0.07, 0.01, m=g @ T(0, 0, -0.19)), [mat('#F2F2F2', '#DADADA', brillo=False)], linea=None)
    objeto('mango', caja(0.6, 0.14, 0.24, 0.05, m=g @ T(1.08, 0, 0.03)), [mat('#B07850', '#8A5A3A', brillo=False)],
           linea=0.03)
    perfil = [(r * 1.2, z) for r, z in
              [(0, 0.4), (0.72, 0.42), (0.86, 0.75), (0.95, 1.3), (1.04, 1.9), (1.08, 2.3), (0.9, 2.44), (0, 2.48)]]

    def radio(z: float) -> float:
        for (r0, z0), (r1, z1) in zip(perfil[1:], perfil[2:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return perfil[1][0]

    objeto('trompo', torno(perfil), [mat('#EE6A24', '#B9441A', brillo=0.93)])
    # capas de carne: aros oscuros y onditas de borde tostado
    capas = []
    for i in range(7):
        z = 0.65 + 0.26 * i
        pts = [Vector(((radio(z) + 0.01) * math.cos(t), (radio(z) + 0.01) * math.sin(t), z + 0.035 * math.sin(5 * t + i)))
               for t in (2 * math.pi * j / 96 for j in range(97))]
        capas.append(tubo(pts, 0.04, seg=8))
    objeto('capas', unir(*capas), [mat('#8E2A10', '#6E1F0B', brillo=False)], linea=None)
    objeto('pina', esfera(1, (0.5, 0.5, 0.58), m=T(0, 0, 3.0)), [mat('#FFCF33', '#D9A400')])
    rombos = []  # cáscara de la piña: hélices en los dos sentidos
    for sentido in (-1, 1):
        for k in range(7):
            t0 = 2 * math.pi * k / 7
            pts = [Vector(((0.5 * math.sqrt(1 - u * u) + 0.005) * math.cos(t0 + sentido * 2.2 * u),
                           (0.5 * math.sqrt(1 - u * u) + 0.005) * math.sin(t0 + sentido * 2.2 * u), 3.0 + 0.58 * u))
                   for u in (i / 20 - 0.85 for i in range(35))]
            rombos.append(tubo(pts, 0.022, seg=6))
    objeto('rombos', unir(*rombos), [mat('#B98500', '#9A6E00', brillo=False)], linea=None)
    for i in range(5):
        a = 72 * i
        objeto(f'corona{i}', cilindro(0.11, 0.6, r2=0.0, m=T(0, 0, 3.45) @ R('Z', a) @ R('Y', 28) @ T(0, 0, 0.28)),
               [mat('#5FA35F', '#3A7D44', brillo=False)], linea=0.025)
    return dict(elev=22, azim=20)


def torta() -> dict:
    """Tortería: torta alta en telera, con banderita, en su plato."""
    pan = mat('#D9A15B', '#B07850', brillo=0.95)
    objeto('pan-abajo', esfera(1, (1.2, 0.85, 0.28), m=T(0, 0, 0.36)), [pan])
    objeto('milanesa', esfera(1, (1.38, 1.0, 0.15), m=T(0, 0, 0.6)), [mat('#C96A3A', '#A0522D', brillo=False)],
           linea=0.025)
    objeto('queso', caja(1.55, 1.55, 0.1, 0.02, m=T(0.05, -0.08, 0.72) @ R('Z', 45) @ Matrix.Diagonal((1, 0.72, 1, 1))),
           [mat('#F4C430', '#C99700', brillo=False)], linea=0.025)
    for i, (x, y) in enumerate([(-0.75, -0.66), (0.05, -0.86), (0.82, -0.6)]):
        objeto(f'jitomate{i}', cilindro(0.36, 0.14, m=T(x, y, 0.84) @ R('X', 14)),
               [mat('#E5484D', '#B5303A', brillo=False)], linea=0.025)
    for i, (x, y, rz) in enumerate([(-0.38, -0.88, -12), (0.45, -0.86, 12)]):
        objeto(f'aguacate{i}', esfera(1, (0.36, 0.18, 0.12), m=T(x, y, 0.98) @ R('Z', rz)),
               [mat('#5FA35F', '#3A7D44', brillo=False)], linea=0.025)
    for i, x in enumerate((-0.6, 0, 0.6)):  # telera: tres lóbulos
        objeto(f'telera{i}', esfera(1, (0.5, 0.85, 0.42 if i == 1 else 0.38), m=T(x, 0.02, 1.3)), [pan])
    objeto('palillo', cilindro(0.03, 1.0, m=T(0.05, -0.1, 1.9)), [mat(*MADERA, brillo=False)], linea=0.015)
    objeto('banderin', caja(0.6, 0.03, 0.4, 0.0, m=T(0.38, -0.1, 2.2)), [mat('#E4007C', '#B0005F', brillo=False)],
           linea=0.025)
    return dict(elev=14, azim=20)


def olla() -> dict:
    """Fonda: cazuela de mole y tortillero."""
    perfil = [(0, 0), (0.85, 0), (1.2, 0.12), (1.42, 0.38), (1.5, 0.58), (1.56, 0.66), (1.52, 0.73),
              (1.42, 0.69), (1.36, 0.56)]
    objeto('cazuela', torno(perfil), [mat(*BARRO)])
    mole = mat('#6B3A24', '#4F2A1A', brillo=False)
    objeto('mole', cilindro(1.37, 0.03, m=T(0, 0, 0.57)), [mole], linea=0.02)
    for i, (x, y) in enumerate([(-0.45, -0.15), (0.45, 0.25)]):
        objeto(f'pieza{i}', esfera(0.38, (1.3, 1, 0.45), m=T(x, y, 0.58)), [mole], linea=None)
    for i, (x, y) in enumerate([(-0.6, -0.25), (-0.3, -0.05), (-0.5, 0.05), (0.35, 0.1), (0.6, 0.3), (0.5, 0.45),
                                (0.0, -0.5), (0.2, -0.3), (-0.9, 0.4), (0.9, -0.3)]):
        objeto(f'ajonjoli{i}', esfera(0.045, (1.5, 1, 0.6), seg=10, anillos=6, m=T(x, y, 0.72 if abs(x) > 0.25 else 0.62)),
               [mat('#FFF6E5', '#E2D3B6', brillo=False)], linea=None)
    for sx in (-1, 1):
        pts = [Vector((sx * (1.5 + 0.18 * math.cos(math.radians(a))), 0, 0.45 + 0.16 * math.sin(math.radians(a))))
               for a in range(-80, 81, 20)]
        objeto(f'asa{sx}', tubo(pts, 0.06), [mat(*BARRO)])
    objeto('tortillero', cilindro(0.6, 0.45, m=T(0.75, -1.3, 0.22)), [mat('#E5484D', '#B5303A', brillo=False)])
    objeto('franja', tubo(circulo(Vector((0.75, -1.3, 0.26)), 0.61, 48), 0.035), [mat('#FFF6E5', '#E2D3B6', brillo=False)],
           linea=None)
    for i in range(3):
        objeto(f'tortilla{i}', cilindro(0.56, 0.05, m=T(0.75 + 0.03 * i, -1.3 - 0.02 * i, 0.47 + 0.05 * i)),
               [mat('#F2D18B', '#D9A15B', brillo=False)], linea=0.02)
    objeto('servilleta', esfera(1, (0.5, 0.32, 0.07), m=T(0.55, -1.1, 0.64) @ R('Z', 30) @ R('Y', -10)),
           [mat('#FFF6E5', '#E2D3B6', brillo=False)], linea=0.02)
    return dict(elev=40, azim=20)


def concha() -> dict:
    """Panadería: charola de aluminio con concha, cuerno y pinzas."""
    lam = mat('#DADADA', '#B5B5B5', brillo=False)
    objeto('charola', caja(2.6, 1.7, 0.06, 0.02, m=T(0, 0, 0.03)), [lam])
    for y in (-0.85, 0.85):
        objeto(f'borde{y}', caja(2.6, 0.06, 0.16, 0.02, m=T(0, y, 0.1)), [lam], linea=0.02)
    for x in (-1.3, 1.3):
        objeto(f'borde{x}', caja(0.06, 1.7, 0.16, 0.02, m=T(x, 0, 0.1)), [lam], linea=0.02)
    # concha
    cx, cy, RT, ZT, HT = -0.5, -0.1, 0.74, 0.22, 0.44
    objeto('pan', esfera(1, (0.8, 0.8, 0.28), m=T(cx, cy, 0.15)), [mat('#E8C99A', '#D9A15B')])
    objeto('costra', esfera(1, (RT, RT, HT), m=T(cx, cy, ZT)), [mat('#F25C8F', '#D6457A', brillo=0.97)])

    def sobre(x: float, y: float) -> Vector:
        q = 1 - (x * x + y * y) / (RT * RT)
        return Vector((cx + x, cy + y, ZT + HT * math.sqrt(max(q, 0)) + 0.005))

    p0 = Vector((0, -RT * 1.07, 0))
    trazos = []
    for a in range(-50, 51, 25):
        d = Vector((math.sin(math.radians(a)), math.cos(math.radians(a)), 0))
        trazos.append([q for q in (p0 + d * (0.15 + k * 0.05) for k in range(40)) if q.length < RT * 0.9])
    for rho in (0.55, 1.05):
        trazos.append([q for q in (p0 + Vector((math.sin(math.radians(a)), math.cos(math.radians(a)), 0)) * rho
                                   for a in range(-80, 81, 4)) if q.length < RT * 0.9])
    objeto('surcos', unir(*[tubo([sobre(q.x, q.y) for q in t], 0.045, seg=8) for t in trazos if len(t) >= 2]),
           [mat('#F7D9C4', '#E8C99A', brillo=False)], linea=None)
    # cuerno: segmentos a lo largo de un arco
    for i, (a, k) in enumerate(zip((205, 237, 270, 303, 335), (0.17, 0.25, 0.31, 0.25, 0.17))):
        t = math.radians(a)
        p = Vector((0.6 + 0.48 * math.cos(t), 0.55 + 0.48 * math.sin(t), 0.2))
        objeto(f'cuerno{i}', esfera(1, (k * 0.85, k * 1.2, k * 0.8), m=T(*p) @ R('Z', a)),
               [mat('#B07850', '#8A5A3A', brillo=0.95)], linea=0.03)
    for dy in (-0.12, 0.12):
        objeto(f'pinza{dy}', tubo([(0.3, -0.5, 0.3), (0.9, -0.5 + dy, 0.22), (1.55, -0.5 + dy * 1.8, 0.16)], 0.06),
               [mat(*METAL)], linea=0.02)
    objeto('pinza-ojo', esfera(0.11, m=T(0.3, -0.5, 0.3)), [mat(*METAL)], linea=0.02)
    return dict(elev=50, azim=25)


def tienda() -> dict:
    """Franquicia: food truck con un taco gigante en el techo."""
    rosa = mat('#E4007C', '#B0005F')
    objeto('caja', caja(2.6, 1.3, 1.4, 0.12, m=T(-0.2, 0, 1.12)), [rosa])
    objeto('franja', caja(2.64, 1.34, 0.2, 0.04, m=T(-0.2, 0, 0.55)), [mat('#FFF6E5', '#E2D3B6', brillo=False)])
    objeto('cabina', caja(0.8, 1.25, 1.0, 0.14, m=T(1.45, 0, 0.92)), [rosa])
    objeto('parabrisas', caja(0.06, 1.0, 0.38, 0.03, m=T(1.86, 0, 1.12)), [mat(*VIDRIO)], linea=0.025)
    objeto('ventanilla', caja(0.42, 0.06, 0.34, 0.03, m=T(1.5, -0.63, 1.12)), [mat(*VIDRIO)], linea=0.025)
    objeto('servicio', caja(1.3, 0.06, 0.6, 0.03, m=T(-0.3, -0.66, 1.25)), [mat('#3A3F46', '#24282D', brillo=False)],
           linea=0.025)
    objeto('barra', caja(1.45, 0.28, 0.06, 0.02, m=T(-0.3, -0.78, 0.93)), [mat(*MADERA, brillo=False)], linea=0.02)
    toldo('toldo', -1.05, 1.5, -0.95, 1.72, 5,
          (mat('#F4C430', '#C99700', brillo=False), mat('#FFF6E5', '#E2D3B6', brillo=False)))
    llanta('llanta1', -1.0, -0.6)
    llanta('llanta2', 1.35, -0.6)
    # taco gigante
    g = T(-0.2, 0, 1.86)
    objeto('taco', tortilla_doblada(1.0, 0.46, m=g), [mat('#F2D18B', '#D9A15B')], grosor=0.04)
    for i, (x, rz) in enumerate([(-0.4, 20), (0.0, 60), (0.38, 35)]):
        objeto(f'carne{i}', caja(0.26, 0.24, 0.22, 0.06, m=g @ T(x, 0, 0.62) @ R('Z', rz) @ R('X', rz / 2)),
               [mat('#D9622B', '#A84A1F', brillo=False)])
    for i, x in enumerate((-0.2, 0.2)):
        objeto(f'cilantro{i}', esfera(0.07, (1.4, 1, 0.5), seg=12, anillos=8, m=g @ T(x, -0.05, 0.78)),
               [mat('#3A7D44', '#2C6235', brillo=False)], linea=0.02)
    return dict(elev=24, azim=25)


def camion() -> dict:
    """Cadena nacional: el edificio corporativo con un elote gigante en la azotea."""
    objeto('torre', caja(1.5, 1.3, 2.3, 0.05, m=T(0, 0, 1.65)), [mat('#FFF6E5', '#E2D3B6', brillo=False)])
    objeto('planta-baja', caja(1.56, 1.36, 0.5, 0.04, m=T(0, 0, 0.25)), [mat('#F25C8F', '#D6457A', brillo=False)])
    objeto('puerta', caja(0.45, 0.06, 0.4, 0.02, m=T(0, -0.69, 0.22)), [mat(*VIDRIO)], linea=0.02)
    ventanas = []
    for z in (0.95, 1.45, 1.95, 2.45):
        for x in (-0.45, 0, 0.45):
            ventanas.append(caja(0.28, 0.05, 0.3, 0.02, m=T(x, -0.665, z)))
        for y in (-0.38, 0, 0.38):
            ventanas.append(caja(0.05, 0.26, 0.3, 0.02, m=T(0.765, y, z)))
    objeto('ventanas', unir(*ventanas), [mat(*VIDRIO, brillo=False)], linea=0.02)
    objeto('azotea', caja(1.62, 1.42, 0.12, 0.03, m=T(0, 0, 2.86)), [mat(*MADERA, brillo=False)])
    objeto('ala', caja(1.2, 1.1, 1.3, 0.05, m=T(-1.3, 0.1, 0.65)), [mat('#FFF6E5', '#E2D3B6', brillo=False)])
    objeto('ala-base', caja(1.24, 1.14, 0.4, 0.04, m=T(-1.3, 0.1, 0.2)), [mat('#F25C8F', '#D6457A', brillo=False)])
    objeto('ala-ventanas', unir(*[caja(0.26, 0.05, 0.28, 0.02, m=T(x, -0.465, 0.85)) for x in (-1.65, -1.3, -0.95)]),
           [mat(*VIDRIO, brillo=False)], linea=0.02)
    objeto('ala-techo', caja(1.28, 1.18, 0.1, 0.03, m=T(-1.3, 0.1, 1.33)), [mat(*MADERA, brillo=False)])
    g = T(0, 0, 3.75) @ R('Y', -78) @ R('X', 10)
    mazorca('elote', g, 0.75, 0.3)
    for i, a in enumerate((0, 120, 240)):
        objeto(f'hoja{i}', esfera(1, (0.18, 0.42, 0.7), m=T(0, 0, 3.0) @ R('Z', a + 30) @ R('X', 30) @ T(0, -0.15, 0.32)),
               [mat('#5FA35F', '#3A7D44', brillo=False)], linea=0.025)
    return dict(elev=20, azim=30)


def tacos_plato() -> dict:
    """Taquería (alternativa al trompo): plato de tres tacos al pastor visto desde arriba."""
    import random
    rnd = random.Random(7)
    objeto('plato', cilindro(1.75, 0.12, m=T(0, 0, 0.06)), [mat('#FFF6E5', '#E2D3B6', brillo=False)])
    objeto('plato-aro', tubo(circulo(Vector((0, 0, 0.125)), 1.55, 96), 0.05), [mat('#2E6FB5', '#1F5A99', brillo=False)],
           linea=None)
    for k, ang in enumerate((-18, 0, 18)):
        g = T(-0.78 + 0.78 * k, 0.15 - 0.15 * abs(k - 1), 0.14) @ R('Z', 90 + ang)
        objeto(f'tortilla{k}', tortilla_doblada(0.8, 1.3, m=g), [mat('#F2C46B', '#D9A15B', brillo=False)], grosor=0.03)
        trozos = []
        for _ in range(18):
            x, y = rnd.uniform(-0.5, 0.5), rnd.uniform(-0.28, 0.28)
            trozos.append(caja(0.2, 0.17, 0.1, 0.03, m=g @ T(x, y, 0.1) @ R('Z', rnd.uniform(0, 90))))
        objeto(f'pastor{k}', unir(*trozos), [mat('#EE6A24', '#B9441A', brillo=False)], linea=0.015)
        for i in range(4):
            x, y = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.2, 0.2)
            objeto(f'cebolla{k}{i}', caja(0.11, 0.11, 0.05, 0.02, m=g @ T(x, y, 0.18)), [mat('#FFFFFF', '#E6E6E6', brillo=False)],
                   linea=0.012)
        for i in range(3):
            x, y = rnd.uniform(-0.45, 0.45), rnd.uniform(-0.2, 0.2)
            objeto(f'cilantro{k}{i}', esfera(0.075, (1.4, 1, 0.4), seg=10, anillos=6, m=g @ T(x, y, 0.19) @ R('Z', rnd.uniform(0, 180))),
                   [mat('#3A7D44', '#2C6235', brillo=False)], linea=0.012)
        for i in range(2):
            x, y = rnd.uniform(-0.3, 0.3), rnd.uniform(-0.1, 0.1)
            objeto(f'pina{k}{i}', caja(0.16, 0.16, 0.08, 0.03, m=g @ T(x, y, 0.19) @ R('Z', 45)), [mat('#FFCF33', '#D9A400', brillo=False)],
                   linea=0.012)
    for i, (x, y, rz) in enumerate([(-1.0, -1.0, -35), (-0.3, -1.3, 8)]):
        objeto(f'limon{i}', rodaja_limon(0.38, 0.2, m=T(x, y, 0.22) @ R('Z', rz)),
               [mat('#3A7D44', '#2C6235'), mat('#C6E48E', '#9FCB63', brillo=False)])
    perfil = [(0, 0), (0.25, 0), (0.38, 0.12), (0.42, 0.28), (0.36, 0.26), (0.3, 0.14)]
    objeto('salsera', torno(perfil, m=T(1.05, -1.0, 0.12)), [mat(*BARRO)])
    objeto('salsa', cilindro(0.33, 0.02, m=T(1.05, -1.0, 0.33)), [mat('#E5484D', '#B5303A', brillo=False)], linea=0.015)
    return dict(elev=68, azim=0)


def trompo_mesa() -> dict:
    """Taquería: el trompo grande y al pie una pila de tortillas y dos salsas (roja y verde)."""
    sc = bpy.context.scene
    antes = set(sc.objects)
    taco()
    for ob in set(sc.objects) - antes:
        if ob.name in ('cuchilla', 'filo', 'mango'):
            bpy.data.objects.remove(ob)
    tortilla = mat('#F2C46B', '#D9A15B', brillo=False)
    for i in range(7):
        objeto(f'tortilla{i}', cilindro(0.8, 0.08, m=T(-1.15 + 0.03 * (i % 2), -1.25 + 0.025 * (i % 3), 0.05 + 0.085 * i)),
               [tortilla], linea=0.02)
    objeto('servilleta', esfera(1, (0.62, 0.38, 0.07), m=T(-1.0, -1.25, 0.66) @ R('Z', 25) @ R('Y', -8)),
           [mat('#FFF6E5', '#E2D3B6', brillo=False)], linea=0.02)
    perfil = [(r * 1.35, z * 1.35) for r, z in [(0, 0), (0.24, 0), (0.36, 0.12), (0.4, 0.3), (0.34, 0.28), (0.28, 0.14)]]
    for x, y, salsa in ((0.75, -1.45, ('#E5484D', '#B5303A')), (1.55, -0.95, ('#5FA35F', '#3A7D44'))):
        objeto(f'salsera{x}', torno(perfil, m=T(x, y, 0)), [mat(*BARRO)])
        objeto(f'salsa{x}', cilindro(0.43, 0.02, m=T(x, y, 0.33)), [mat(*salsa, brillo=False)], linea=0.015)
    return dict(elev=22, azim=20)


def trompo_papel() -> dict:
    """Taquería: el trompo solo, casi de frente, para el recorte de papel (estilo 'papel' en el post)."""
    sc = bpy.context.scene
    antes = set(sc.objects)
    taco()
    for ob in set(sc.objects) - antes:
        if ob.name in ('cuchilla', 'filo', 'mango'):
            bpy.data.objects.remove(ob)
        else:  # más chaparro: la silueta se acerca al cuadrado y se ve más grande en la tarjeta
            ob.matrix_world = Matrix.Diagonal((1, 1, 0.8, 1)) @ ob.matrix_world
    return dict(elev=8, azim=0)


def elote_papel() -> dict:
    """Carrito de elotes: un elote preparado, casi de frente, para el recorte de papel.
    Lo que lo hace leerse como elote y no como balón: hojas verdes abiertas en la base, mazorca casi
    cilíndrica y silueta abultada por los granos; la mayonesa va a lo largo (un zigzag parece agujetas)."""
    import random
    rnd = random.Random(3)
    L, RC, FORMA = 1.7, 0.6, 4
    gir = R('Y', -28)  # poco inclinado: las hojas quedan a la izquierda, fuera del chip "Vender"
    mazorca('elote', gir, L, RC, filas=11, vueltas=14, forma=FORMA)

    def sobre(u: float, grados: float, alto: float) -> Vector:
        """Punto sobre la mazorca (u en -1..1 a lo largo, ángulo local; 180° mira a la cámara)."""
        rr = RC * max(1 - abs(u) ** FORMA, 0.003) ** (1 / FORMA) + alto
        t = math.radians(grados)
        return gir @ Vector((u * L, rr * math.cos(t), rr * math.sin(t)))

    # hojas de la mazorca, abiertas hacia atrás desde la base
    hoja = mat('#5FA35F', '#3A7D44', brillo=False)
    for i, a in enumerate((35, 90, 145, 250)):
        objeto(f'hoja{i}', esfera(1, (0.85, 0.42, 0.05), seg=32, anillos=12,
                                  m=gir @ R('X', a) @ T(-L * 0.78, 0, RC * 0.98) @ R('Y', 12)),
               [hoja], linea=0.03)
    # mayonesa: dos chorritos ondulados a lo largo
    for k, g in enumerate((168, 196)):
        pts = [sobre(-0.62 + 1.24 * i / 10, g + 7 * math.sin(i * 1.7 + k), 0.2) for i in range(11)]
        objeto(f'mayo{k}', tubo(pts, 0.07), [mat('#FFF6E5', '#E2D3B6', corte=0.1)], linea=0.02)
    queso = [caja(*(rnd.uniform(0.07, 0.11) for _ in range(3)), 0.015,
                  m=T(*sobre(rnd.uniform(-0.6, 0.6), rnd.uniform(160, 205), 0.27)) @ R('Z', rnd.uniform(0, 90)) @ R('X', rnd.uniform(0, 90)))
             for _ in range(9)]
    objeto('queso', unir(*queso), [mat('#FFFFFF', '#E6E6E6', brillo=False)], linea=None)
    for k, (base, osc) in enumerate((('#C8281E', '#9A1C14'), ('#E04A26', '#B03A1C'))):
        hojuelas = [esfera(rnd.uniform(0.045, 0.075), (rnd.uniform(0.8, 1.5), rnd.uniform(0.7, 1.2), 0.5), seg=8, anillos=5,
                           m=T(*sobre(rnd.uniform(-0.65, 0.65), rnd.uniform(160, 205), 0.3)) @ R('Z', rnd.uniform(0, 180)))
                    for _ in range(14)]
        objeto(f'chile{k}', unir(*hojuelas), [mat(base, osc, brillo=False)], linea=None)
    objeto('palito', cilindro(0.14, 1.0, m=gir @ T(-L - 0.35, 0, 0) @ R('Y', 90)), [mat(*MADERA)])
    return dict(elev=8, azim=0)  # sin limón: junto a las hojas, otro verde se funde


PLATOS = {'elote': elote, 'agua': agua, 'taco': taco, 'torta': torta, 'olla': olla, 'concha': concha,
          'tienda': tienda, 'camion': camion, 'tacos-plato': tacos_plato,
          'trompo-mesa': trompo_mesa, 'trompo-papel': trompo_papel,
          'elote-papel': elote_papel}
# iconos que el paso 2D compone con varios renders (ver COMPUESTOS en platos3d_post.py)
COMPUESTOS = {'taqueria': ('taco', 'tacos-plato')}


# ---------------------------------------------------------------- cámara y render

def camara(elev: float, azim: float) -> None:
    sc = bpy.context.scene
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    co.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim))
    co.location = co.rotation_euler.to_matrix() @ Vector((0, 0, 20))
    bpy.context.view_layer.update()
    rot = co.matrix_world.to_3x3()
    luz = (rot @ LUZ).normalized()
    for m in bpy.data.materials:
        if m.node_tree and 'luz' in m.node_tree.nodes:
            m.node_tree.nodes['luz'].inputs[1].default_value = luz
    # encuadre: caja de todo en el espacio de la cámara
    inv = co.matrix_world.inverted()
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for ob in sc.objects:
        if ob.type != 'MESH':
            continue
        ev = ob.evaluated_get(dg)
        for v in ev.data.vertices:
            p = inv @ (ev.matrix_world @ v.co)
            xs.append(p.x)
            ys.append(p.y)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    cam.ortho_scale = max(w, h) * 1.25
    cam.shift_x = (max(xs) + min(xs)) / 2 / cam.ortho_scale
    cam.shift_y = (max(ys) + min(ys)) / 2 / cam.ortho_scale


def main() -> None:
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = args or list(PLATOS)
    for pid in ids:
        if pid not in PLATOS and pid not in COMPUESTOS:
            raise SystemExit(f'plato desconocido: {pid} (hay: {", ".join([*PLATOS, *COMPUESTOS])})')
    renders = list(dict.fromkeys(r for pid in ids for r in COMPUESTOS.get(pid, (pid,))))
    py = os.environ.get('PLATOS_PY') or shutil.which('python3')
    if not py:
        raise SystemExit('falta python3 con Pillow para el paso 2D (o define PLATOS_PY)')
    guardar = os.environ.get('PLATOS_RENDERS')  # carpeta donde dejar los PNG de 1024 para revisarlos
    tmp = guardar or tempfile.mkdtemp(prefix='platos3d-')
    os.makedirs(tmp, exist_ok=True)
    try:
        for pid in renders:
            escena()
            _cache.clear()
            cfg = PLATOS[pid]()
            camara(cfg['elev'], cfg['azim'])
            bpy.context.scene.render.filepath = os.path.join(tmp, f'{pid}.png')
            bpy.ops.render.render(write_still=True)
        subprocess.run([py, os.path.join(ROOT, 'scripts', 'platos3d_post.py'), tmp, *ids], check=True)
    finally:
        if not guardar:
            shutil.rmtree(tmp, ignore_errors=True)


main()
