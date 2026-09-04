"""Export one authored set collection as an optimized, runtime-ready GLB.

The source stays metric; React Three Fiber scales the exported root by
``SCENE_UNITS_PER_METRE`` so the Blender glass contract lands exactly on the
live screen. Modifiers are applied, world transforms baked, static meshes
merged by material (one draw per material at runtime), lights and cameras
dropped, and procedural node trees replaced by the explicit physical fallbacks
each material carries (see ``principled_material``).
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix

from lib.setkit import stamp_contract


def remove_non_export_objects(export_objects: set[bpy.types.Object]) -> None:
    for obj in list(bpy.data.objects):
        if obj not in export_objects:
            bpy.data.objects.remove(obj, do_unlink=True)


def apply_modifiers_and_convert(export_objects: list[bpy.types.Object]) -> None:
    for obj in export_objects:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        if obj.type == "CURVE":
            bpy.ops.object.convert(target="MESH")
        else:
            # Linked duplicates share mesh data; applying a modifier needs a
            # single-user mesh, so give every object its own copy first.
            if obj.modifiers and obj.data.users > 1:
                obj.data = obj.data.copy()
            for modifier in list(obj.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)


def bake_world_transforms(meshes: list[bpy.types.Object]) -> None:
    """Flatten imported anchors while retaining metric world coordinates."""
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data = obj.data.copy()
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)


def join_meshes_by_material_set(meshes: list[bpy.types.Object], label: str) -> list[bpy.types.Object]:
    """Collapse static geometry by its material slots to keep live draw calls
    bounded: every single-material object joins its material's mesh, and the
    multi-material CAD copies (nine chairs, nine pedestals) join per slot set
    so they stay one draw per material group rather than one per object."""
    groups: dict[tuple[str, ...], list[bpy.types.Object]] = defaultdict(list)
    for obj in meshes:
        key = tuple(material.name if material else "" for material in obj.data.materials)
        groups[key].append(obj)

    retained: list[bpy.types.Object] = []
    for key, objects in groups.items():
        active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = active
            bpy.ops.object.join()
        active.name = f"{label} — {' + '.join(name or 'unassigned' for name in key) or 'unassigned'}"
        retained.append(active)

    return retained


def prepare_materials_for_gltf(embedded: set[str]) -> None:
    """Keep unique asset maps; runtime reuses the talk's shared surface maps."""
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        if bsdf is None:
            continue

        base = bsdf.inputs.get("Base Color")
        if base and base.is_linked:
            source = base.links[0].from_node
            if material.name not in embedded or source.type != "TEX_IMAGE":
                links.remove(base.links[0])
                if "export_base_color" in material:
                    base.default_value = material["export_base_color"]

        # Scalar roughness is enough at presentation distance and avoids a
        # separately repacked PNG per material. The live component reuses the
        # existing plaster/linen/wood maps for broad authored surfaces.
        roughness = bsdf.inputs.get("Roughness")
        if roughness and roughness.is_linked:
            links.remove(roughness.links[0])
            roughness.default_value = material.get("export_roughness", 0.65)

        metallic = bsdf.inputs.get("Metallic")
        if metallic and metallic.is_linked:
            links.remove(metallic.links[0])
            metallic.default_value = material.get("export_metallic", 0.0)

        normal = bsdf.inputs.get("Normal")
        if normal and normal.is_linked:
            source = normal.links[0].from_node
            image_backed = (
                source.type == "NORMAL_MAP"
                and source.inputs["Color"].is_linked
                and source.inputs["Color"].links[0].from_node.type == "TEX_IMAGE"
            )
            if material.name not in embedded or not image_backed:
                links.remove(normal.links[0])


def strip_empty_material_slots(meshes: list[bpy.types.Object]) -> None:
    for obj in meshes:
        while obj.data.materials and obj.data.materials[-1] is None:
            obj.data.materials.pop(index=len(obj.data.materials) - 1)


def export_collection(
    collection_name: str,
    output_path: Path,
    *,
    label: str,
    embedded_materials: set[str],
    print_prefix: str,
    scene_extras: dict[str, object] | None = None,
) -> None:
    source = bpy.data.collections.get(collection_name)
    if source is None:
        raise RuntimeError(f"Missing collection: {collection_name}")

    export_objects = set(source.all_objects)
    remove_non_export_objects(export_objects)
    apply_modifiers_and_convert(list(export_objects))
    prepare_materials_for_gltf(embedded_materials)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bake_world_transforms(meshes)
    meshes = join_meshes_by_material_set(meshes, label)
    strip_empty_material_slots(meshes)

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    stamp_contract(scene)
    for key, value in (scene_extras or {}).items():
        scene[key] = value
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_attributes=False,
    )

    triangles = sum(len(obj.data.polygons) for obj in meshes)
    print(f"{print_prefix}_GLB={output_path}")
    print(f"{print_prefix}_MESHES={len(meshes)}")
    print(f"{print_prefix}_TRIANGLES={triangles}")
