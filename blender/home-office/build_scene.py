#!/usr/bin/env python3
"""Build the cinematic home-office source scene for The True Cost of AI Coding.

The scene is authored at true metric scale in Blender. The live talk uses a
520 mm glass width as 16 Three.js scene units, so exported metric assets are
scaled by 30.7692307692 at the R3F boundary.

Run:
    blender --background --factory-startup --python blender/home-office/build_scene.py

The script saves ``home-office.blend`` beside itself and writes look-development
renders under ``quality-artifacts/blender-home/lookdev``.
"""

from __future__ import annotations

import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "public" / "models"
ASSET_DIR = SOURCE_DIR / "assets"
RENDER_DIR = ROOT / "quality-artifacts" / "blender-home" / "lookdev"
BLEND_PATH = SOURCE_DIR / "home-office.blend"

SCENE_UNITS_PER_METRE = 16.0 / 0.520
METRES_PER_SCENE_UNIT = 1.0 / SCENE_UNITS_PER_METRE
FLOOR_Z = -34.34 * METRES_PER_SCENE_UNIT
CEILING_Z = 42.0 * METRES_PER_SCENE_UNIT
DESK_TOP_Z = -8.34 * METRES_PER_SCENE_UNIT
# The wool desk mat (build_desk) is 6 mm thick and sits 1 mm proud of the top;
# anything on the mat is seated here, not on the desk.
DESK_MAT_TOP_Z = DESK_TOP_Z + 0.007
BACK_WALL_Y = 64.0 * METRES_PER_SCENE_UNIT
FRONT_Y = -35.0 * METRES_PER_SCENE_UNIT
ROOM_HALF_WIDTH = 78.0 * METRES_PER_SCENE_UNIT

random.seed(0x3A0F11CE)


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
    # explicit physical fallback for export_scene.py instead of letting linked
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


def build_floor(target: bpy.types.Collection, material: bpy.types.Material) -> None:
    width = ROOM_HALF_WIDTH * 2
    depth = BACK_WALL_Y - FRONT_Y
    add_box(
        "Dark oak plank floor",
        (width, depth, 0.04),
        (0, (FRONT_Y + BACK_WALL_Y) / 2, FLOOR_Z - 0.0215),
        material,
        target,
        bevel=0.002,
        segments=2,
    )


