#!/usr/bin/env python3
"""Export the authored home-office set as one optimized, runtime-ready GLB.

Run after ``build_scene.py``:
    blender --background blender/home-office/home-office.blend \
      --python blender/home-office/export_scene.py

The source remains metric. React Three Fiber scales the exported root by
``16 / 0.520`` so the Blender glass contract lands exactly on the live screen.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = ROOT / "public" / "models" / "home-office.glb"
EXPORT_COLLECTION = "HOME_EXPORT"


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


def join_single_material_meshes(meshes: list[bpy.types.Object]) -> list[bpy.types.Object]:
    """Collapse static geometry by material to keep live draw calls bounded."""
    groups: dict[bpy.types.Material | None, list[bpy.types.Object]] = defaultdict(list)
    retained: list[bpy.types.Object] = []

    for obj in meshes:
        if len(obj.data.materials) <= 1:
            material = obj.data.materials[0] if obj.data.materials else None
            groups[material].append(obj)
        else:
            retained.append(obj)

    for material, objects in groups.items():
        active = objects[0]
        if len(objects) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for obj in objects:
                obj.select_set(True)
            bpy.context.view_layer.objects.active = active
            bpy.ops.object.join()
        active.name = f"Home office — {material.name if material else 'unassigned'}"
        retained.append(active)

    return retained


def prepare_materials_for_gltf() -> None:
    """Keep unique asset maps; runtime reuses the talk's shared surface maps."""
    embedded = {
        "Poly Haven dark wooden planks",
        "potted_plant_02_leaves",
        "potted_plant_02_pot",
        "stationery_supplies",
        "binder_notebook",
    }
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


def main() -> None:
    source = bpy.data.collections.get(EXPORT_COLLECTION)
    if source is None:
        raise RuntimeError(f"Missing collection: {EXPORT_COLLECTION}")

    export_objects = set(source.all_objects)
    remove_non_export_objects(export_objects)
    apply_modifiers_and_convert(list(export_objects))
    prepare_materials_for_gltf()

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    bake_world_transforms(meshes)
    meshes = join_single_material_meshes(meshes)
    strip_empty_material_slots(meshes)

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene["r3f_scene_units_per_metre"] = 16.0 / 0.520
    bpy.context.scene["coordinate_contract"] = (
        "Blender X -> Three X; Blender Z -> Three Y; Blender -Y -> Three Z"
    )
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT_PATH),
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
    print(f"HOME_OFFICE_GLB={OUTPUT_PATH}")
    print(f"HOME_OFFICE_MESHES={len(meshes)}")
    print(f"HOME_OFFICE_TRIANGLES={triangles}")


if __name__ == "__main__":
    main()
