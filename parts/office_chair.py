from nurb import *

# ORIGINAL RENDER ASSET — never printed. +Z is up and the chair faces -Y.
#
# The broad forms use only the generic language of late-1990s commercial task
# seating: upholstered cushions, a thin rear shell, compact synchro-tilt pack,
# pneumatic lift, T-arms, and a five-star caster base. No downloaded or scanned
# mesh contributes to this geometry.


def _rounded_box(width, depth, height, radius):
    """A manufactured enclosure with radiused plan corners and crisp seams."""
    body = Box(width, depth, height)
    return fillet(body.edges().filter_by(Axis.Z), radius)


def _rounded_loft(stations):
    """Loft rounded XY sections: (x, y, z, width, depth, corner_radius)."""
    sections = [
        Pos(x, y, z) * RectangleRounded(width, depth, corner_radius)
        for x, y, z, width, depth, corner_radius in stations
    ]
    return loft(sections)


def _wheel(width=14.0, radius=28.0):
    """One bevel-crowned caster wheel, centred on its horizontal axle."""
    wheel = Cylinder(
        radius,
        width,
        align=(Align.CENTER, Align.CENTER, Align.CENTER),
    )
    wheel = chamfer(wheel.edges(), 3.0)
    return Rot(90, 0, 0) * wheel


def _caster_parts(base_radius):
    """A swivel yoke and twin wheels; its local star arm points along +X."""
    axle_x = base_radius + 6.0
    wheel_z = 28.0
    return [
        Pos(axle_x, -16.5, wheel_z) * _wheel(),
        Pos(axle_x, 16.5, wheel_z) * _wheel(),
        Pos(base_radius - 4.0, 0, 61.0) * Cylinder(10.0, 38.0),
        Pos(base_radius - 4.0, 0, 56.0) * Cylinder(18.0, 15.0),
        Pos(base_radius + 1.0, 0, 62.0) * _rounded_box(42.0, 58.0, 18.0, 7.0),
        Pos(axle_x - 4.0, -21.5, 45.0) * _rounded_box(22.0, 10.0, 42.0, 4.0),
        Pos(axle_x - 4.0, 21.5, 45.0) * _rounded_box(22.0, 10.0, 42.0, 4.0),
    ]


def _base_spoke(base_radius):
    """A broad-rooted, tapered, down-swept injected-plastic base spoke."""
    tip = base_radius - 5.0
    profile = Polygon(
        (34.0, -39.0),
        (150.0, -30.0),
        (tip - 42.0, -21.0),
        (tip - 10.0, -18.0),
        (tip + 2.0, -10.0),
        (tip + 6.0, 0.0),
        (tip + 2.0, 10.0),
        (tip - 10.0, 18.0),
        (tip - 42.0, 21.0),
        (150.0, 30.0),
        (34.0, 39.0),
    )
    spoke = extrude(profile, 28.0)
    spoke = fillet(spoke.edges().filter_by(Axis.Z), 8.0)
    return Pos(0, 0, 96.0) * (Rot(0, 5.0, 0) * spoke)


def _tag(shape, label, color):
    """Attach a stable semantic region name and neutral preview colour."""
    shape.label = label
    shape.color = color
    return shape