def build_architecture(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    wall_thickness = 0.12
    wall_height = CEILING_Z - FLOOR_Z
    wall_mid = (CEILING_Z + FLOOR_Z) / 2

    # Side walls and ceiling are complete physical returns rather than infinite planes.
    add_box(
        "Left wall",
        (wall_thickness, BACK_WALL_Y - FRONT_Y, wall_height),
        (-ROOM_HALF_WIDTH - wall_thickness / 2, (BACK_WALL_Y + FRONT_Y) / 2, wall_mid),
        mats["wall"],
        target,
        bevel=0.006,
    )
    add_box(
        "Right wall",
        (wall_thickness, BACK_WALL_Y - FRONT_Y, wall_height),
        (ROOM_HALF_WIDTH + wall_thickness / 2, (BACK_WALL_Y + FRONT_Y) / 2, wall_mid),
        mats["wall"],
        target,
        bevel=0.006,
    )
    add_box(
        "Ceiling",
        (ROOM_HALF_WIDTH * 2 + wall_thickness * 2, BACK_WALL_Y - FRONT_Y, 0.09),
        (0, (BACK_WALL_Y + FRONT_Y) / 2, CEILING_Z + 0.045),
        mats["ceiling"],
        target,
        bevel=0.004,
    )

    door_cx, door_w = -1.67, 0.86
    door_left, door_right = door_cx - door_w / 2, door_cx + door_w / 2
    door_top = FLOOR_Z + 2.08
    window_cx, window_w = 1.36, 1.24
    window_left, window_right = window_cx - window_w / 2, window_cx + window_w / 2
    window_bottom, window_top = FLOOR_Z + 0.88, FLOOR_Z + 2.08

    spans = [
        (-ROOM_HALF_WIDTH, door_left, FLOOR_Z, CEILING_Z),
        (door_right, window_left, FLOOR_Z, CEILING_Z),
        (window_right, ROOM_HALF_WIDTH, FLOOR_Z, CEILING_Z),
        (door_left, door_right, door_top, CEILING_Z),
        (window_left, window_right, FLOOR_Z, window_bottom),
        (window_left, window_right, window_top, CEILING_Z),
    ]
    for index, (left, right, bottom, top) in enumerate(spans):
        add_box(
            f"Back wall {index + 1}",
            (right - left, wall_thickness, top - bottom),
            ((left + right) / 2, BACK_WALL_Y + wall_thickness / 2, (bottom + top) / 2),
            mats["wall"],
            target,
            bevel=0.004,
        )

    # Doorway casing and a finite hall beyond it create a real third depth plane.
    trim = 0.055
    for x in (door_left, door_right):
        add_box(
            "Door casing",
            (trim, 0.09, door_top - FLOOR_Z + 0.08),
            (x, BACK_WALL_Y - 0.045, (door_top + FLOOR_Z) / 2),
            mats["trim"],
            target,
            bevel=0.006,
        )
    add_box(
        "Door casing header",
        (door_w + trim * 2, 0.09, trim),
        (door_cx, BACK_WALL_Y - 0.045, door_top),
        mats["trim"],
        target,
        bevel=0.006,
    )
    hall_y = BACK_WALL_Y + 0.82
    add_box(
        "Hall termination",
        (door_w, 0.08, door_top - FLOOR_Z),
        (door_cx, hall_y, (door_top + FLOOR_Z) / 2),
        mats["hall"],
        target,
    )
    for x in (door_left - 0.035, door_right + 0.035):
        add_box(
            "Hall return",
            (0.07, hall_y - BACK_WALL_Y, door_top - FLOOR_Z),
            (x, (hall_y + BACK_WALL_Y) / 2, (door_top + FLOOR_Z) / 2),
            mats["hall"],
            target,
        )
    add_box(
        "Hall floor",
        (door_w, hall_y - BACK_WALL_Y, 0.025),
        (door_cx, (hall_y + BACK_WALL_Y) / 2, FLOOR_Z),
        mats["hall_floor"],
        target,
    )
    # An almost-closed door turns the hall illumination into a narrow, motivated
    # spill instead of the first pass's abstract full-height white wedge.
    add_box(
        "Partly open door",
        (door_w - 0.08, 0.045, door_top - FLOOR_Z - 0.07),
        (door_cx - 0.10, BACK_WALL_Y - 0.02, (door_top + FLOOR_Z) / 2),
        mats["door"],
        target,
        rotation=(0, 0, math.radians(-7)),
        bevel=0.009,
        segments=4,
    )
    add_cylinder(
        "Door handle",
        0.018,
        0.075,
        (door_cx + 0.24, BACK_WALL_Y - 0.075, FLOOR_Z + 1.02),
        mats["chrome"],
        target,
        rotation=(math.pi / 2, 0, 0),
        vertices=32,
        bevel=0.003,
    )

    # Deep window reveal, mullions, glass, and a partially lowered linen blind.
    add_box(
        "Night window",
        (window_w - 0.07, 0.025, window_top - window_bottom - 0.07),
        (window_cx, BACK_WALL_Y + 0.075, (window_top + window_bottom) / 2),
        mats["glass"],
        target,
    )
    for x in (window_left, window_right, window_cx):
        width = 0.052 if x != window_cx else 0.035
        add_box(
            "Window vertical frame",
            (width, 0.115, window_top - window_bottom + 0.08),
            (x, BACK_WALL_Y - 0.015, (window_top + window_bottom) / 2),
            mats["window_frame"],
            target,
            bevel=0.004,
        )
    for z in (window_bottom, window_top, (window_top + window_bottom) / 2):
        add_box(
            "Window horizontal frame",
            (window_w + 0.08, 0.115, 0.052),
            (window_cx, BACK_WALL_Y - 0.015, z),
            mats["window_frame"],
            target,
            bevel=0.004,
        )
    add_box(
        "Roller blind",
        (window_w - 0.09, 0.018, 0.63),
        (window_cx, BACK_WALL_Y - 0.085, window_top - 0.315),
        mats["blind"],
        target,
        bevel=0.003,
    )
    add_cylinder(
        "Blind lower bar",
        0.012,
        window_w - 0.08,
        (window_cx, BACK_WALL_Y - 0.11, window_top - 0.64),
        mats["window_frame"],
        target,
        rotation=(0, math.pi / 2, 0),
        vertices=32,
    )

    # Continuous baseboards establish contact and scale. The back one stops
    # either side of the acoustic panel, which runs floor to ceiling in front
    # of the wall.
    base_z = FLOOR_Z + 0.045
    panel_left, panel_right = -0.77, 0.81
    for x0, x1 in ((-ROOM_HALF_WIDTH, panel_left), (panel_right, ROOM_HALF_WIDTH)):
        add_box(
            "Back baseboard",
            (x1 - x0, 0.026, 0.09),
            ((x0 + x1) / 2, BACK_WALL_Y - 0.07, base_z),
            mats["trim"],
            target,
            bevel=0.004,
        )
    for x in (-ROOM_HALF_WIDTH + 0.02, ROOM_HALF_WIDTH - 0.02):
        add_box(
            "Side baseboard",
            (0.026, BACK_WALL_Y - FRONT_Y, 0.09),
            (x, (BACK_WALL_Y + FRONT_Y) / 2, base_z),
            mats["trim"],
            target,
            bevel=0.004,
        )

    # Contemporary slatted acoustic field behind the monitor — floor to
    # ceiling, dark, not decorative glow.
    panel_y = BACK_WALL_Y - 0.072
    panel_bottom = FLOOR_Z - 0.002
    panel_top = CEILING_Z + 0.002
    panel_height = panel_top - panel_bottom
    panel_z = (panel_top + panel_bottom) / 2
    add_box(
        "Acoustic felt backing",
        (1.52, 0.025, panel_height),
        (0.02, panel_y + 0.018, panel_z),
        mats["felt"],
        target,
        bevel=0.006,
    )
    for index in range(19):
        x = -0.69 + index * 0.078
        add_box(
            f"Acoustic walnut slat {index + 1:02d}",
            (0.036, 0.035, panel_height - 0.012),
            (x, panel_y - 0.014, panel_z),
            mats["slat"],
            target,
            bevel=0.0035,
            segments=2,
        )

    # Two simple recessed downlights remain visibly switched off.
    for x in (-0.85, 0.85):
        add_cylinder(
            "Unlit ceiling aperture",
            0.062,
            0.018,
            (x, 0.45, CEILING_Z - 0.035),
            mats["black"],
            target,
            vertices=48,
        )


def build_desk(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    add_box(
        "Walnut desk top",
        (2.20, 0.95, 0.045),
        (0, 0.065, DESK_TOP_Z - 0.0225),
        mats["desk"],
        target,
        bevel=0.018,
        segments=5,
    )
    # Powder-coated trestles and rear stretcher are actual load-bearing construction.
    leg_x = 0.88
    for side in (-1, 1):
        x = side * leg_x
        add_box(
            "Desk leg upright",
            (0.055, 0.055, DESK_TOP_Z - FLOOR_Z - 0.08),
            (x, 0.15, FLOOR_Z + (DESK_TOP_Z - FLOOR_Z) / 2),
            mats["steel"],
            target,
            bevel=0.006,
        )
        add_box(
            "Desk leg foot",
            (0.54, 0.065, 0.045),
            (x, 0.15, FLOOR_Z + 0.024),
            mats["steel"],
            target,
            bevel=0.012,
        )
    add_box(
        "Desk rear stretcher",
        (1.82, 0.045, 0.065),
        (0, 0.42, FLOOR_Z + 0.30),
        mats["steel"],
        target,
        bevel=0.006,
    )
    add_box(
        "Cable tray",
        (1.32, 0.16, 0.055),
        (0.05, 0.38, DESK_TOP_Z - 0.12),
        mats["steel"],
        target,
        bevel=0.008,
    )
    add_box(
        "Desk mat",
        (1.18, 0.48, 0.006),
        (0.12, -0.13, DESK_TOP_Z + 0.004),
        mats["desk_mat"],
        target,
        bevel=0.018,
        segments=5,
    )

    # Low right-side credenza is background furniture, not an isolated prop.
    # Held off the back wall far enough that the plant on it clears the wall.
    credenza_x, credenza_y = 1.76, 1.57
    add_box(
        "Credenza carcass",
        (1.20, 0.36, 0.54),
        (credenza_x, credenza_y, FLOOR_Z + 0.31),
        mats["credenza"],
        target,
        bevel=0.014,
        segments=4,
    )
    for index in range(3):
        x = credenza_x - 0.38 + index * 0.38
        add_box(
            "Credenza door",
            (0.355, 0.018, 0.43),
            (x, credenza_y - 0.19, FLOOR_Z + 0.32),
            mats["credenza_front"],
            target,
            bevel=0.008,
        )
        add_box(
            "Credenza pull",
            (0.075, 0.018, 0.012),
            (x, credenza_y - 0.207, FLOOR_Z + 0.48),
            mats["steel"],
            target,
            bevel=0.004,
        )
    for x in (credenza_x - 0.48, credenza_x + 0.48):
        add_cylinder(
            "Credenza leg",
            0.018,
            0.10,
            (x, credenza_y, FLOOR_Z + 0.05),
            mats["steel"],
            target,
            vertices=24,
        )


KEY_UNIT = 0.01905
# A 60% board: 61 keys in five rows at the standard pitch, with the real
# widths for Backspace, Tab, Caps, Enter, both Shifts and the bottom row.
KEY_ROWS = (
    (1,) * 13 + (2,),
    (1.5,) + (1,) * 12 + (1.5,),
    (1.75,) + (1,) * 11 + (2.25,),
    (2.25,) + (1,) * 10 + (2.75,),
    (1.25,) * 3 + (6.25,) + (1.25,) * 4,
)
# OEM profile: the number row is tallest, the home row lowest.
KEY_ROW_HEIGHTS = (0.0116, 0.0106, 0.0098, 0.0102, 0.0094)


def build_keyboard(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    """A compact mechanical keyboard, modelled.

    The old board was a grid of identical pillows on a slab, and a keyboard
    is a specific object: a 60% layout at 19.05 mm pitch with the right
    modifier widths, tapered caps in a row profile, a dark plate showing in
    the gaps, a low case at a typing angle with a recess the caps sit in.
    Everything hangs off one rig empty pivoted at the front edge on the mat,
    so the tilt raises the back; the exporter bakes the world transforms.
    """
    bezel = 0.0055
    width = 15 * KEY_UNIT + 2 * bezel
    depth = 5 * KEY_UNIT + 2 * bezel
    case_height = 0.0135
    recess = 0.0045
    # Centred under the glass, which also keeps it clear of the binder.
    rig = bpy.data.objects.new("Keyboard", None)
    target.objects.link(rig)
    rig.location = (0.0, -0.235 - depth / 2, DESK_MAT_TOP_Z)
    rig.rotation_mode = "XYZ"
    rig.rotation_euler = (math.radians(4.5), 0, math.radians(-1.5))

    def mesh_object(
        name: str,
        bm: bmesh.types.BMesh,
        material: bpy.types.Material,
        location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    ) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        obj.parent = rig
        obj.location = location
        target.objects.link(obj)
        return obj

    # The case: a bevelled block whose top is inset by the bezel and pushed
    # down into a recess, so the plate and the cap bases sit inside it.
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * width,
            (vertex.co.y + 0.5) * depth,
            (vertex.co.z + 0.5) * case_height,
        ))
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0025, segments=4, affect="EDGES")
    bm.faces.ensure_lookup_table()

    def face_height(face: bmesh.types.BMFace) -> float:
        return face.calc_center_median().z

    top = max(bm.faces, key=face_height)
    bmesh.ops.inset_individual(bm, faces=[top], thickness=bezel - 0.0025, depth=0.0)
    for vertex in top.verts:
        vertex.co.z -= recess
    mesh_object("Keyboard case", bm, mats["keyboard"])

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vertex in bm.verts:
        vertex.co = Vector((
            vertex.co.x * (width - 2 * bezel + 0.002),
            bezel - 0.001 + (vertex.co.y + 0.5) * (depth - 2 * bezel + 0.002),
            case_height - recess + (vertex.co.z + 0.5) * 0.003,
        ))
    mesh_object("Keyboard plate", bm, mats["keyboard_plate"])

    for row, widths in enumerate(KEY_ROWS):
        cy = depth - bezel - (row + 0.5) * KEY_UNIT
        x = -15 * KEY_UNIT / 2
        for column, units in enumerate(widths):
            cap_w = units * KEY_UNIT - 0.0032
            cap_d = KEY_UNIT - 0.0032
            cap_h = KEY_ROW_HEIGHTS[row]
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for vertex in bm.verts:
                top_face = vertex.co.z > 0
                sx, sy = (0.80, 0.74) if top_face else (1.0, 1.0)
                vertex.co = Vector((
                    vertex.co.x * cap_w * sx,
                    vertex.co.y * cap_d * sy + (0.0009 if top_face else 0.0),
                    (vertex.co.z + 0.5) * cap_h,
                ))
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.0011, segments=3, affect="EDGES")
            mesh_object(
                f"Keycap {row + 1:02d}-{column + 1:02d}",
                bm,
                mats["keycap"] if units == 1 else mats["keycap_mod"],
                (x + units * KEY_UNIT / 2, cy, case_height - recess + 0.003),
            )
            x += units * KEY_UNIT

    cable = add_curve(
        "Keyboard cable",
        [
            (0.0, depth + 0.001, 0.008),
            (0.03, depth + 0.10, -0.002),
            (0.10, depth + 0.30, -0.03),
            (0.16, depth + 0.55, -0.11),
        ],
        0.0022,
        mats["rubber"],
        target,
    )
    cable.parent = rig


