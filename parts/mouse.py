from math import cos, pi, sin

from nurb import *

# A late-1990s/early-2000s corded two-button wheel mouse for the talk's
# foreground desk.
#
# RENDER ASSET — never printed. Scale is millimetres, the front points toward
# -Y, and +Z is up. The shell, controls, feet, strain relief, and cable are kept
# as one connected solid so a failed union is still caught by `nurb check`.


def _densify(stations, subdivisions):
    """Sample smooth Catmull-Rom dimensions between authored stations."""
    dense = []
    for station_index, (start, end) in enumerate(zip(stations, stations[1:])):
        previous = stations[max(station_index - 1, 0)]
        following = stations[min(station_index + 2, len(stations) - 1)]
        for step in range(subdivisions):
            amount = step / subdivisions
            amount_2 = amount * amount
            amount_3 = amount_2 * amount
            values = [start[0] + (end[0] - start[0]) * amount]
            for index in range(1, len(start)):
                value = 0.5 * (
                    2 * start[index]
                    + (-previous[index] + end[index]) * amount
                    + (
                        2 * previous[index]
                        - 5 * start[index]
                        + 4 * end[index]
                        - following[index]
                    )
                    * amount_2
                    + (
                        -previous[index]
                        + 3 * start[index]
                        - 3 * end[index]
                        + following[index]
                    )
                    * amount_3
                )
                values.append(max(value, 0.5) if index == 1 else value)
            dense.append(tuple(values))
    dense.append(stations[-1])
    return tuple(dense)


def _upper_profile(width, bottom, top, crown_offset=0.0, samples=32):
    """Create one dense, visually smooth asymmetric palm section."""
    half = width / 2
    rise = top - bottom
    section_offset = crown_offset * 0.72
    points = []
    for index in range(samples + 1):
        angle = -pi / 2 + pi * index / samples
        crown_weight = max(cos(angle), 0.0)
        x = (
            section_offset
            + half * sin(angle)
            + crown_offset * 0.28 * crown_weight**2
        )
        z = bottom + rise * crown_weight**0.76
        points.append((x, z))
    Polygon(*points)


def _upper_shell(stations, seam_z):
    """Dense ruled loft for a smooth silhouette at a controlled mesh cost.

    Eight subdivisions per station pair: at four, the ring spacing was ~3.5mm
    and the palm shaded as contour terraces under the scene's key light — the
    "quilted" mouse. The doubled sampling is what smooth normals need to
    actually read as one continuous moulding.
    """
    with BuildPart() as shell:
        for y, width, top, crown_offset in _densify(stations, 8):
            with BuildSketch(Plane.XZ.offset(y)):
                _upper_profile(width, seam_z, top, crown_offset, samples=40)
        loft(ruled=True)
    return shell.part


def _lower_shell(stations, bottom, top):
    """Tapered lower moulding with softened manufactured corners."""
    with BuildPart() as base:
        for y, width, x_offset in _densify(stations, 4):
            half = width / 2
            bevel = min(2.6, width * 0.22, (top - bottom) * 0.38)
            with BuildSketch(Plane.XZ.offset(y)):
                Polygon(
                    (x_offset - half + bevel, bottom),
                    (x_offset - half, bottom + bevel),
                    (x_offset - half, top - bevel),
                    (x_offset - half + bevel, top),
                    (x_offset + half - bevel, top),
                    (x_offset + half, top - bevel),
                    (x_offset + half, bottom + bevel),
                    (x_offset + half - bevel, bottom),
                )
        loft(ruled=True)
    return base.part


def _internal_shell_bridge(stations, bottom, top, inset=7.0):
    """Hidden core joining the visibly separate upper and lower mouldings."""
    with BuildPart() as bridge:
        for y, width, x_offset in _densify(stations, 2):
            inner_width = max(width - inset * 2, 1.0)
            half = inner_width / 2
            bevel = min(1.8, inner_width * 0.22, (top - bottom) * 0.38)
            with BuildSketch(Plane.XZ.offset(y)):
                Polygon(
                    (x_offset - half + bevel, bottom),
                    (x_offset - half, bottom + bevel),
                    (x_offset - half, top - bevel),
                    (x_offset - half + bevel, top),
                    (x_offset + half - bevel, top),
                    (x_offset + half, top - bevel),
                    (x_offset + half, bottom + bevel),
                    (x_offset + half - bevel, bottom),
                )
        loft(ruled=True)
    return bridge.part


