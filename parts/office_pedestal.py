from nurb import *

# A box/box/file mobile pedestal for the cubicle stage.
# RENDER ASSET — never printed. +Z is up; drawer fronts face -Y.


@part
def office_pedestal(
    width=430.0,
    depth=520.0,
    height=610.0,
    drawer_gap=6.0,
    corner_radius=7.0,
    draft=False,
):
    """
    width: overall cabinet width under the desk
    depth: overall depth from drawer front to cabinet back
    height: overall height from caster contact to top panel
    drawer_gap: open shadow gap around and between the drawer fronts
    corner_radius: folded-steel radius on the carcass corners
    """
    front_y = -depth / 2
    body_bottom = 42.0

    # The carcass is a restrained folded-steel envelope, not a soft plastic
    # box. A small bend radius carries the powder-coat highlight while the
    # raised underbody leaves room for real floor-contacting casters.
    carcass = Pos(0, 0, (height + body_bottom) / 2) * Box(
        width,
        depth,
        height - body_bottom,
    )
    carcass = fillet(carcass.edges().filter_by(Axis.Z), corner_radius)
    top_edges = carcass.edges().filter_by(
        lambda edge: edge.bounding_box().min.Z > height - 0.1
    )
    carcass = polish(carcass, top_edges, 1.2)

    # One recessed front bay establishes the side returns of a folded carcass.
    # Deeper perimeter and divider cuts then leave three genuinely separated
    # drawer faces with changing occlusion instead of engraved rectangles.
    drawer_width = width - 34.0
    drawer_bottom = 86.0
    drawer_top = height - 22.0
    bay_height = drawer_top - drawer_bottom
    bay_cut = Pos(0, front_y + 2.5, (drawer_bottom + drawer_top) / 2) * Box(
        drawer_width,
        6.0,
        bay_height,
    )
    bay_cut = fillet(bay_cut.edges().filter_by(Axis.Y), 3.0)
    carcass = carcass - bay_cut

    shadow_depth = 16.0
    shadow_y = front_y + shadow_depth / 2 - 0.5
    side_reveal_x = drawer_width / 2
    for side in (-1, 1):
        carcass = carcass - Pos(
            side * side_reveal_x,
            shadow_y,
            (drawer_bottom + drawer_top) / 2,
        ) * Box(drawer_gap, shadow_depth, bay_height)

    # Box/box/file proportions: two equal utility drawers above one deep
    # hanging-file drawer. These channels cut well behind the inset faces.
    divider_z = (343.0, 467.0)
    for z in (drawer_bottom, *divider_z, drawer_top):
        carcass = carcass - Pos(0, shadow_y, z) * Box(
            drawer_width,
            shadow_depth,
            drawer_gap,
        )

    # Full-width rolled pull lips are one coherent hardware language across all
    # drawers. The deep finger pockets beneath them make the lips functional,
    # while their fronts remain inside the original scene-clearance envelope.
    lip_width = drawer_width - 22.0
    lip_depth = 7.0
    lip_height = 12.0
    lip_zs = (323.0, 447.0, 569.0)
    for z in lip_zs:
        grip = Pos(0, shadow_y, z - 15.0) * Box(
            lip_width - 14.0,
            shadow_depth,
            20.0,
        )
        carcass = carcass - grip

        lip = Pos(0, front_y + lip_depth / 2, z) * Box(
            lip_width,
            lip_depth,
            lip_height,
        )
        lip = fillet(lip.edges().filter_by(Axis.X), 2.5)
        carcass = carcass + lip

    # A recessed lock escutcheon and proud cylinder belong to the top utility
    # drawer. The keyway is modeled geometry, not a floating decal.
    lock_x = width / 2 - 64.0
    lock_z = 522.0
    lock_recess = (
        Pos(lock_x, front_y + 4.0, lock_z)
        * Rot(90, 0, 0)
        * Cylinder(
            10.0,
            12.0,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    )
    carcass = carcass - lock_recess
    lock_core = (
        Pos(lock_x, front_y + 7.0, lock_z)
        * Rot(90, 0, 0)
        * Cylinder(
            6.8,
            14.0,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    )
    carcass = carcass + lock_core
    keyway = Pos(lock_x, front_y + 5.0, lock_z) * Box(2.2, 16.0, 6.0)
    carcass = carcass - keyway

    # A recessed toe kick exposes the underbody and prevents the lower drawer
    # from reading as a box sitting directly on the floor.
    toe_height = drawer_bottom - body_bottom - 4.0
    toe_kick = Pos(
        0,
        front_y + 14.0,
        body_bottom + toe_height / 2,
    ) * Box(width - 36.0, 30.0, toe_height)
    carcass = carcass - toe_kick

    # Fine panel-breaks describe a separate folded top and returned side skins.
    # They stay shallow enough to read as seams rather than decorative grooves.
    top_seam_z = height - 14.0
    seam_depth = 2.4
    for side in (-1, 1):
        side_top_seam = Pos(
            side * (width / 2 - seam_depth / 2),
            0,
            top_seam_z,
        ) * Box(seam_depth, depth - 28.0, 1.8)
        carcass = carcass - side_top_seam

        side_return_seam = Pos(
            side * (width / 2 - seam_depth / 2),
            depth / 2 - 24.0,
            (body_bottom + top_seam_z) / 2,
        ) * Box(
            seam_depth,
            2.0,
            top_seam_z - body_bottom,
        )
        carcass = carcass - side_return_seam

    rear_top_seam = Pos(
        0,
        depth / 2 - seam_depth / 2,
        top_seam_z,
    ) * Box(width - 28.0, seam_depth, 1.8)
    carcass = carcass - rear_top_seam

    # Four low twin-cheek casters provide actual floor contact at z=0. Their
    # mounting plates overlap the raised carcass, so the render asset remains a
    # single connected solid and never appears to float.
    wheel_radius = 18.0
    wheel_width = 24.0
    for x in (-162.0, 162.0):
        for y in (-230.0, 218.0):
            wheel = (
                Pos(x, y, wheel_radius)
                * Rot(0, 90, 0)
                * Cylinder(
                    wheel_radius,
                    wheel_width,
                    align=(Align.CENTER, Align.CENTER, Align.CENTER),
                )
            )
            caster = wheel

            for side in (-1, 1):
                cheek = Pos(x + side * 13.0, y, 29.0) * Box(6.0, 11.0, 26.0)
                caster = caster + cheek

            plate = Pos(x, y, body_bottom - 1.0) * Box(40.0, 30.0, 6.0)
            plate = fillet(plate.edges().filter_by(Axis.Z), 2.0)
            caster = caster + plate
            carcass = carcass + caster

    return carcass