def build_shelving(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Side-wall bookcase catches the oblique return camera and supplies a near edge.
    x = ROOM_HALF_WIDTH - 0.23
    add_box(
        "Side bookcase back",
        (0.035, 1.05, 1.72),
        (x + 0.10, 0.92, FLOOR_Z + 0.95),
        mats["bookcase"],
        target,
        bevel=0.006,
    )
    for z in (FLOOR_Z + 0.12, FLOOR_Z + 0.54, FLOOR_Z + 0.96, FLOOR_Z + 1.38, FLOOR_Z + 1.78):
        add_box(
            "Bookcase shelf",
            (0.42, 1.05, 0.035),
            (x, 0.92, z),
            mats["bookcase"],
            target,
            bevel=0.005,
        )
    for y in (0.405, 1.435):
        add_box(
            "Bookcase side",
            (0.035, 0.035, 1.69),
            (x, y, FLOOR_Z + 0.95),
            mats["bookcase"],
            target,
            bevel=0.005,
        )

    muted_book_mats = [mats["book_warm"], mats["book_cool"], mats["book_paper"]]
    # Books stand upright and packed: a lean about the wrong axis lifted one
    # bottom edge off the shelf, which reads as a modelling error, not a book.
    for shelf in range(4):
        cursor = 0.47
        count = (5, 7, 4, 6)[shelf]
        shelf_top = FLOOR_Z + 0.12 + shelf * 0.42 + 0.0175
        for index in range(count):
            width = random.uniform(0.025, 0.055)
            height = random.uniform(0.19, 0.31)
            add_box(
                f"Book {shelf + 1:02d}-{index + 1:02d}",
                (0.20, width, height),
                (x - 0.03, cursor + width / 2, shelf_top + 0.001 + height / 2),
                muted_book_mats[(shelf + index) % len(muted_book_mats)],
                target,
                bevel=0.003,
                segments=2,
            )
            cursor += width + 0.005

    # Floating shelves on the back wall hold a sparse, believable history. They
    # fit the wall between the door casing and the acoustic panel; the books
    # stand ON the lower shelf, packed from its left end and set back from its
    # front edge, and the upper shelf clears the tallest of them.
    # Low enough that the books are in frame on the reveal and boundaries
    # cameras rather than cut by the top of it.
    shelf_y = BACK_WALL_Y - 0.14
    lower_shelf_z = FLOOR_Z + 1.63
    upper_shelf_z = FLOOR_Z + 1.95
    for z in (lower_shelf_z, upper_shelf_z):
        add_box(
            "Floating walnut shelf",
            (0.40, 0.17, 0.035),
            (-0.97, shelf_y, z),
            mats["slat"],
            target,
            bevel=0.007,
        )
    cursor = -1.15
    for index in range(7):
        width = random.uniform(0.026, 0.047)
        height = random.uniform(0.16, 0.23)
        add_box(
            f"Shelf book {index + 1:02d}",
            (width, 0.13, height),
            (cursor + width / 2, shelf_y + 0.01, lower_shelf_z + 0.0175 + 0.001 + height / 2),
            muted_book_mats[index % len(muted_book_mats)],
            target,
            bevel=0.003,
            segments=2,
        )
        cursor += width + 0.004


def build_plant(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    pot_x, pot_y = 1.76, 1.46
    add_cylinder(
        "Plant pot",
        0.145,
        0.29,
        (pot_x, pot_y, FLOOR_Z + 0.15),
        mats["pot"],
        target,
        vertices=64,
        bevel=0.008,
    )
    branch_points = [
        [(pot_x, pot_y, FLOOR_Z + 0.28), (pot_x - 0.08, pot_y, FLOOR_Z + 0.78), (pot_x - 0.20, pot_y + 0.02, FLOOR_Z + 1.22)],
        [(pot_x, pot_y, FLOOR_Z + 0.28), (pot_x + 0.09, pot_y, FLOOR_Z + 0.86), (pot_x + 0.22, pot_y - 0.03, FLOOR_Z + 1.35)],
        [(pot_x, pot_y, FLOOR_Z + 0.31), (pot_x + 0.02, pot_y, FLOOR_Z + 0.94), (pot_x - 0.02, pot_y + 0.02, FLOOR_Z + 1.52)],
    ]
    for index, points in enumerate(branch_points):
        add_curve(f"Plant branch {index + 1}", points, 0.011, mats["stem"], target)
    for index in range(34):
        height = FLOOR_Z + random.uniform(0.58, 1.50)
        angle = random.uniform(0, math.tau)
        radius = random.uniform(0.08, 0.34)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
        leaf = bpy.context.object
        leaf.name = f"Plant leaf {index + 1:02d}"
        leaf.location = (
            pot_x + math.cos(angle) * radius,
            pot_y + math.sin(angle) * radius * 0.35,
            height,
        )
        leaf.scale = (random.uniform(0.055, 0.10), random.uniform(0.018, 0.032), random.uniform(0.11, 0.18))
        leaf.rotation_euler = (random.uniform(-0.35, 0.35), random.uniform(-0.45, 0.45), angle)
        leaf.data.materials.append(mats["leaf_a"] if index % 3 else mats["leaf_b"])
        move_to_collection(leaf, target)


def build_chair(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Reuse the approved production task-chair silhouette rather than dressing up
    # a stack of rounded boxes. Blender owns the broad upholstery/frame/metal
    # separation that the original UV-less CAD export could not carry itself.
    # Pushed back from the desk's front edge: any closer and the backrest
    # passes through the top.
    imported = import_glb(
        MODEL_DIR / "office-chair.glb",
        "Home task chair",
        target,
        location=(-0.98, -0.80, FLOOR_Z),
        rotation=(-math.pi / 2, 0, math.radians(8)),
    )
    for obj in imported:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        obj.select_set(False)
        obj.data.materials.clear()
        for material in (mats["chair_fabric"], mats["chair_frame"], mats["chrome"]):
            obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            center = polygon.center
            radial = math.hypot(center.x, center.y)
            polygon.material_index = 0 if center.z > 0.43 else 2 if 0.18 < center.z < 0.42 and radial < 0.075 else 1


def build_mouse(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    location: tuple[float, float, float],
    yaw: float,
) -> None:
    """A modern mouse, modelled rather than imported.

    The CAD mouse read as a lump and a squashed sphere read as an egg. This
    is a bevelled block with a palm hump two-thirds back, a lower and
    narrower nose, and a flat base: the block's soft shoulders and flatter
    top are what make it read as a product. The button split, the seam
    across, and the wheel are ray-cast onto the finished surface, so they sit
    on it whatever the profile does. The nose points away from the sitter
    (local −y), toward the glass.
    """
    length, width, height = 0.118, 0.064, 0.037

    def profile(t: float) -> float:  # height along the length, 0 nose … 1 back
        return 0.50 + 0.50 * math.exp(-(((t - 0.66) / 0.32) ** 2))

    def taper(t: float) -> float:  # width along the length
        return 0.76 + 0.24 * smoothstep(0.05, 0.72, t) - 0.14 * smoothstep(0.86, 1.0, t)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.42, segments=12, affect="EDGES", profile=0.62)
    for vertex in bm.verts:
        x, y, z = vertex.co
        t = y + 0.5
        vertex.co = Vector((x * width * taper(t), y * length, (z + 0.5) * height * profile(t)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    mesh = bpy.data.meshes.new("Mouse body")
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    body = bpy.data.objects.new("Mouse body", mesh)
    body.location = location
    body.rotation_mode = "XYZ"
    body.rotation_euler = (0, 0, yaw)
    mesh.materials.append(mats["mouse"])
    target.objects.link(body)
    bpy.context.view_layer.update()

    def surface_z(local_x: float, local_y: float) -> float:
        hit, point, _normal, _index = body.ray_cast(
            Vector((local_x, local_y, height * 2)), Vector((0, 0, -1))
        )
        return point.z if hit else 0.0

    def world(local_x: float, local_y: float, local_z: float) -> tuple[float, float, float]:
        return tuple(body.matrix_world @ Vector((local_x, local_y, local_z)))

    nose = -length / 2
    split_end = nose + 0.46 * length
    add_curve(
        "Mouse button split",
        [
            world(0.0, y, surface_z(0.0, y) + 0.0003)
            for y in (nose + 0.004 + (split_end - nose - 0.004) * i / 12 for i in range(13))
        ],
        0.0011,
        mats["black"],
        target,
    )
    half_width = (width / 2) * taper(0.46) * 0.96
    add_curve(
        "Mouse button seam",
        [
            world(x, split_end, surface_z(x, split_end) + 0.0003)
            for x in (-half_width + 2 * half_width * i / 14 for i in range(15))
        ],
        0.0011,
        mats["black"],
        target,
    )
    wheel_y = nose + 0.26 * length
    wheel_top = surface_z(0.0, wheel_y)
    add_box(
        "Mouse wheel slot",
        (0.011, 0.025, 0.012),
        world(0.0, wheel_y, wheel_top - 0.0065),
        mats["black"],
        target,
        rotation=(0, 0, yaw),
    )
    add_cylinder(
        "Mouse wheel",
        0.009,
        0.0045,
        world(0.0, wheel_y, wheel_top - 0.006),
        mats["rubber"],
        target,
        rotation=(0, math.pi / 2, yaw),
        vertices=48,
    )
    x, y, z = location
    add_curve(
        "Mouse cable",
        [
            world(0.0, nose - 0.001, 0.005),
            world(0.05, nose - 0.16, 0.002),
            world(0.09, nose - 0.45, DESK_TOP_Z - z + 0.002),
            world(0.13, nose - 0.70, DESK_TOP_Z - z - 0.12),
        ],
        0.0022,
        mats["rubber"],
        target,
    )


def build_mug(
    target: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    location: tuple[float, float, float],
    yaw: float,
) -> None:
    """A lathed mug: a slight taper, a rolled lip, a thick base, coffee 14 mm
    below the rim, and a handle that plunges into the wall. Replaces a
    49k-triangle CAD lathe with straight sides and a pipe for a handle.
    """
    x, y, z = location
    profile = [
        (0.0, 0.0), (0.030, 0.0), (0.037, 0.004), (0.039, 0.030), (0.040, 0.060),
        (0.0415, 0.092), (0.0405, 0.096), (0.037, 0.096), (0.036, 0.090),
        (0.0355, 0.040), (0.033, 0.012), (0.0, 0.010),
    ]
    bm = bmesh.new()
    verts = [bm.verts.new((radius, 0.0, height)) for radius, height in profile]
    edges = [bm.edges.new((verts[index], verts[index + 1])) for index in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=64, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    mesh = bpy.data.meshes.new("Mug body")
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(mats["ceramic"])
    body = bpy.data.objects.new("Ceramic mug", mesh)
    body.location = (x, y, z + 0.001)
    body.rotation_mode = "XYZ"
    body.rotation_euler = (0, 0, yaw)
    target.objects.link(body)

    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=0.0352, fill_type="NGON", location=(x, y, z + 0.001 + 0.082))
    coffee = bpy.context.object
    coffee.name = "Mug coffee"
    coffee.data.materials.append(mats["coffee"])
    move_to_collection(coffee, target)

    bpy.ops.mesh.primitive_torus_add(major_radius=0.027, minor_radius=0.0065, major_segments=48, minor_segments=16)
    handle = bpy.context.object
    handle.name = "Mug handle"
    bm = bmesh.new()
    bm.from_mesh(handle.data)
    # Keep the outer half of the ring, cut at its centre plane so both ends
    # terminate inside the wall's thickness rather than a visible 2 mm short.
    bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if vertex.co.x < 0.0], context="VERTS")
    bm.to_mesh(handle.data)
    bm.free()
    for polygon in handle.data.polygons:
        polygon.use_smooth = True
    handle.data.materials.append(mats["ceramic"])
    handle.parent = body
    handle.location = (0.036, 0.0, 0.052)
    handle.rotation_euler = (math.pi / 2, 0, 0)
    move_to_collection(handle, target)


def build_props(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    build_keyboard(target, mats)
    # Every imported prop is seated on the measured surface it stands on (see
    # seat_on): the stationery set's origin sat 26 mm below its own base,
    # which sank its pencil cup into the desk.
    build_mouse(target, mats, (0.52, -0.24, DESK_MAT_TOP_Z), math.radians(172))
    build_mug(target, mats, (0.83, 0.01, DESK_TOP_Z), math.radians(18))
    # The notebook and the lamp are Poly Haven (CC0) models in place of the
    # CAD parts, which read as extruded blocks at any distance. The binder
    # keeps its leather and paper maps; the lamp is exported as the dark
    # painted metal the old lamp was, because its stock orange enamel would be
    # the one saturated colour in an amber room.
    # On the mat, left of the keyboard, seated on the mat's top.
    binder = import_glb_group(
        ASSET_DIR / "binder_notebook" / "binder_notebook_1k.gltf",
        "Binder notebook",
        target,
        location=(-0.695, -0.18, DESK_MAT_TOP_Z),
        rotation=(0, 0, math.radians(-11)),
    )
    # The asset ships a closed and an open copy on top of each other; a desk
    # gets the closed one.
    open_copies = [obj for obj in binder if obj.type == "MESH" and "closed" not in obj.name]
    binder = [obj for obj in binder if obj not in open_copies]
    for obj in open_copies:
        bpy.data.objects.remove(obj, do_unlink=True)
    seat_on(binder, DESK_MAT_TOP_Z)
    # The lamp's own mount is a 4 cm stem, so it stands on a weighted disc;
    # yawed so the head reaches over the desk toward the keyboard rather than
    # the wall (measured: at −110° the head sits 13 cm toward +x of the base).
    lamp_x, lamp_y = -0.97, 0.20
    add_cylinder(
        "Lamp base weight",
        0.085,
        0.014,
        (lamp_x, lamp_y, DESK_TOP_Z + 0.007),
        mats["lamp"],
        target,
        vertices=64,
        bevel=0.003,
    )
    lamp = import_glb_group(
        ASSET_DIR / "desk_lamp_arm_01" / "desk_lamp_arm_01_1k.gltf",
        "Arm lamp",
        target,
        location=(lamp_x, lamp_y, DESK_TOP_Z),
        rotation=(0, 0, math.radians(-110)),
    )
    seat_on(lamp, DESK_TOP_Z + 0.014)
    for obj in lamp:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            if material is None:
                continue
            material["export_base_color"] = rgba("#36413f")
            material["export_roughness"] = 0.36
            material["export_metallic"] = 0.56
            # The asset ships with its bulb lit. At 3am the monitor is the only
            # light in the room, so the lamp is off.
            bsdf = material.node_tree.nodes.get("Principled BSDF") if material.use_nodes else None
            if bsdf is not None:
                strength = bsdf.inputs.get("Emission Strength")
                if strength is not None:
                    for link in list(strength.links):
                        material.node_tree.links.remove(link)
                    strength.default_value = 0.0
    # Contemporary details: phone face-down, pencil, and a small interface box.
    add_box(
        "Phone face down",
        (0.075, 0.155, 0.009),
        (0.94, -0.31, DESK_TOP_Z + 0.011),
        mats["phone"],
        target,
        rotation=(0, 0, math.radians(12)),
        bevel=0.012,
        segments=5,
    )
    stationery = import_glb_group(
        ASSET_DIR / "stationery_supplies.glb",
        "Poly Haven stationery",
        target,
        location=(-0.61, 0.15, DESK_TOP_Z),
        rotation=(math.pi / 2, 0, math.radians(-6)),
        scale=0.9,
    )
    # The set's pieces sit at different heights above its own origin (the
    # pencils 35 mm above the cup's base), so each one is seated on its own.
    for obj in stationery:
        if obj.type == "MESH":
            seat_on([obj], DESK_TOP_Z)
    # The pens and pencils stand in the cup, which is what the cup is for;
    # loose on the desk beside an empty cup, the cup read as a stray mug. Each
    # is measured, reparented to the world, stood on its long axis with a
    # small lean, ringed inside the cup, and its point set on the cup's floor.
    # The eraser stays on the desk.
    bpy.context.view_layer.update()
    cup = next(obj for obj in stationery if obj.type == "MESH" and obj.name.endswith("pencilcup"))
    cup_box = world_bounds(cup)
    cup_centre = Vector(((cup_box[0] + cup_box[1]) / 2, (cup_box[2] + cup_box[3]) / 2, 0.0))
    cup_floor = cup_box[4] + 0.006
    writing = [
        obj
        for obj in stationery
        if obj.type == "MESH" and ("pen" in obj.name or "pencil" in obj.name) and "cup" not in obj.name
    ]
    for index, obj in enumerate(writing):
        placed = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = placed
        bpy.context.view_layer.update()
        box = world_bounds(obj)
        centre = Vector(((box[0] + box[1]) / 2, (box[2] + box[3]) / 2, (box[4] + box[5]) / 2))
        extents = (box[1] - box[0], box[3] - box[2], box[5] - box[4])
        long_axis = extents.index(max(extents))
        upright = (
            Matrix.Rotation(math.radians(-90), 4, "Y")
            if long_axis == 0
            else Matrix.Rotation(math.radians(90), 4, "X")
            if long_axis == 1
            else Matrix.Identity(4)
        )
        angle = index * math.tau / len(writing)
        lean = Matrix.Rotation(
            math.radians(9), 4, Vector((math.cos(angle + math.pi / 2), math.sin(angle + math.pi / 2), 0.0))
        )
        obj.matrix_world = Matrix.Translation(cup_centre) @ lean @ upright @ Matrix.Translation(-centre) @ obj.matrix_world
        bpy.context.view_layer.update()
        box = world_bounds(obj)
        ring = Vector((math.cos(angle) * 0.013, math.sin(angle) * 0.013, cup_floor - box[4]))
        obj.matrix_world = Matrix.Translation(ring) @ obj.matrix_world
    add_box(
        "Audio interface",
        (0.19, 0.13, 0.045),
        (0.78, 0.29, DESK_TOP_Z + 0.024),
        mats["interface"],
        target,
        rotation=(0, 0, math.radians(-3)),
        bevel=0.012,
        segments=4,
    )
    for index in range(2):
        add_cylinder(
            f"Interface knob {index + 1}",
            0.018 if index == 0 else 0.012,
            0.012,
            (0.73 + index * 0.065, 0.22, DESK_TOP_Z + 0.056),
            mats["black"],
            target,
            rotation=(math.pi / 2, 0, 0),
            vertices=32,
        )

    add_curve(
        "Monitor power cable",
        [
            (0.20, 0.20, DESK_TOP_Z + 0.33),
            (0.31, 0.38, DESK_TOP_Z + 0.02),
            (0.48, 0.43, DESK_TOP_Z - 0.20),
            (0.52, 0.46, FLOOR_Z + 0.12),
        ],
        0.006,
        mats["rubber"],
        target,
    )


def build_lookdev_monitor(target: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    import_glb(
        MODEL_DIR / "crt-monitor.glb",
        "Hero CRT proxy",
        target,
        location=(0.0, -0.010, 0.017),
        material=mats["crt"],
    )
    # Placeholder glass and terminal marks exist only for Blender lighting and
    # rendering. They sit where the live glass does: inside the pocket, 2 mm
    # behind the deck's screen plane, not proud of the fascia.
    add_box(
        "Lookdev glass",
        (0.520, 0.008, 0.2925),
        (0, -0.004, 0),
        mats["screen_black"],
        target,
        bevel=0.020,
        segments=8,
    )
    amber = mats["screen_amber"]
    dim = mats["screen_dim"]
    # A restrained facsimile of the held chart supplies realistic emissive distribution.
    add_box("Screen title", (0.21, 0.002, 0.009), (-0.115, -0.0095, 0.092), amber, target, bevel=0.001)
    add_box("Screen subtitle", (0.15, 0.002, 0.004), (-0.145, -0.0095, 0.072), dim, target, bevel=0.001)
    for row, (width, z) in enumerate(((0.19, 0.022), (0.075, -0.055))):
        add_box(f"Screen label {row}", (0.12, 0.002, 0.004), (-0.145, -0.0095, z), dim, target, bevel=0.001)
        add_box(f"Screen bar {row}", (width, 0.002, 0.013), (0.055 - (0.19 - width) / 2, -0.0095, z), amber, target, bevel=0.002)
    for index in range(5):
        x = -0.03 + index * 0.047
        add_box(f"Screen grid {index}", (0.0015, 0.002, 0.13), (x, -0.0090, -0.002), dim, target)


def three_to_blender(x: float, y: float, z: float) -> tuple[float, float, float]:
    """A point in the deck's scene units (X width, Y up, screen faces +Z) in metres here."""
    return (x * METRES_PER_SCENE_UNIT, -z * METRES_PER_SCENE_UNIT, y * METRES_PER_SCENE_UNIT)


def build_lighting(target: bpy.types.Collection) -> None:
    """The deck's home rig, not a lookdev invention.

    Every source here is one of the five in `src/scene/Scene.jsx` at the
    same place, size, colour and aim, so a render from this file predicts
    what the talk shows. Powers were calibrated by rendering the boundaries
    camera against the deck's own boundaries capture (2026-09-02). The old
    rig had a 48 W key 5 cm from the glass and three returns the deck does
    not have; under it every dark shell rendered beige.
    """
    # The screen itself: a rectangle the size of the glass, coplanar with it.
    add_area_light(
        "Screen key",
        three_to_blender(0, 0, 0.02),
        three_to_blender(0, 0, 40),
        32.0,
        "#ffe4a8",
        0.520,
        0.2925,
        target,
    )
    fill = bpy.data.lights.new("Local fill", "POINT")
    fill.energy = 1.2
    fill.color = rgba("#ffdf9e")[:3]
    fill.shadow_soft_size = 0.03
    fill_object = bpy.data.objects.new("Local fill", fill)
    target.objects.link(fill_object)
    fill_object.location = three_to_blender(0, 0.4, 1.15)
    # The doorway: a cold spot raking across the room; the only caster.
    doorway = bpy.data.lights.new("Doorway", "SPOT")
    doorway.energy = 420.0
    doorway.color = rgba("#b3c0bd")[:3]
    doorway.spot_size = 1.24
    doorway.spot_blend = 0.85
    doorway.shadow_soft_size = 0.08
    doorway_object = bpy.data.objects.new("Doorway", doorway)
    target.objects.link(doorway_object)
    doorway_object.location = three_to_blender(-46, 40, -30)
    aim_at(doorway_object, three_to_blender(4, -8.34, 4))
    add_area_light(
        "Opposite rim",
        three_to_blender(34, 17, -18),
        three_to_blender(2, -2, -5),
        10.0,
        "#909b98",
        18 * METRES_PER_SCENE_UNIT,
        28 * METRES_PER_SCENE_UNIT,
        target,
    )
    add_area_light(
        "Back wall",
        three_to_blender(-8, 10, -44),
        three_to_blender(-8, 10, -62),
        14.0,
        "#6c7671",
        50 * METRES_PER_SCENE_UNIT,
        32 * METRES_PER_SCENE_UNIT,
        target,
    )


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


def build_materials() -> dict[str, bpy.types.Material]:
    texture_root = ROOT / "public" / "textures"
    plaster = texture_root / "painted-plaster"
    linen = texture_root / "rough-linen"
    wood = texture_root / "wood-table"
    materials = {
        "wall": mapped_surface_material("Warm mineral paint", "#3d4540", 0.92, plaster, repeats=(3.8, 2.2, 1.0), normal_strength=0.42),
        "ceiling": mapped_surface_material("Ceiling mineral paint", "#3c433f", 0.96, plaster, repeats=(4.6, 2.8, 1.0), normal_strength=0.30),
        "hall": mapped_surface_material("Hall wall", "#313836", 0.93, plaster, repeats=(2.2, 2.2, 1.0), normal_strength=0.36),
        "hall_floor": principled_material("Hall floor", "#242927", 0.86),
        "trim": principled_material("Painted trim", "#59615c", 0.58, coat=0.10),
        "door": mapped_surface_material("Smoked oak door", "#594334", 0.58, wood, repeats=(1.2, 2.6, 1.0), normal_strength=0.38),
        "glass": principled_material("Night glass", "#071013", 0.19, metallic=0.04, coat=0.32),
        "window_frame": principled_material("Window frame", "#202623", 0.42, metallic=0.28),
        "blind": mapped_surface_material("Linen blind", "#8a887f", 0.97, linen, repeats=(3.4, 1.2, 1.0), normal_strength=0.24, use_diffuse=True),
        "felt": mapped_surface_material("Acoustic felt", "#171a18", 0.99, linen, repeats=(5.0, 4.0, 1.0), normal_strength=0.28),
        "slat": mapped_surface_material("Smoked walnut slats", "#5b3e2b", 0.60, wood, repeats=(0.55, 5.0, 1.0), normal_strength=0.34),
        "desk": mapped_surface_material("Oiled black walnut", "#76513a", 0.46, wood, repeats=(1.15, 0.58, 1.0), normal_strength=0.42, use_diffuse=True, coat=0.08),
        "steel": principled_material("Powder coated steel", "#1f2524", 0.39, metallic=0.58),
        "black": principled_material("Dead black", "#080b0a", 0.84),
        "desk_mat": mapped_surface_material("Wool desk mat", "#171b18", 0.98, linen, repeats=(4.0, 2.0, 1.0), normal_strength=0.26),
        "credenza": mapped_surface_material("Credenza walnut", "#60432f", 0.55, wood, repeats=(1.8, 1.0, 1.0), normal_strength=0.32),
        "credenza_front": principled_material("Credenza lacquer", "#303633", 0.48, coat=0.12),
        "bookcase": principled_material("Bookcase charcoal", "#262c29", 0.73),
        "book_warm": principled_material("Muted ochre book", "#6d5d45", 0.86),
        "book_cool": principled_material("Muted slate book", "#465654", 0.88),
        "book_paper": principled_material("Bone book", "#8d887a", 0.92),
        "pot": principled_material("Stoneware pot", "#70685b", 0.76, coat=0.08),
        "stem": principled_material("Plant stem", "#29352c", 0.88),
        "leaf_a": textured_material("Plant leaf dark", "#1e2d24", "#33483a", 0.78, scale=8.0, detail=3.0, bump_strength=0.06, bump_distance=0.001),
        "leaf_b": principled_material("Plant leaf light", "#35483a", 0.74, coat=0.04),
        "chair_frame": principled_material("Chair frame", "#171c1c", 0.39, metallic=0.38),
        "chair_fabric": textured_material("Chair wool", "#3b3b37", "#54544e", 0.96, scale=115.0, detail=2.0, bump_strength=0.10, bump_distance=0.0013),
        "chrome": principled_material("Chair mechanism", "#646d6b", 0.25, metallic=0.92),
        "rubber": principled_material("Soft rubber", "#111514", 0.82),
        "keyboard": principled_material("Keyboard case", "#242a28", 0.54, coat=0.08),
        "keycap": textured_material("PBT keycaps", "#303530", "#555b52", 0.72, scale=140.0, detail=2.0, bump_strength=0.04, bump_distance=0.0005),
        # Two-tone set: the modifiers and the spacebar sit a rung darker than
        # the alphas, which is most of what makes a keyboard read at a glance.
        "keycap_mod": principled_material("PBT modifier keycaps", "#1e2224", 0.7),
        "keyboard_plate": principled_material("Keyboard plate", "#0b0d0d", 0.8),
        # Matte and dark: under the screen key a satin shell was one broad
        # highlight and read as an egg.
        "mouse": principled_material("Mouse shell", "#2b302d", 0.62, coat=0.10),
        "ceramic": principled_material("Bone ceramic", "#a39a86", 0.29, coat=0.56),
        "coffee": principled_material("Black coffee", "#120a04", 0.12, coat=0.4),
        "leather": textured_material("Worn leather", "#554335", "#79624e", 0.59, scale=18.0, detail=6.0, bump_strength=0.12, bump_distance=0.0015),
        "lamp": principled_material("Lamp painted metal", "#36413f", 0.36, metallic=0.56),
        "phone": principled_material("Phone graphite", "#181d1c", 0.28, metallic=0.52, coat=0.26),
        "pencil": principled_material("Pencil cedar", "#9b7a49", 0.72),
        "interface": principled_material("Audio interface", "#45504e", 0.31, metallic=0.72),
        "crt": textured_material("CRT graphite ABS", "#111514", "#272c29", 0.61, scale=52.0, detail=3.0, bump_strength=0.035, bump_distance=0.0007, metallic=0.012),
        "screen_black": principled_material("CRT glass black", "#050705", 0.34, coat=0.06, emission="#090b07", emission_strength=0.16),
        "screen_amber": principled_material("Amber phosphor hot", "#ffd54a", 0.34, emission="#ffd54a", emission_strength=6.0),
        "screen_dim": principled_material("Amber phosphor dim", "#8f6c22", 0.44, emission="#b68a2c", emission_strength=2.2),
    }
    set_input(
        materials["screen_black"].node_tree.nodes.get("Principled BSDF"),
        "Specular IOR Level",
        0.10,
    )
    materials["glass"].surface_render_method = "DITHERED"
    return materials


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 128
    scene.eevee.use_raytracing = True
    scene.eevee.shadow_ray_count = 4
    scene.eevee.shadow_step_count = 8
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True

    # A faint cool wash standing in for the deck's dark-room environment map,
    # which is what keeps its shadows from going to absolute black.
    scene.world.color = rgba("#030403")[:3]
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.55, 0.62, 0.62, 1.0)
    background.inputs["Strength"].default_value = 0.035

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.45
    scene.view_settings.gamma = 1.0
    scene.camera.data.lens = scene.camera.data.lens

    scene.render.use_stamp = False
    scene.render.filepath = str(RENDER_DIR / "home-office-reveal.png")


def main() -> None:
    clean_scene()
    export = collection("HOME_EXPORT")
    lookdev = collection("LOOKDEV_ONLY")
    cameras = collection("CAMERAS")
    lights = collection("LIGHTS")
    mats = build_materials()

    floor_material = pbr_image_material(
        "Poly Haven dark wooden planks",
        ASSET_DIR / "textures" / "dark-wooden-planks",
        repeats=(1.25, 2.2, 1.0),
        normal_strength=0.62,
    )

    build_floor(export, floor_material)
    build_architecture(export, mats)
    build_desk(export, mats)
    build_shelving(export, mats)
    # On the credenza, seated on its top, and scaled so its leaves clear the
    # back wall and the window frame (at full size they ran 16 cm into both).
    seat_on(
        import_glb_group(
            ASSET_DIR / "potted_plant_02.glb",
            "Poly Haven potted plant",
            export,
            location=(1.76, 1.56, FLOOR_Z + 0.59),
            rotation=(0, 0, math.radians(-18)),
            scale=0.78,
        ),
        FLOOR_Z + 0.58,
    )
    build_chair(export, mats)
    build_props(export, mats)
    build_lookdev_monitor(lookdev, mats)
    build_lighting(lights)

    reveal_camera = make_camera(
        "Reveal camera",
        (0.0, -44.0 * METRES_PER_SCENE_UNIT, 2.5 * METRES_PER_SCENE_UNIT),
        (0.0, 0.0, -0.5 * METRES_PER_SCENE_UNIT),
        cameras,
    )
    boundaries_camera = make_camera(
        "Boundaries camera",
        (15.0 * METRES_PER_SCENE_UNIT, -46.0 * METRES_PER_SCENE_UNIT, 3.0 * METRES_PER_SCENE_UNIT),
        (-2.0 * METRES_PER_SCENE_UNIT, 2.0 * METRES_PER_SCENE_UNIT, -1.0 * METRES_PER_SCENE_UNIT),
        cameras,
    )
    room_camera = make_camera(
        "Room review camera",
        (1.75, -3.15, 0.28),
        (0.0, 0.38, -0.22),
        cameras,
        fov_degrees=40.0,
    )

    scene = bpy.context.scene
    scene.camera = reveal_camera
    configure_scene()
    scene["r3f_scene_units_per_metre"] = SCENE_UNITS_PER_METRE
    scene["live_glass_width_m"] = 0.520
    scene["live_glass_height_m"] = 0.2925
    scene["coordinate_contract"] = "Blender X -> Three X; Blender Z -> Three Y; Blender -Y -> Three Z"

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    scene.render.filepath = str(RENDER_DIR / "home-office-reveal.png")
    scene.camera = reveal_camera
    bpy.ops.render.render(write_still=True)

    scene.render.filepath = str(RENDER_DIR / "home-office-boundaries.png")
    scene.camera = boundaries_camera
    bpy.ops.render.render(write_still=True)

    scene.render.filepath = str(RENDER_DIR / "home-office-room.png")
    scene.camera = room_camera
    bpy.ops.render.render(write_still=True)

    scene.camera = reveal_camera
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print(f"HOME_OFFICE_BLEND={BLEND_PATH}")
    print(f"HOME_OFFICE_RENDERS={RENDER_DIR}")


if __name__ == "__main__":
    main()
