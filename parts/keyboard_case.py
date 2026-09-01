from math import atan2, degrees

from nurb import *

# The keyboard's case, for the talk's desk (src/scene/Props.jsx). The caps are
# a separate part (`keycap`) instanced across it by the scene.
#
# RENDER ASSET — never printed. Ignore printability findings.
#
# A real board is a WEDGE: the back edge stands higher than the front so the
# top surface tilts toward you. That tilt is most of what reads as a keyboard
# from across a desk — a flat slab reads as a book. The top is recessed into a
# tray so the caps sit down inside a lip rather than perching on a plate.
#
# Scale: mm. Sized for a 60% layout at 19.05mm pitch.


@part
def keyboard_case(
    board_width=300.0,
    board_depth=108.0,
    front_height=13.0,
    back_height=24.0,
    tray_inset=9.0,
    tray_depth=6.5,
    corner_radius=5.0,
    draft=False,
):
    """
    board_width: how wide the whole case is
    board_depth: how far it reaches from the front edge to the back
    front_height: how tall the case is at the front edge, nearest you
    back_height: how tall it is at the back — larger, which gives it its tilt
    tray_inset: how far the lip sits in from the outside edge
    tray_depth: how deep the caps sit down inside the lip
    corner_radius: how rounded the case corners are looking down on it
    """

    # The wedge, built as an extruded SIDE PROFILE — a trapezoid in the YZ
    # plane, swept across the board's width. Front and back walls stay vertical
    # and only the top plane tilts, which is how a case is actually moulded.
    #
    # (Cutting the tilt out of a prism with a rotated box, which is the obvious
    # move, is not worth attempting: getting the rotation centre wrong eats the
    # case, and the first attempt here left it 72mm deep instead of 108.)
    rise = back_height - front_height
    half_d = board_depth / 2

    with BuildPart() as shell:
        with BuildSketch(Plane.YZ) as profile:
            with BuildLine():
                Polyline(
                    (-half_d, 0),
                    (half_d, 0),
                    (half_d, back_height),
                    (-half_d, front_height),
                    close=True,
                )
            make_face()
        extrude(amount=board_width / 2, both=True)

    case = shell.part
    case = fillet(case.edges().filter_by(Axis.Z), corner_radius)

    # Tray: the recess the caps sit down inside. Rotated to match the top plane
    # so its floor stays parallel to the surface the caps sit on.
    tilt = degrees(atan2(rise, board_depth))
    mid_z = (front_height + back_height) / 2
    tray_block = 60.0

    tray = (
        Pos(0, 0, mid_z)
        * Rot(tilt, 0, 0)
        * Pos(0, 0, tray_block / 2 - tray_depth)
        * Box(
            board_width - tray_inset * 2,
            board_depth - tray_inset * 2,
            tray_block,
        )
    )
    case = case - tray

    if draft:
        return case

    return polish(case, case.edges(), 1.2)