def _round_prism(radius, height, sides=16):
    with BuildPart() as prism:
        with BuildSketch():
            RegularPolygon(radius, sides)
        extrude(amount=height)
    return prism.part


def _tapered_prism(radius_1, radius_2, height, sides=16):
    with BuildPart() as taper:
        with BuildSketch(Plane.XY):
            RegularPolygon(radius_1, sides)
        with BuildSketch(Plane.XY.offset(height)):
            RegularPolygon(radius_2, sides)
        loft(ruled=True)
    return taper.part


def _capsule_pad(x, y, width, length, height):
    straight = max(length - width, 0.1)
    pad = Pos(x, y, 0) * Box(
        width,
        straight,
        height,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    )
    end = straight / 2
    pad += Pos(x, y - end, 0) * _round_prism(width / 2, height)
    pad += Pos(x, y + end, 0) * _round_prism(width / 2, height)
    return pad


def _capsule_cut(width, length, height):
    """Vertical capsule used for the clean scroll-wheel well."""
    straight = max(length - width, 0.1)
    cut = Box(
        width,
        straight,
        height,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    )
    end = straight / 2
    cut += Pos(0, -end, 0) * _round_prism(width / 2, height, 20)
    cut += Pos(0, end, 0) * _round_prism(width / 2, height, 20)
    return cut


def _cable(radius):
    """Short cord that drops naturally from the nose onto the desk."""
    points = (
        Vector(0.0, -75.5, 8.0),
        Vector(0.2, -82.5, 6.2),
        Vector(1.8, -91.5, 3.4),
        Vector(5.5, -101.5, radius + 0.25),
        Vector(11.5, -111.0, radius + 0.20),
        Vector(19.0, -119.0, radius + 0.20),
    )
    cable = None
    overlap = radius * 0.55
    for start, end in zip(points, points[1:]):
        direction = end - start
        unit = direction.normalized()
        segment_start = start - unit * overlap
        segment = Plane(origin=segment_start, z_dir=direction) * _round_prism(
            radius,
            direction.length + overlap * 2,
            12,
        )
        cable = segment if cable is None else cable + segment
    return cable


