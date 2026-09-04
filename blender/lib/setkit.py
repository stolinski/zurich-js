"""Primitives, materials, imports, seating, lights and cameras shared by every set.

Every set is authored at true metric scale in Blender and exported for a deck
that uses a 520 mm glass width as 16 scene units, so the metric root is scaled
by ``SCENE_UNITS_PER_METRE`` at the React Three Fiber boundary. The axis
contract is the glTF exporter's Y-up conversion: Blender X -> Three X,
Blender Z -> Three Y, Blender -Y -> Three Z.

The helpers here are the ones the home office was built with; the office and
the wall build on the same ones so a fix in a primitive reaches every set.
"""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

SCENE_UNITS_PER_METRE = 16.0 / 0.520
METRES_PER_SCENE_UNIT = 1.0 / SCENE_UNITS_PER_METRE
GLASS_WIDTH_M = 0.520
GLASS_HEIGHT_M = 0.2925
COORDINATE_CONTRACT = "Blender X -> Three X; Blender Z -> Three Y; Blender -Y -> Three Z"


def units(value: float) -> float:
    """Scene units (the deck's) to metres."""
    return value * METRES_PER_SCENE_UNIT


def three_to_blender(x: float, y: float, z: float) -> tuple[float, float, float]:
    """A point in the deck's scene units (X width, Y up, screen faces +Z) in metres here."""
    return (x * METRES_PER_SCENE_UNIT, -z * METRES_PER_SCENE_UNIT, y * METRES_PER_SCENE_UNIT)


