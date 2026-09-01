from math import atan2, degrees, hypot

from nurb import *

# Articulated architect's lamp for the talk's foreground desk.
# RENDER ASSET — never printed. Millimetres, +Z up, base seated at Z=0.


def _faceted_cylinder(radius, height, sides=24, centered=False):
    with BuildPart() as prism:
        with BuildSketch(Plane.XY):
            RegularPolygon(radius, sides)
        extrude(amount=height)
    if centered:
        return Pos(0, 0, -height / 2) * prism.part
    return prism.part


def _faceted_frustum(bottom_radius, top_radius, height, sides=64):
    with BuildPart() as frustum:
        with BuildSketch(Plane.XY):
            RegularPolygon(bottom_radius, sides)
        with BuildSketch(Plane.XY.offset(height)):
            RegularPolygon(top_radius, sides)
        loft(ruled=True)
    return frustum.part


def _beam(p0, p1, width, depth, bevel=0.8):
    dy = p1[1] - p0[1]
    dz = p1[2] - p0[2]
    length = hypot(dy, dz)
    tilt = -degrees(atan2(dy, dz))
    mid = (p0[0], (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
    bar = Pos(*mid) * Rot(tilt, 0, 0) * Box(
        width,
        depth,
        length,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )
    return chamfer(bar.edges(), bevel)


def _round_strut(p0, p1, radius):
    dy = p1[1] - p0[1]
    dz = p1[2] - p0[2]
    length = hypot(dy, dz)
    tilt = -degrees(atan2(dy, dz))
    mid = (p0[0], (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2)
    return Pos(*mid) * Rot(tilt, 0, 0) * _faceted_cylinder(
        radius,
        length,
        sides=16,
        centered=True,
    )


def _axle(center, radius, length):
    return Pos(*center) * Rot(0, 90, 0) * _faceted_cylinder(
        radius,
        length,
        sides=32,
        centered=True,
    )


def _joint(center, radius, span, cap_depth=3.0):
    joint = _axle(center, radius, span)
    y, z = center[1], center[2]
    for side in (-1, 1):
        cap_x = side * (span / 2 + cap_depth / 2 - 0.5)
        joint += _axle((cap_x, y, z), radius * 0.82, cap_depth)
        slot_x = side * (span / 2 + cap_depth - 0.85)
        joint -= Pos(slot_x, y, z) * Box(
            1.3,
            1.5,
            radius * 1.15,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    return joint


def _base(radius, height, sides=64):
    with BuildPart() as body:
        for z, r in (
            (1.2, radius * 0.88),
            (3.2, radius * 0.98),
            (height * 0.78, radius),
            (height, radius * 0.89),
        ):
            with BuildSketch(Plane.XY.offset(z)):
                RegularPolygon(r, sides)
        loft(ruled=True)
    contact = _faceted_cylinder(radius * 0.82, 2.0, sides=sides)
    return body.part + contact


def _shade(diameter, length, wall):
    mouth = diameter / 2
    back = diameter * 0.18
    outer = Pos(0, 0, -length) * _faceted_frustum(
        mouth,
        back,
        length,
    )
    inner = Pos(0, 0, -length - 1.0) * _faceted_frustum(
        mouth - wall,
        max(back - wall, 4.0),
        length - 2.0,
    )
    shade = outer - inner

    # A crisp rolled lip carries the mouth highlight and makes the wall
    # thickness legible from the authored camera.
    lip_outer = Pos(0, 0, -length - 2.0) * _faceted_cylinder(
        mouth + 1.2,
        6.0,
        sides=64,
    )
    lip_inner = Pos(0, 0, -length - 2.5) * _faceted_cylinder(
        mouth - wall - 1.2,
        7.0,
        sides=64,
    )
    shade += lip_outer - lip_inner

    # Socket, LED retrofit puck, and rear collar remain visible inside the
    # hollow shade and explain where the fixture's light would originate. The
    # rear plate overlaps both wall and socket; it is also the real stamped
    # closure a hollow metal shade needs.
    rear_plate = Pos(0, 0, -7.0) * _faceted_cylinder(
        back + 3.0,
        8.0,
        sides=48,
    )
    socket = Pos(0, 0, -31.0) * _faceted_cylinder(12.0, 32.0, sides=36)
    emitter = Pos(0, 0, -35.0) * _faceted_cylinder(20.5, 7.0, sides=48)
    collar = Pos(0, 0, -2.0) * _faceted_cylinder(
        back + 2.5,
        8.0,
        sides=48,
    )
    return shade + rear_plate + socket + emitter + collar


@part
def desk_lamp(
    base_diameter=150.0,
    base_height=22.0,
    lower_arm=235.0,
    upper_arm=210.0,
    lower_angle=64.0,
    upper_angle=24.0,
    arm_thickness=10.0,
    arm_pair_spacing=17.0,
    shade_diameter=110.0,
    shade_length=95.0,
    shade_angle=-32.0,
    shade_wall=2.4,
    cable_thickness=4.6,
    draft=False,
):
    """
    base_diameter: how wide the weighted base is on the desk
    base_height: how thick the stepped base is
    lower_arm: length of the paired lower links
    upper_arm: length of the paired upper links
    lower_angle: how steeply the lower arm rises from horizontal
    upper_angle: how much the upper arm rises as it reaches forward
    arm_thickness: front-to-back depth of each arm bar
    arm_pair_spacing: distance between the two arm-bar centerlines
    shade_diameter: diameter across the shade mouth
    shade_length: length from shade mouth to rear collar
    shade_angle: direction the shade points; negative tips down and forward
    shade_wall: visible thickness of the shade wall
    cable_thickness: outside diameter of the routed power cable
    """
    from math import cos, radians, sin

    a1 = radians(lower_angle)
    a2 = radians(upper_angle)
    pivot_z = base_height + 18.0
    p0 = (0.0, 0.0, pivot_z)
    p1 = (0.0, lower_arm * cos(a1), pivot_z + lower_arm * sin(a1))
    p2 = (0.0, p1[1] - upper_arm * cos(a2), p1[2] + upper_arm * sin(a2))

    lamp = _base(base_diameter / 2, base_height)

    # Two base cheeks establish a plausible clevis around the first axle.
    bar_width = 4.2
    cheek_height = pivot_z - base_height + 5.0
    for x in (-arm_pair_spacing / 2, arm_pair_spacing / 2):
        cheek = Pos(x, 0, base_height - 1.0) * Box(
            5.0,
            23.0,
            cheek_height,
            align=(Align.CENTER, Align.CENTER, Align.MIN),
        )
        lamp += chamfer(cheek.edges(), 0.8)

    # Paired rectangular links spend geometry on the long highlight-carrying
    # edges rather than hidden smooth cylinders.
    for x in (-arm_pair_spacing / 2, arm_pair_spacing / 2):
        lower_start = (x, p0[1], p0[2])
        lower_end = (x, p1[1], p1[2])
        upper_start = (x, p1[1], p1[2])
        upper_end = (x, p2[1], p2[2])
        lamp += _beam(lower_start, lower_end, bar_width, arm_thickness)
        lamp += _beam(upper_start, upper_end, bar_width, arm_thickness)

    joint_span = arm_pair_spacing + bar_width + 7.0
    lamp += _joint(p0, 12.0, joint_span, 3.5)
    lamp += _joint(p1, 13.0, joint_span, 3.5)
    lamp += _joint(p2, 11.5, joint_span, 3.2)

    # Hollow shade, interior socket, and emitter are built locally and aimed as
    # one fixture so the modeled source agrees with the off-state silhouette.
    lamp += Pos(*p2) * Rot(shade_angle, 0, 0) * _shade(
        shade_diameter,
        shade_length,
        shade_wall,
    )

    # Cable is routed against the outside bar, around both pivots, through the
    # base exit, then laid on the desk. Its 4.6mm diameter remains readable and
    # avoids a subpixel decorative line.
    cable_radius = cable_thickness / 2
    cable_x = arm_pair_spacing / 2 + bar_width / 2 + cable_radius * 0.52
    cable_points = (
        (cable_x, p0[1], p0[2]),
        (cable_x, p1[1], p1[2]),
        (cable_x, p2[1], p2[2]),
    )
    lamp += _round_strut(cable_points[0], cable_points[1], cable_radius)
    lamp += _round_strut(cable_points[1], cable_points[2], cable_radius)

    exit_point = (cable_x, base_diameter * 0.44, 5.0)
    desk_bend = (cable_x, base_diameter * 0.69, cable_radius)
    desk_end = (cable_x, base_diameter * 0.98, cable_radius)
    lamp += _round_strut(cable_points[0], exit_point, cable_radius)
    lamp += _round_strut(exit_point, desk_bend, cable_radius)
    lamp += _round_strut(desk_bend, desk_end, cable_radius)

    # Two genuine construction seams: a lower weighted-shell split and an
    # inset top cap. Both are shallow cuts, not coplanar decals.
    lower_outer = Pos(0, 0, 5.2) * _faceted_cylinder(
        base_diameter / 2 + 1.0,
        0.9,
        sides=64,
    )
    lower_inner = Pos(0, 0, 4.9) * _faceted_cylinder(
        base_diameter / 2 - 1.0,
        1.5,
        sides=64,
    )
    top_outer = Pos(0, 0, base_height - 0.65) * _faceted_cylinder(
        base_diameter * 0.37,
        1.0,
        sides=64,
    )
    top_inner = Pos(0, 0, base_height - 0.9) * _faceted_cylinder(
        base_diameter * 0.35,
        1.5,
        sides=64,
    )
    lamp -= (lower_outer - lower_inner) + (top_outer - top_inner)

    return lamp
