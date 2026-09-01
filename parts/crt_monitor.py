from nurb import *

# A widescreen CRT, in the construction language of the Sony GDM-FW900.
#
# This is a RENDER asset, not a print. Its contract with the talk is stricter
# than an ordinary prop: model in millimetres, X is width, Y is up, the screen
# faces +Z, the visible glass is scaled from screen_width, and the stand must
# still land on Y=-288 after that uniform runtime scale is applied.
#
# The opening is immutable: 523 x 295mm centred at X=0 / Y=-17. Everything
# around it can become more assertive, but changing that opening breaks the
# live glass, the cold-open overscan, and the camera reveal.


@part
def crt_monitor(
    screen_width=520.0,
    screen_height=292.0,
    bezel_side=43.0,
    bezel_chin=78.0,
    face_depth=44.0,
    tube_depth=380.0,
    tube_taper=0.45,
    neck_length=80.0,
    stand_height=97.0,
    stand_width=440.0,
    stand_depth=360.0,
    corner_radius=28.0,
    draft=False,
):
    """
    screen_width: runtime scale reference for the live 520mm-wide glass
    screen_height: runtime scale reference for the live 292mm-high glass
    bezel_side: side and top frame width around the authored opening
    bezel_chin: lower frame depth below the authored opening
    face_depth: depth of the stepped front housing before the tube shoulder
    tube_depth: depth from the front housing to the rear service collar
    tube_taper: rear shell width as a fraction of the front housing
    neck_length: depth of the rear electron-gun neck
    stand_height: vertical mass from the base into the tube cradle
    stand_width: width of the integrated pedestal footprint
    stand_depth: front-to-back depth of the integrated pedestal footprint
    corner_radius: primary radius carried by the moulded housing corners
    """

    opening_w = screen_width + 3.0
    opening_h = screen_height + 3.0
    screen_y = -17.0

    # The opening is intentionally high in the face. The previous model used
    # the same Y centre for opening and housing, which split the extra height
    # evenly and made its nominally deep chin read like a flat-panel bezel.
    face_w = opening_w + bezel_side * 2.0
    face_h = opening_h + bezel_side + bezel_chin
    face_y = screen_y + (bezel_side - bezel_chin) / 2.0
    face_top = face_y + face_h / 2.0
    face_bottom = face_y - face_h / 2.0

    # ── Stepped front housing ──────────────────────────────────────────────
    # A broad structural face stops behind a smaller fascia. From head-on this
    # gives the opening a real moulded surround; obliquely it produces two
    # highlight planes before the shoulder begins.
    face_shell = Pos(0, face_y, -(face_depth + 6.0) / 2.0) * Box(
        face_w, face_h, face_depth - 6.0
    )
    face_shell = fillet(face_shell.edges().filter_by(Axis.Z), corner_radius)

    fascia = Pos(0, face_y, -4.0) * Box(face_w - 10.0, face_h - 10.0, 8.0)
    fascia = fillet(
        fascia.edges().filter_by(Axis.Z), max(8.0, corner_radius - 5.0)
    )

    # ── Heavy tube shoulder and rear shell ─────────────────────────────────
    # The first two stations hold almost the full face section. The shell only
    # gathers decisively after that shoulder, so 30° and 70° views show a heavy
    # cabinet rather than one long wedge attached to a flat frame.
    def tube_section(width_scale, height_scale, y, radius):
        # RectangleRounded auto-adds while a BuildSketch context is active.
        # Locations applies the offset once; constructing then calling add()
        # would leave both the centred and shifted profiles in the sketch.
        with Locations((0, y)):
            RectangleRounded(
                face_w * width_scale,
                face_h * height_scale,
                radius,
            )

    with BuildPart() as tube:
        with BuildSketch(Plane.XY.offset(-face_depth)):
            tube_section(0.995, 0.99, face_y, corner_radius)
        with BuildSketch(Plane.XY.offset(-face_depth - 72.0)):
            tube_section(0.975, 0.955, face_y + 6.0, corner_radius * 0.96)
        with BuildSketch(Plane.XY.offset(-face_depth - tube_depth * 0.48)):
            tube_section(0.88, 0.84, face_y + 14.0, corner_radius * 0.84)
        with BuildSketch(Plane.XY.offset(-face_depth - tube_depth * 0.76)):
            tube_section(0.70, 0.66, face_y + 20.0, corner_radius * 0.68)
        with BuildSketch(Plane.XY.offset(-face_depth - tube_depth)):
            tube_section(
                tube_taper,
                tube_taper * 0.98,
                face_y + 23.0,
                corner_radius * 0.52,
            )
        loft(ruled=True)

    body = face_shell + fascia + tube.part

    # The neck terminates as nested manufactured sections instead of a naked
    # funnel. Their overlap is deliberate: the GLB must remain one solid.
    tube_end_z = -face_depth - tube_depth
    rear_y = face_y + 23.0
    rear_radius = face_h * tube_taper * 0.29

    service_collar = Pos(0, rear_y, tube_end_z - 10.0) * Cylinder(
        rear_radius * 1.34, 32.0
    )
    neck = Pos(0, rear_y, tube_end_z - 50.0) * Cylinder(
        rear_radius, neck_length
    )
    rear_cap = Pos(0, rear_y, tube_end_z - neck_length - 9.0) * Cylinder(
        rear_radius * 0.82, 18.0
    )
    body = body + service_collar + neck + rear_cap

    # The runtime cable begins near this lower-rear point. A stout gland and
    # blind socket make the cable emerge from hardware rather than a spline
    # disappearing into an anonymous surface.
    gland_x = 14.0
    gland_y = -49.0
    gland_z = -454.0
    cable_gland = Pos(gland_x, gland_y, gland_z) * Cylinder(15.0, 28.0)
    body = body + cable_gland
    cable_socket = Pos(gland_x, gland_y, gland_z - 15.0) * Cylinder(7.0, 5.0)
    body = body - cable_socket

    # ── Immutable glass opening and stepped bezel seat ─────────────────────
    # The deepest cut is exactly 523 x 295mm at X=0 / Y=-17. Its floor remains
    # at Z=-12 so the runtime glass, shifted to Z=-10 in CAD space, sits inside
    # the pocket without z-fighting. Two larger shallower cuts make the bezel
    # step visibly from the front without altering that fit-critical opening.
    opening = Pos(0, screen_y, -4.0) * Box(opening_w, opening_h, 16.0)
    opening = fillet(
        opening.edges().filter_by(Axis.Z), corner_radius * 0.36
    )
    middle_reveal = Pos(0, screen_y, -1.5) * Box(
        opening_w + 12.0, opening_h + 12.0, 7.0
    )
    middle_reveal = fillet(
        middle_reveal.edges().filter_by(Axis.Z), corner_radius * 0.45
    )
    outer_reveal = Pos(0, screen_y, -0.75) * Box(
        opening_w + 28.0, opening_h + 28.0, 3.5
    )
    outer_reveal = fillet(
        outer_reveal.edges().filter_by(Axis.Z), corner_radius * 0.56
    )
    body = body - opening - middle_reveal - outer_reveal

    # ── Front construction and concealed control barrel ───────────────────
    # FW900-era controls live in a rotating cylinder tucked under the glass,
    # not in a flat row stamped into a thin bezel. The barrel is cut into a
    # larger cylindrical bay and reconnects to the housing behind the pocket.
    # Its small flat rail preserves the existing runtime button/LED centres.
    control_x = -191.5
    control_y = -190.0
    control_pocket = (
        Pos(control_x, control_y, -18.5)
        * Rot(0, 90, 0)
        * Cylinder(25.0, 160.0)
    )
    body = body - control_pocket

    control_barrel = (
        Pos(control_x, control_y, -23.5)
        * Rot(0, 90, 0)
        * Cylinder(23.5, 146.0)
    )
    control_rail = Pos(control_x, -175.0, -4.0) * Box(132.0, 12.0, 8.0)
    body = body + control_barrel + control_rail

    # Three broad controls retain the exact CAD centres consumed by
    # Monitor.jsx. The first insert already carries the live green status LED.
    for x, width in ((-222.0, 14.0), (-194.0, 18.0), (-161.0, 18.0)):
        button_recess = Pos(x, -175.0, -1.5) * Box(width, 9.0, 4.0)
        body = body - button_recess

    # A lower fascia split and two short returns make the chin read as a service
    # panel. These are broad, front-facing construction gaps, not decals.
    lower_split = Pos(0, -221.0, -1.2) * Box(face_w - 62.0, 2.8, 4.0)
    lower_returns = None
    for side in (-1, 1):
        seam = Pos(side * (face_w / 2.0 - 31.0), -218.0, -1.2) * Box(
            2.8, 42.0, 4.0
        )
        lower_returns = seam if lower_returns is None else lower_returns + seam
    body = body - lower_split - lower_returns

    # ── Stable side ventilation and shell split ────────────────────────────
    # Four broad slots per side survive the authored wide views. Their depth
    # exposes a real cut wall while avoiding the noisy grille of many thin ribs.
    vent_cuts = None
    for side in (-1, 1):
        for row in range(4):
            vent = Pos(side * 280.0, 20.0 + row * 18.0, -176.0) * Box(
                82.0, 8.0, 88.0
            )
            vent_cuts = vent if vent_cuts is None else vent_cuts + vent
    body = body - vent_cuts

    # The U-shaped mould split lands where the held shoulder begins to gather.
    # It reads at 30° and 70° without multiplying into unstable micro-lines.
    shoulder_z = -face_depth - 72.0
    top_seam = Pos(0, face_top - 5.0, shoulder_z) * Box(
        face_w - 54.0, 10.0, 2.8
    )
    shoulder_seams = top_seam
    for side in (-1, 1):
        side_seam = Pos(side * (face_w * 0.472), face_y + 3.0, shoulder_z) * Box(
            12.0, face_h - 56.0, 2.8
        )
        shoulder_seams = shoulder_seams + side_seam
    body = body - shoulder_seams

    # ── Integrated pedestal, pivot and base ────────────────────────────────
    # Keep the runtime desk contract exact: the lowest face is Y=-288. Unlike
    # the former thin plate and cone, this is a low, broad rotating footprint,
    # a buried load-bearing pedestal, a yoke, and a transverse tilt barrel.
    plate_bottom = -288.0
    base_h = 22.0
    stand_z = -225.0

    base = Pos(0, plate_bottom + base_h / 2.0, stand_z) * Box(
        stand_width, base_h, stand_depth
    )
    base = fillet(base.edges().filter_by(Axis.Y), 50.0)

    upper_base = Pos(0, -263.0, stand_z) * Box(
        stand_width - 46.0, 10.0, stand_depth - 48.0
    )
    upper_base = fillet(upper_base.edges().filter_by(Axis.Y), 42.0)

    turntable = (
        Pos(0, -255.0, stand_z)
        * Rot(-90, 0, 0)
        * Cylinder(148.0, 18.0)
    )
    pedestal = (
        Pos(0, -226.0, stand_z)
        * Rot(-90, 0, 0)
        * Cone(150.0, 108.0, stand_height - 27.0)
    )

    pivot_y = -203.0
    pivot_z = -187.0
    pivot_length = 300.0
    pivot = (
        Pos(0, pivot_y, pivot_z)
        * Rot(0, 90, 0)
        * Cylinder(46.0, pivot_length)
    )

    # Paired yoke cheeks bridge the pedestal and pivot and make their load path
    # readable in front and three-quarter views.
    yoke = None
    for side in (-1, 1):
        cheek = Pos(side * 103.0, -220.0, -205.0) * Box(58.0, 72.0, 96.0)
        cheek = fillet(cheek.edges().filter_by(Axis.Y), 15.0)
        yoke = cheek if yoke is None else yoke + cheek

    body = body + base + upper_base + turntable + pedestal + pivot + yoke

    # Blind pivot caps are the only stand hardware. They are deliberately large
    # enough to remain stable at the 70° authored profile camera.
    for side in (-1, 1):
        pivot_cap = (
            Pos(side * (pivot_length / 2.0 - 1.5), pivot_y, pivot_z)
            * Rot(0, 90, 0)
            * Cylinder(24.0, 7.0)
        )
        body = body - pivot_cap

    if draft:
        return body

    # Preserve deliberate concave construction gaps and spend the finishing
    # geometry only on convex silhouette/highlight edges.
    blocked = set(concave_edges(body))
    exposed = [edge for edge in body.edges() if edge not in blocked]
    return polish(body, exposed, 2.5)