@part
def office_chair(
    seat_width=505.0,
    seat_depth=465.0,
    seat_height=500.0,
    back_height=535.0,
    back_width=490.0,
    base_radius=315.0,
    recline=10.0,
    draft=False,
):
    """
    seat_width: widest point of the upholstered waterfall seat
    seat_depth: front-to-back depth of the upholstered seat
    seat_height: floor to the crown of the seat cushion
    back_height: upholstered back height above its lower mounting edge
    back_width: widest point of the thin rear shell
    base_radius: centre post to each caster swivel
    recline: rearward back angle from vertical
    """
    if seat_width < 470.0:
        reject(
            "seat_width under 470mm gives the commercial chair toy proportions; raise it to at least 470mm",
            param="seat_width",
        )
    if back_width < seat_width - 45.0:
        reject(
            "back_width this narrow loses the upholstered task-chair silhouette; keep it within 45mm of seat_width",
            param="back_width",
        )
    if base_radius < 300.0:
        reject(
            "base_radius under 300mm makes the chair visibly unstable; raise it to at least 300mm",
            param="base_radius",
        )

    upholstery_color = Color(0.17, 0.18, 0.19)
    plastic_color = Color(0.035, 0.04, 0.045)
    metal_color = Color(0.34, 0.36, 0.37)

    # --- Seat construction ----------------------------------------------
    # Five stations make a rolled waterfall nose, broad thigh support, and a
    # restrained crown rather than a rectangular cushion with dressed edges.
    pan_bottom = seat_height - 91.0
    cushion_bottom = seat_height - 70.0
    seat_cushion = _rounded_loft(
        [
            (0.0, 0.0, cushion_bottom, seat_width - 58.0, seat_depth - 54.0, 78.0),
            (0.0, -10.0, cushion_bottom + 12.0, seat_width - 12.0, seat_depth - 12.0, 96.0),
            (0.0, -15.0, cushion_bottom + 36.0, seat_width, seat_depth, 104.0),
            (0.0, -5.0, seat_height - 9.0, seat_width - 30.0, seat_depth - 34.0, 112.0),
            (0.0, 7.0, seat_height, seat_width - 92.0, seat_depth - 102.0, 118.0),
        ]
    )
    seat_cushion = _tag(seat_cushion, "Upholstery_Seat", upholstery_color)

    # The molded black pan remains visible beneath the cushion at the sides and
    # rear and overlaps the tilt housing as a plausible load path.
    seat_pan = _rounded_loft(
        [
            (0.0, 5.0, pan_bottom, seat_width - 70.0, seat_depth - 70.0, 70.0),
            (0.0, -1.0, pan_bottom + 13.0, seat_width - 18.0, seat_depth - 22.0, 92.0),
            (0.0, -5.0, pan_bottom + 29.0, seat_width - 4.0, seat_depth - 8.0, 100.0),
        ]
    )
    seat_pan = _tag(seat_pan, "Plastic_Seat_Pan", plastic_color)

    # --- Back upholstery and shell --------------------------------------
    # The lumbar band carries the deepest foam; the shoulders and lower edge
    # tuck inward. A related, larger 16–31mm-deep shell remains visible as a
    # thin perimeter and rear skin instead of a second upholstered slab.
    back_cushion_local = _rounded_loft(
        [
            (0.0, -17.0, 10.0, back_width - 178.0, 43.0, 20.0),
            (0.0, -21.0, 44.0, back_width - 58.0, 61.0, 29.0),
            (0.0, -24.0, back_height * 0.34, back_width - 20.0, 80.0, 38.0),
            (0.0, -22.0, back_height * 0.64, back_width - 34.0, 70.0, 33.0),
            (0.0, -17.0, back_height - 46.0, back_width - 88.0, 52.0, 24.0),
            (0.0, -11.0, back_height - 15.0, back_width - 158.0, 31.0, 15.0),
        ]
    )
    back_shell_local = _rounded_loft(
        [
            (0.0, 8.0, 0.0, back_width - 150.0, 20.0, 9.0),
            (0.0, 10.0, 35.0, back_width - 34.0, 27.0, 12.0),
            (0.0, 12.0, back_height * 0.32, back_width, 31.0, 14.0),
            (0.0, 12.0, back_height * 0.64, back_width - 10.0, 29.0, 13.0),
            (0.0, 10.0, back_height - 35.0, back_width - 68.0, 24.0, 11.0),
            (0.0, 8.0, back_height, back_width - 138.0, 16.0, 7.0),
        ]
    )
    back_pose = Pos(0, seat_depth * 0.39, seat_height + 24.0) * Rot(-recline, 0, 0)
    back_cushion = _tag(back_pose * back_cushion_local, "Upholstery_Back", upholstery_color)
    back_shell = _tag(back_pose * back_shell_local, "Plastic_Back_Shell_Rim", plastic_color)

    # One broad reclining blade connects the mechanism and shell. It grows in
    # width toward the back instead of exposing a rejected ladder frame.
    back_spine = _rounded_loft(
        [
            (0.0, 88.0, seat_height - 146.0, 112.0, 62.0, 22.0),
            (0.0, 124.0, seat_height - 74.0, 92.0, 51.0, 19.0),
            (0.0, 161.0, seat_height + 18.0, 112.0, 44.0, 18.0),
            (0.0, 193.0, seat_height + 114.0, 154.0, 35.0, 15.0),
        ]
    )
    back_spine = _tag(back_spine, "Plastic_Back_Spine", plastic_color)

    # --- Under-seat mechanism -------------------------------------------
    # A layered casting, transverse pivot barrel, and side caps make the
    # synchro-tilt pack legible without projector-scale microdetail.
    tilt_housing = _rounded_loft(
        [
            (0.0, 24.0, seat_height - 154.0, 205.0, 156.0, 34.0),
            (0.0, 18.0, seat_height - 142.0, 252.0, 206.0, 40.0),
            (0.0, 23.0, seat_height - 103.0, 268.0, 222.0, 45.0),
            (0.0, 9.0, seat_height - 82.0, 226.0, 192.0, 38.0),
        ]
    )
    pivot = Pos(0, 58.0, seat_height - 99.0) * (
        Rot(0, 90, 0)
        * Cylinder(27.0, 292.0, align=(Align.CENTER, Align.CENTER, Align.CENTER))
    )
    left_cap = Pos(-151.0, 58.0, seat_height - 99.0) * (
        Rot(0, 90, 0)
        * Cylinder(32.0, 16.0, align=(Align.CENTER, Align.CENTER, Align.CENTER))
    )
    right_cap = Pos(151.0, 58.0, seat_height - 99.0) * (
        Rot(0, 90, 0)
        * Cylinder(32.0, 16.0, align=(Align.CENTER, Align.CENTER, Align.CENTER))
    )
    mechanism_parts = [tilt_housing, pivot, left_cap, right_cap]
    for index, shape in enumerate(mechanism_parts):
        mechanism_parts[index] = _tag(shape, "Plastic_Tilt_Mechanism", plastic_color)

    # One visible adjustment paddle establishes function without a cluster of
    # unstable sub-pixel knobs.
    lever = Pos(173.0, -26.0, seat_height - 122.0) * (
        Rot(0, 90, 0)
        * Cylinder(5.5, 104.0, align=(Align.CENTER, Align.CENTER, Align.CENTER))
    )
    lever = _tag(lever, "Metal_Adjustment_Lever", metal_color)
    lever_knob = Pos(225.0, -26.0, seat_height - 122.0) * Sphere(13.0)
    lever_knob = _tag(lever_knob, "Plastic_Adjustment_Paddle", plastic_color)

    # --- T-arms -----------------------------------------------------------
    # Broad lower shrouds taper into narrower adjustable posts. Pads follow the
    # seat axis and meet the posts directly, with no loop or floating bracket.
    arm_parts = []
    for side in (-1, 1):
        x = side * (seat_width / 2.0 + 18.0)
        stalk = _rounded_loft(
            [
                (x, 68.0, seat_height - 92.0, 39.0, 78.0, 13.0),
                (x, 71.0, seat_height - 38.0, 35.0, 63.0, 12.0),
                (x, 43.0, seat_height + 104.0, 28.0, 49.0, 10.0),
                (x, 10.0, seat_height + 188.0, 37.0, 66.0, 13.0),
            ]
        )
        stalk = _tag(stalk, "Plastic_T_Arm_Support", plastic_color)
        pad = _rounded_loft(
            [
                (x, -18.0, seat_height + 184.0, 62.0, 220.0, 24.0),
                (x, -23.0, seat_height + 195.0, 70.0, 238.0, 28.0),
                (x, -28.0, seat_height + 211.0, 62.0, 220.0, 27.0),
            ]
        )
        pad = _tag(pad, "Plastic_T_Arm_Pad", plastic_color)
        arm_parts.extend([stalk, pad])

    # --- Five-star base and twin-wheel casters ---------------------------
    base_parts = [
        _tag(Pos(0, 0, 78.0) * Cone(62.0, 47.0, 55.0), "Plastic_Base_Hub", plastic_color)
    ]
    spoke = _base_spoke(base_radius)
    caster_parts = _caster_parts(base_radius)
    for angle in range(0, 360, 72):
        base_parts.append(
            _tag(Rot(0, 0, angle) * spoke, "Plastic_Tapered_Base_Spoke", plastic_color)
        )
        for caster_part in caster_parts:
            base_parts.append(
                _tag(Rot(0, 0, angle) * caster_part, "Plastic_Twin_Wheel_Caster", plastic_color)
            )

    # --- Pneumatic lift --------------------------------------------------
    lower_sleeve = Pos(0, 0, 116.0) * Cone(39.0, 31.0, 137.0)
    lower_sleeve = _tag(lower_sleeve, "Plastic_Lift_Lower_Collar", plastic_color)
    upper_collar = Pos(0, 0, seat_height - 175.0) * Cone(34.0, 29.0, 45.0)
    upper_collar = _tag(upper_collar, "Plastic_Lift_Upper_Collar", plastic_color)

    gas_post = Pos(0, 0, 230.0) * Cylinder(23.0, seat_height - 360.0)
    gas_post = _tag(gas_post, "Metal_Gas_Post", metal_color)
    top_post = Pos(0, 0, seat_height - 142.0) * Cylinder(27.0, 28.0)
    top_post = _tag(top_post, "Metal_Gas_Post", metal_color)

    # Intersecting child solids preserve stable, material-ready spatial regions
    # in the GLB without triangulating hidden CAD booleans. Each member overlaps
    # the support that carries it; the object is an assembly, not a print.
    chair = Compound(
        children=[
            seat_cushion,
            seat_pan,
            back_cushion,
            back_shell,
            back_spine,
            *mechanism_parts,
            lever,
            lever_knob,
            *arm_parts,
            *base_parts,
            lower_sleeve,
            upper_collar,
            gas_post,
            top_post,
        ]
    )
    chair.label = "Office_Chair"
    return chair