def blender_to_three(point: Vector | tuple[float, float, float]) -> tuple[float, float, float]:
    """A metric Blender point in the deck's scene units."""
    x, y, z = point
    return (x * SCENE_UNITS_PER_METRE, z * SCENE_UNITS_PER_METRE, -y * SCENE_UNITS_PER_METRE)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = min(1.0, max(0.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def collection(name: str) -> bpy.types.Collection:
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def move_to_collection(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def set_input(node: bpy.types.Node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def rgba(hex_value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Convert display-authored sRGB hex into Blender's linear scene values."""
    value = hex_value.lstrip("#")

    def linear(channel: int) -> float:
        encoded = channel / 255
        return encoded / 12.92 if encoded <= 0.04045 else ((encoded + 0.055) / 1.055) ** 2.4

    return tuple(linear(int(value[index:index + 2], 16)) for index in (0, 2, 4)) + (alpha,)


def principled_material(
    name: str,
    color: str,
    roughness: float,
    metallic: float = 0.0,
    *,
    coat: float = 0.0,
    emission: str | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    set_input(bsdf, "Base Color", rgba(color))
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Coat Weight", coat)
    set_input(bsdf, "Coat Roughness", max(0.08, roughness * 0.55))
    if emission:
        set_input(bsdf, "Emission Color", rgba(emission))
        set_input(bsdf, "Emission Strength", emission_strength)
    # The glTF exporter cannot serialize Blender procedural nodes. Preserve an
    # explicit physical fallback for the exporter instead of letting linked
    # sockets silently become white runtime materials.
    material["export_base_color"] = list(rgba(color))
    material["export_roughness"] = roughness
    material["export_metallic"] = metallic
    return material


def textured_material(
    name: str,
    color_a: str,
    color_b: str,
    roughness: float,
    *,
    scale: float,
    detail: float,
    bump_strength: float,
    bump_distance: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    material = principled_material(name, color_a, roughness, metallic)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    texcoord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = 0.72
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = rgba(color_a)
    ramp.color_ramp.elements[1].color = rgba(color_b)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance

    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def wood_material(name: str, light: str, dark: str, roughness: float, phase: float = 0.0) -> bpy.types.Material:
    material = principled_material(name, light, roughness)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.2, 7.5, 1.8)
    mapping.inputs["Location"].default_value = (phase, phase * 0.37, 0.0)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.2
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.78
    noise.inputs["Distortion"].default_value = 0.32
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Y"
    wave.inputs["Scale"].default_value = 34.0
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 4.0
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.36
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = rgba(dark)
    ramp.color_ramp.elements[1].color = rgba(light)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.002

    links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    links.new(noise.outputs["Fac"], mix.inputs[1])
    links.new(wave.outputs["Color"], mix.inputs[2])
    links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def mapped_surface_material(
    name: str,
    color: str,
    roughness: float,
    texture_dir: Path,
    *,
    repeats: tuple[float, float, float],
    normal_strength: float,
    use_diffuse: bool = False,
    metallic: float = 0.0,
    coat: float = 0.0,
) -> bpy.types.Material:
    """Add UV-mapped relief to a tinted, glTF-compatible surface."""
    material = principled_material(name, color, roughness, metallic, coat=coat)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = repeats
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    if use_diffuse:
        diffuse = nodes.new("ShaderNodeTexImage")
        diffuse.image = bpy.data.images.load(str(texture_dir / "diffuse.jpg"), check_existing=True)
        diffuse.extension = "REPEAT"
        links.new(mapping.outputs["Vector"], diffuse.inputs["Vector"])
        links.new(diffuse.outputs["Color"], bsdf.inputs["Base Color"])

    roughness_map = nodes.new("ShaderNodeTexImage")
    roughness_map.image = bpy.data.images.load(str(texture_dir / "roughness.jpg"), check_existing=True)
    roughness_map.image.colorspace_settings.name = "Non-Color"
    roughness_map.extension = "REPEAT"
    links.new(mapping.outputs["Vector"], roughness_map.inputs["Vector"])
    links.new(roughness_map.outputs["Color"], bsdf.inputs["Roughness"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(str(texture_dir / "normal.jpg"), check_existing=True)
    normal.image.colorspace_settings.name = "Non-Color"
    normal.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def pbr_image_material(
    name: str,
    texture_dir: Path,
    *,
    repeats: tuple[float, float, float] = (1.0, 1.0, 1.0),
    normal_strength: float = 0.75,
) -> bpy.types.Material:
    """Build an export-safe local PBR material from authored texture maps."""
    material = principled_material(name, "#ffffff", 0.62)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")

    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = repeats
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])

    diffuse = nodes.new("ShaderNodeTexImage")
    diffuse.image = bpy.data.images.load(str(texture_dir / "diffuse.jpg"), check_existing=True)
    diffuse.extension = "REPEAT"
    links.new(mapping.outputs["Vector"], diffuse.inputs["Vector"])
    links.new(diffuse.outputs["Color"], bsdf.inputs["Base Color"])

    roughness = nodes.new("ShaderNodeTexImage")
    roughness.image = bpy.data.images.load(str(texture_dir / "roughness.png"), check_existing=True)
    roughness.image.colorspace_settings.name = "Non-Color"
    roughness.extension = "REPEAT"
    links.new(mapping.outputs["Vector"], roughness.inputs["Vector"])
    links.new(roughness.outputs["Color"], bsdf.inputs["Roughness"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.image = bpy.data.images.load(str(texture_dir / "normal-gl.jpg"), check_existing=True)
    normal.image.colorspace_settings.name = "Non-Color"
    normal.extension = "REPEAT"
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = normal_strength
    links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    segments: int = 3,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
    move_to_collection(obj, target)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 48,
    bevel: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bevel > 0:
        modifier = obj.modifiers.new("Edge radius", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    move_to_collection(obj, target)
    return obj


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 16
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for handle, point in zip(spline.bezier_points, points):
        handle.co = point
        handle.handle_left_type = "AUTO"
        handle.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    target.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def mesh_from_bmesh(
    name: str,
    bm: bmesh.types.BMesh,
    material: bpy.types.Material | None,
    target: bpy.types.Collection,
    *,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
    smooth: bool = True,
) -> bpy.types.Object:
    """Turn a finished bmesh into a linked object; the bmesh is freed."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    if material is not None:
        mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    if parent is not None:
        obj.parent = parent
    target.objects.link(obj)
    return obj


def bevelled_block(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    target: bpy.types.Collection,
    *,
    bevel: float,
    segments: int = 3,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    parent: bpy.types.Object | None = None,
) -> bpy.types.Object:
    """A box with its edges bevelled in bmesh rather than by a modifier.

    Dimensions are the outer size; the block is centred on its location. Use
    this for repeated background parts, where a modifier per object would be
    hundreds of modifier applications at export.
    """
    width, depth, height = dimensions
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((vertex.co.x * width, vertex.co.y * depth, vertex.co.z * height))
    if bevel > 0:
        bmesh.ops.bevel(
            bm,
            geom=bm.edges[:],
            offset=min(bevel, min(dimensions) * 0.45),
            segments=segments,
            affect="EDGES",
        )
    return mesh_from_bmesh(
        name, bm, material, target, location=location, rotation=rotation, parent=parent
    )


def aim_at(obj: bpy.types.Object, target: tuple[float, float, float], track_axis: str = "-Z") -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat(track_axis, "Y").to_euler()


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    target_point: tuple[float, float, float],
    energy: float,
    color: str,
    size: float,
    size_y: float,
    target: bpy.types.Collection,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = rgba(color)[:3]
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.location = location
    aim_at(obj, target_point)
    return obj


def add_spot_light(
    name: str,
    location: tuple[float, float, float],
    target_point: tuple[float, float, float],
    energy: float,
    color: str,
    target: bpy.types.Collection,
    *,
    spot_size: float,
    blend: float = 0.85,
    radius: float = 0.08,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "SPOT")
    data.energy = energy
    data.color = rgba(color)[:3]
    data.spot_size = spot_size
    data.spot_blend = blend
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.location = location
    aim_at(obj, target_point)
    return obj


def add_point_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: str,
    target: bpy.types.Collection,
    *,
    radius: float = 0.03,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "POINT")
    data.energy = energy
    data.color = rgba(color)[:3]
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.location = location
    return obj


def import_glb(
    path: Path,
    name: str,
    target: bpy.types.Collection,
    *,
    scale: float = 0.001,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    material: bpy.types.Material | None = None,
) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    root_objects = [obj for obj in imported if obj.parent is None]
    for obj in root_objects:
        obj.scale = (scale, scale, scale)
        obj.location = location
        # glTF roots import in quaternion mode. Writing rotation_euler without
        # switching modes is silently ignored, which left every Z-up CAD desk
        # prop standing on end in the first look-development render.
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = rotation
    for obj in imported:
        move_to_collection(obj, target)
        if obj.type == "MESH":
            if material:
                obj.data.materials.clear()
                obj.data.materials.append(material)
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    if imported:
        imported[0].name = name
    return imported


def import_glb_group(
    path: Path,
    name: str,
    target: bpy.types.Collection,
    *,
    scale: float = 1.0,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> list[bpy.types.Object]:
    """Import a multi-root GLB under one anchor without collapsing offsets."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    roots = [obj for obj in imported if obj.parent is None]
    anchor = bpy.data.objects.new(name, None)
    target.objects.link(anchor)
    for obj in roots:
        obj.parent = anchor
    anchor.location = location
    anchor.rotation_mode = "XYZ"
    anchor.rotation_euler = rotation
    anchor.scale = (scale, scale, scale)
    for obj in imported:
        move_to_collection(obj, target)
    return [anchor, *imported]


def duplicate_object(
    source: bpy.types.Object,
    name: str,
    target: bpy.types.Collection,
    *,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale: float | None = None,
    linked: bool = True,
) -> bpy.types.Object:
    """A placed copy of a mesh object. Linked copies share mesh data until export
    bakes world transforms, which keeps repeated background assets one upload
    in the .blend and lets the exporter merge them by material."""
    obj = source.copy()
    if not linked:
        obj.data = source.data.copy()
    obj.location = location
    obj.rotation_mode = "XYZ"
    obj.rotation_euler = rotation
    if scale is not None:
        obj.scale = (scale, scale, scale)
    obj.name = name
    obj.parent = None
    target.objects.link(obj)
    return obj


def bake_object_transform(obj: bpy.types.Object, *, keep_location: bool = True) -> None:
    """Fold an object's rotation and scale into its mesh data.

    Data-level, not the transform-apply operator: the operator needs the
    object selected and visible in the view layer, and on a hidden sources
    collection it silently does nothing — which left every CAD chair lying
    on its back at millimetre scale in the office's first build.
    """
    rotation = obj.rotation_euler.to_matrix().to_4x4()
    scale = Matrix.Diagonal((*obj.scale, 1.0))
    obj.data.transform(rotation @ scale)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    if not keep_location:
        obj.location = (0.0, 0.0, 0.0)


def crease_by_angle(obj: bpy.types.Object, degrees: float = 40.0) -> None:
    """Smooth shading with every edge over `degrees` marked sharp — the 40°
    crease the deck applies to CAD props at runtime (lib/propSurface.js).
    Shaded fully smooth a CAD box becomes a gradient blob; fully flat, every
    lathe facet shows. Sharp edges survive export as split normals."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    threshold = math.radians(degrees)
    for edge in bm.edges:
        faces = edge.link_faces
        if len(faces) == 2:
            edge.smooth = faces[0].normal.angle(faces[1].normal, 0.0) <= threshold
    for face in bm.faces:
        face.smooth = True
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def add_decimate(obj: bpy.types.Object, ratio: float) -> None:
    """Background copies of hero assets carry a collapse decimate, applied at export."""
    modifier = obj.modifiers.new("Background decimate", "DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True


def world_bounds(obj: bpy.types.Object) -> tuple[float, float, float, float, float, float]:
    """(min x, max x, min y, max y, min z, max z) of an object's box in world space."""
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        min(p.x for p in points),
        max(p.x for p in points),
        min(p.y for p in points),
        max(p.y for p in points),
        min(p.z for p in points),
        max(p.z for p in points),
    )


def seat_on(objects: list[bpy.types.Object], surface_z: float, gap: float = 0.0015) -> None:
    """Drop an imported group so its lowest vertex rests on a surface.

    Imported assets keep their origin wherever their author left it, so a
    location alone sinks some into the desk and floats others above it. The
    measured world-space bottom is the only placement that always sits.
    """
    bpy.context.view_layer.update()
    lowest = min(
        (obj.matrix_world @ Vector(corner)).z
        for obj in objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    )
    lift = Vector((0.0, 0.0, surface_z + gap - lowest))
    for obj in objects:
        if obj.parent is None or obj.parent not in objects:
            # A child's location is in its parent's space, and imported
            # anchors are often rotated; move it by the world lift expressed there.
            delta = lift if obj.parent is None else obj.parent.matrix_world.to_3x3().inverted() @ lift
            obj.location += delta


def box_project_uv(obj: bpy.types.Object, metres_per_tile: float = 1.0) -> None:
    """World-scale box projection: one UV tile per `metres_per_tile` of surface.

    Every face takes the two world axes across its dominant normal, so a
    partition 0.9 m tall and a partition 7 m long carry the same fabric
    weave, and a runtime map at repeat 1 tiles once per metre on both. Run it
    after the object is placed; the projection reads world coordinates.
    """
    bpy.context.view_layer.update()
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    matrix = obj.matrix_world
    normal_matrix = matrix.to_3x3().inverted().transposed()
    scale = 1.0 / metres_per_tile
    for polygon in mesh.polygons:
        normal = (normal_matrix @ polygon.normal).normalized()
        axis = max(range(3), key=lambda index: abs(normal[index]))
        for loop_index in polygon.loop_indices:
            point = matrix @ mesh.vertices[mesh.loops[loop_index].vertex_index].co
            if axis == 0:
                u, v = point.y, point.z
            elif axis == 1:
                u, v = point.x, point.z
            else:
                u, v = point.x, point.y
            uv_layer[loop_index].uv = (u * scale, v * scale)


def fitted_uv(
    obj: bpy.types.Object,
    *,
    x_range: tuple[float, float],
    y_range: tuple[float, float],
) -> None:
    """0–1 UVs across a horizontal slab's world footprint, for maps painted to
    exactly that extent (the deck's carpet tile field and ceiling maps). U
    runs with +X and V with +Y, which after the exporter's V flip lands the
    painted map's top row at the far (+Y) end — the orientation both painters
    assume when their textures are sampled with flipY off."""
    bpy.context.view_layer.update()
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    uv_layer = mesh.uv_layers.active.data
    matrix = obj.matrix_world
    x0, x1 = x_range
    y0, y1 = y_range
    for loop in mesh.loops:
        point = matrix @ mesh.vertices[loop.vertex_index].co
        uv_layer[loop.index].uv = ((point.x - x0) / (x1 - x0), (point.y - y0) / (y1 - y0))


def make_camera(
    name: str,
    position: tuple[float, float, float],
    target_point: tuple[float, float, float],
    target: bpy.types.Collection,
    fov_degrees: float = 35.0,
) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.sensor_fit = "VERTICAL"
    data.sensor_height = 32.0
    data.lens = data.sensor_height / (2 * math.tan(math.radians(fov_degrees) / 2))
    data.dof.use_dof = False
    data.lens_unit = "MILLIMETERS"
    data.clip_start = 0.01
    data.clip_end = 100.0
    obj = bpy.data.objects.new(name, data)
    target.objects.link(obj)
    obj.location = position
    aim_at(obj, target_point)
    return obj


def deck_camera(
    name: str,
    position: tuple[float, float, float],
    target_point: tuple[float, float, float],
    target: bpy.types.Collection,
    fov_degrees: float = 35.0,
) -> bpy.types.Object:
    """A camera at one of the deck's waypoints, given in the deck's scene units."""
    return make_camera(
        name,
        three_to_blender(*position),
        three_to_blender(*target_point),
        target,
        fov_degrees=fov_degrees,
    )


def configure_eevee(
    scene: bpy.types.Scene,
    *,
    filepath: Path,
    world_color: tuple[float, float, float, float],
    world_strength: float,
    exposure: float,
    samples: int = 128,
    resolution: tuple[int, int] = (1920, 1080),
) -> None:
    """EEVEE lookdev settings shared by the sets: AgX, a faint world wash
    standing in for the deck's environment map, and the deck's 16:9 frame."""
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = samples
    scene.eevee.use_raytracing = True
    scene.eevee.shadow_ray_count = 4
    scene.eevee.shadow_step_count = 8
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True

    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = world_color
    background.inputs["Strength"].default_value = world_strength

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = exposure
    scene.view_settings.gamma = 1.0
    scene.render.use_stamp = False
    scene.render.filepath = str(filepath)


def render_still(scene: bpy.types.Scene, camera: bpy.types.Object, filepath: Path) -> None:
    scene.camera = camera
    scene.render.filepath = str(filepath)
    bpy.ops.render.render(write_still=True)


def stamp_contract(scene: bpy.types.Scene) -> None:
    """The metric/axis contract every exported set carries in its scene extras."""
    scene["r3f_scene_units_per_metre"] = SCENE_UNITS_PER_METRE
    scene["live_glass_width_m"] = GLASS_WIDTH_M
    scene["live_glass_height_m"] = GLASS_HEIGHT_M
    scene["coordinate_contract"] = COORDINATE_CONTRACT