@part
def mouse(
    body_length=130.0,
    body_width=69.0,
    body_height=43.0,
    seam_gap=0.75,
    button_gap=1.25,
    button_break=1.1,
    wheel_diameter=17.5,
    wheel_width=6.8,
    cable_radius=1.55,
    thumb_scallop_depth=1.6,
    draft=False,
):
    """
    body_length: mouse body length from the front shell to the heel
    body_width: widest point across the palm shell
    body_height: height of the rear palm crown above the desk
    seam_gap: visible gap between the upper and lower shell mouldings
    button_gap: split separating the left and right button caps
    button_break: gap separating both button caps from the palm shell
    wheel_diameter: outside diameter of the rubber scroll wheel
    wheel_width: width of the rubber scroll wheel
    cable_radius: thickness of the flexible front cable
    thumb_scallop_depth: depth of the left-side thumb support scallop
    """
    if body_length < 125.0 or body_length > 132.0:
        reject(
            "body_length must stay between 125 and 132mm for the intended period mouse silhouette",
            param="body_length",
        )
    if body_width < 65.0 or body_width > 70.0:
        reject(
            "body_width must stay between 65 and 70mm for a believable full-size mouse",
            param="body_width",
        )
    if body_height < 38.0 or body_height > 44.0:
        reject(
            "body_height must stay between 38 and 44mm for the intended palm support",
            param="body_height",
        )

    half = body_length / 2
    lower_bottom = 1.0
    lower_top = 8.0
    seam_z = lower_top + seam_gap

    # The crown sits behind centre, with its mass shifted slightly to the right
    # over the palm. The broad left flank is later relieved for the thumb.
    upper_stations = (
        (-half, 1.0, seam_z + 0.25, 0.0),
        (-half + 4.0, body_width * 0.62, 13.0, 0.1),
        (-half + 11.0, body_width * 0.79, 18.5, 0.4),
        (-half + 25.0, body_width * 0.88, 28.5, 0.9),
        (-half + 45.0, body_width * 0.96, 37.0, 1.5),
        (-half + 70.0, body_width, body_height * 0.97, 2.0),
        (-half + 93.0, body_width * 0.98, body_height, 2.3),
        (-half + 112.0, body_width * 0.86, body_height * 0.84, 1.8),
        (-half + 125.0, body_width * 0.58, body_height * 0.47, 0.8),
        (half, 1.0, seam_z + 0.25, 0.0),
    )
    lower_stations = tuple(
        (y, max(width - 1.0, 0.5), crown_offset * 0.60)
        for y, width, _, crown_offset in upper_stations
    )

    upper = _upper_shell(upper_stations, seam_z)
    lower = _lower_shell(lower_stations, lower_bottom, lower_top)
    bridge = _internal_shell_bridge(
        lower_stations,
        lower_top - 0.9,
        seam_z + 2.8,
    )
    body = upper + lower + bridge

    # A broad shallow spherical relief gives the left side a real thumb
    # scallop. Its large radius avoids the circular dimple of the old side cut.
    scallop_radius = 150.0
    scallop_center_x = -(
        body_width / 2 + scallop_radius - thumb_scallop_depth
    )
    body -= Pos(scallop_center_x, 9.0, 18.0) * Sphere(scallop_radius)

    # Four broad PTFE-style glides, not the curved lower shell, establish the
    # desk plane. Each overlaps the lower moulding by half a millimetre.
    for x, y, width, length in (
        (-22.0, -43.0, 8.5, 25.0),
        (22.0, -43.0, 8.5, 25.0),
        (-20.0, 42.0, 9.0, 24.0),
        (20.0, 42.0, 9.0, 24.0),
    ):
        body += _capsule_pad(x, y, width, length, 1.55)

    # The centre split reaches the front edge, and the transverse break makes
    # the two button caps visibly separate moulded pieces rather than lines
    # painted onto one continuous wedge.
    button_rear_y = -14.0
    split_length = button_rear_y + half + 2.0
    body -= Pos(0, -half + split_length / 2 - 1.0, 10.4) * Box(
        button_gap,
        split_length + 2.0,
        body_height,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    )
    body -= Pos(0, button_rear_y, 15.0) * Box(
        body_width * 0.91,
        button_break,
        body_height,
        align=(Align.CENTER, Align.CENTER, Align.MIN),
    )

    # The wheel sits in a rounded well between the buttons. A hidden axle joins
    # the dark rubber wheel to both shell walls and preserves one connected
    # render asset.
    wheel_y = -35.0
    slot_width = wheel_width + 4.6
    slot_length = wheel_diameter + 10.0
    slot_z = 16.0
    body -= Pos(0, wheel_y, slot_z) * _capsule_cut(
        slot_width,
        slot_length,
        body_height,
    )

    wheel_z = 25.6
    wheel = (
        Pos(0, wheel_y, wheel_z)
        * Rot(0, 90, 0)
        * Cylinder(
            wheel_diameter / 2,
            wheel_width,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    )
    for angle in range(0, 360, 45):
        tread = (
            Pos(0, wheel_y, wheel_z)
            * Rot(angle, 0, 0)
            * Pos(0, 0, wheel_diameter / 2 - 0.10)
            * Box(
                wheel_width + 1.0,
                0.72,
                0.72,
                align=(Align.CENTER, Align.CENTER, Align.CENTER),
            )
        )
        wheel -= tread

    axle = (
        Pos(0, wheel_y, wheel_z)
        * Rot(0, 90, 0)
        * Cylinder(
            1.55,
            slot_width + 5.0,
            align=(Align.CENTER, Align.CENTER, Align.CENTER),
        )
    )
    body += wheel + axle

    # A ribbed tapered boot exits the front shell before the cable drops to the
    # desk. The lead is deliberately short: enough to prove it is wired in the
    # closest shot without snaking through the rest of the set.
    strain_start_y = -half + 1.0
    strain_z = 8.1
    strain_length = 12.0
    strain = (
        Pos(0, strain_start_y, strain_z)
        * Rot(90, 0, 0)
        * _tapered_prism(4.2, 2.5, strain_length, 16)
    )
    for distance, radius in ((2.4, 4.25), (5.2, 3.75), (8.0, 3.25)):
        strain += (
            Pos(0, strain_start_y - distance - 0.45, strain_z)
            * Rot(90, 0, 0)
            * _round_prism(radius, 0.9, 16)
        )
    body += strain + _cable(cable_radius)

    # A restrained underside sensor pocket supports the early optical-mouse era
    # without adding wireless battery-door logic to a clearly corded design.
    body -= Pos(0, 5.0, 0.35) * _round_prism(4.8, 1.0, 20)

    # Smooth lofts carry the silhouette and highlights. Blanket polish would
    # erase the moulding gaps and button construction, so it is intentionally
    # omitted for this non-printable foreground render asset.
    return body
